using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Digests;
using Org.BouncyCastle.Crypto.Encodings;
using Org.BouncyCastle.Crypto.Engines;
using Org.BouncyCastle.Crypto.Modes;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Pkcs;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.X509;
using System.Security.Cryptography;

namespace ModularCA.Shared.Utils
{
    /// <summary>
    /// Provides AES-GCM-based encryption and decryption of private keys using public key wrapping.
    /// </summary>
    public static class KeyEncryptionUtil
    {
        /// <summary>
        /// Encrypts a private key using AES-GCM with the AES key wrapped by the given public key.
        /// For RSA keys, wrapping uses RSA-OAEP. For non-RSA keys (ECDSA, EdDSA, PQC),
        /// wrapping derives the key via HKDF-SHA256(ikm: passphrase, salt: random, info: publicKeyDER).
        /// </summary>
        /// <param name="publicKey">The public key used for key wrapping.</param>
        /// <param name="privateKey">The private key to encrypt.</param>
        /// <param name="passphrase">
        /// Secondary passphrase bytes used as IKM for HKDF wrap key derivation (required for non-RSA keys).
        /// </param>
        public static (byte[] aesKeyEncrypted, byte[] iv, byte[] encryptedPrivateKey) EncryptPrivateKey(
        AsymmetricKeyParameter publicKey,
        AsymmetricKeyParameter privateKey,
        byte[]? passphrase = null)
        {
            var privateKeyDer = PrivateKeyInfoFactory.CreatePrivateKeyInfo(privateKey).GetDerEncoded();

            // Generate 256-bit AES key
            var aesKey = new byte[32];
            var rng = new SecureRandom();
            rng.NextBytes(aesKey);

            // Generate 96-bit IV for AES-GCM
            var iv = new byte[12];
            rng.NextBytes(iv);

            // AES-GCM encrypt private key
            var gcm = new GcmBlockCipher(new Org.BouncyCastle.Crypto.Engines.AesEngine());
            var keyParam = new KeyParameter(aesKey);
            var gcmParams = new AeadParameters(keyParam, 128, iv);

            gcm.Init(true, gcmParams);
            var output = new byte[gcm.GetOutputSize(privateKeyDer.Length)];
            var len = gcm.ProcessBytes(privateKeyDer, 0, privateKeyDer.Length, output, 0);
            gcm.DoFinal(output, len);

            // Wrap AES key — algorithm-agnostic
            byte[] encryptedAesKey;
            if (publicKey is RsaKeyParameters rsaPubKey)
            {
                // Wrap with RSA-OAEP using SHA-256 for both OAEP hash and MGF1 hash
                // (NIST SP 800-56B Rev. 2 / FIPS 186-5 compliant). BouncyCastle's default
                // OaepEncoding(RsaEngine) uses SHA-1 on both, which is a deprecation target.
                var rsa = new OaepEncoding(new RsaEngine(), new Sha256Digest(), new Sha256Digest(), null);
                rsa.Init(true, rsaPubKey);
                encryptedAesKey = rsa.ProcessBlock(aesKey, 0, aesKey.Length);
            }
            else
            {
                // For non-RSA keys (ECDSA, EdDSA, PQC), derive wrap key via HKDF-SHA256
                if (passphrase == null || passphrase.Length == 0)
                    throw new ArgumentException("Passphrase is required for non-RSA key wrapping.", nameof(passphrase));

                var pubKeyDer = SubjectPublicKeyInfoFactory.CreateSubjectPublicKeyInfo(publicKey).GetDerEncoded();

                // Generate random 32-byte salt for HKDF
                var hkdfSalt = new byte[32];
                RandomNumberGenerator.Fill(hkdfSalt);

                // HKDF-SHA256 key derivation:
                //   ikm (input key material): secondary keystore passphrase
                //   outputLength: 32 bytes (256-bit AES wrap key)
                //   salt: random 32-byte value (stored in output blob)
                //   info: public key DER (binds wrap key to specific recipient)
                var wrapKey = HKDF.DeriveKey(
                    HashAlgorithmName.SHA256,
                    passphrase,
                    32,
                    hkdfSalt,
                    pubKeyDer);

                var wrapIv = new byte[12];
                rng.NextBytes(wrapIv);
                var wrapGcm = new GcmBlockCipher(new Org.BouncyCastle.Crypto.Engines.AesEngine());
                wrapGcm.Init(true, new AeadParameters(new KeyParameter(wrapKey), 128, wrapIv));
                var wrapOut = new byte[wrapGcm.GetOutputSize(aesKey.Length)];
                var wLen = wrapGcm.ProcessBytes(aesKey, 0, aesKey.Length, wrapOut, 0);
                wrapGcm.DoFinal(wrapOut, wLen);

                // Prepend HKDF salt to the encrypted blob so decrypt can extract it
                // Format: [32-byte HKDF salt][12-byte wrap IV][AES-GCM ciphertext+tag]
                encryptedAesKey = hkdfSalt.Concat(wrapIv).Concat(wrapOut).ToArray();
            }

            return (encryptedAesKey, iv, output);
        }

        /// <summary>
        /// Decrypts a private key from AES-GCM encrypted data using the provided decryption key.
        /// For RSA keys, unwrapping uses RSA-OAEP. For non-RSA keys, the wrap key is derived
        /// via HKDF-SHA256 from the passphrase, the prepended salt, and the public key DER as info.
        /// </summary>
        /// <param name="encryptedAesKey">The wrapped AES key blob (RSA-OAEP or salt+IV+ciphertext for non-RSA).</param>
        /// <param name="iv">The AES-GCM IV for the private key ciphertext.</param>
        /// <param name="encryptedPrivateKey">The AES-GCM encrypted private key bytes.</param>
        /// <param name="decryptionKey">The private key used for unwrapping (RSA) or public key derivation (non-RSA).</param>
        /// <param name="publicKey">Optional explicit public key for non-RSA wrap key derivation.</param>
        /// <param name="passphrase">
        /// Secondary passphrase bytes used as IKM for HKDF wrap key derivation (required for non-RSA keys).
        /// </param>
        public static AsymmetricKeyParameter DecryptPrivateKey(
    byte[] encryptedAesKey,
    byte[] iv,
    byte[] encryptedPrivateKey,
    AsymmetricKeyParameter decryptionKey,
    AsymmetricKeyParameter? publicKey = null,
    byte[]? passphrase = null)
        {
            byte[] aesKey;
            if (decryptionKey is RsaKeyParameters && decryptionKey.IsPrivate)
            {
                // New wrap format uses RSA-OAEP-SHA256/MGF1-SHA256 (see EncryptPrivateKey).
                // Try the new format first; on failure, fall back to the legacy RSA-OAEP-SHA1/MGF1-SHA1
                // blobs that might exist from pre-0.2.1 bootstraps, so existing deployments can still
                // decrypt their stored keys until they are re-wrapped.
                try
                {
                    var rsa = new OaepEncoding(new RsaEngine(), new Sha256Digest(), new Sha256Digest(), null);
                    rsa.Init(false, decryptionKey);
                    aesKey = rsa.ProcessBlock(encryptedAesKey, 0, encryptedAesKey.Length);
                }
                catch
                {
                    var rsaLegacy = new OaepEncoding(new RsaEngine());
                    rsaLegacy.Init(false, decryptionKey);
                    aesKey = rsaLegacy.ProcessBlock(encryptedAesKey, 0, encryptedAesKey.Length);
                }
            }
            else
            {
                // For non-RSA: derive wrap key via HKDF-SHA256, then unwrap AES key
                if (passphrase == null || passphrase.Length == 0)
                    throw new ArgumentException("Passphrase is required for non-RSA key unwrapping.", nameof(passphrase));

                var pubKey = publicKey ?? KeyEncryptionHelper.GetPublicFromPrivate(decryptionKey);
                var pubKeyDer = SubjectPublicKeyInfoFactory.CreateSubjectPublicKeyInfo(pubKey).GetDerEncoded();

                // Extract the 32-byte HKDF salt prepended during encryption
                // Format: [32-byte HKDF salt][12-byte wrap IV][AES-GCM ciphertext+tag]
                var hkdfSalt = encryptedAesKey[..32];
                var wrapIv = encryptedAesKey[32..44];
                var wrapCiphertext = encryptedAesKey[44..];

                // HKDF-SHA256 key derivation (must mirror EncryptPrivateKey):
                //   ikm (input key material): secondary keystore passphrase
                //   outputLength: 32 bytes (256-bit AES wrap key)
                //   salt: 32-byte value extracted from the encrypted blob
                //   info: public key DER (binds wrap key to specific recipient)
                var wrapKey = HKDF.DeriveKey(
                    HashAlgorithmName.SHA256,
                    passphrase,
                    32,
                    hkdfSalt,
                    pubKeyDer);

                var wrapGcm = new GcmBlockCipher(new Org.BouncyCastle.Crypto.Engines.AesEngine());
                wrapGcm.Init(false, new AeadParameters(new KeyParameter(wrapKey), 128, wrapIv));
                aesKey = new byte[wrapGcm.GetOutputSize(wrapCiphertext.Length)];
                var wLen = wrapGcm.ProcessBytes(wrapCiphertext, 0, wrapCiphertext.Length, aesKey, 0);
                wrapGcm.DoFinal(aesKey, wLen);
            }

            // AES-GCM decrypt private key
            var gcm = new GcmBlockCipher(new Org.BouncyCastle.Crypto.Engines.AesEngine());
            var keyParam = new KeyParameter(aesKey);
            var gcmParams = new AeadParameters(keyParam, 128, iv);

            gcm.Init(false, gcmParams);
            var output = new byte[gcm.GetOutputSize(encryptedPrivateKey.Length)];
            var len = gcm.ProcessBytes(encryptedPrivateKey, 0, encryptedPrivateKey.Length, output, 0);
            gcm.DoFinal(output, len);

            return PrivateKeyFactory.CreateKey(output);
        }

    }

    /// <summary>
    /// Helper to derive a public key from a private key for various algorithm types.
    /// </summary>
    internal static class KeyEncryptionHelper
    {
        /// <summary>
        /// Extracts the public key from a private key parameter across RSA, EC, EdDSA, and PQC key types.
        /// </summary>
        internal static AsymmetricKeyParameter GetPublicFromPrivate(AsymmetricKeyParameter privateKey)
        {
            return privateKey switch
            {
                RsaPrivateCrtKeyParameters rsa => new RsaKeyParameters(false, rsa.Modulus, rsa.PublicExponent),
                ECPrivateKeyParameters ec => new ECPublicKeyParameters(ec.AlgorithmName, ec.Parameters.G.Multiply(ec.D), ec.Parameters),
                Ed25519PrivateKeyParameters ed25519 => ed25519.GeneratePublicKey(),
                Ed448PrivateKeyParameters ed448 => ed448.GeneratePublicKey(),
                MLDsaPrivateKeyParameters mlDsa => mlDsa.GetPublicKey(),
                SlhDsaPrivateKeyParameters slhDsa => slhDsa.GetPublicKey(),
                _ => throw new NotSupportedException($"Unsupported key type: {privateKey.GetType().Name}")
            };
        }
    }
}
