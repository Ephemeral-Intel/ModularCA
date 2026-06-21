using Org.BouncyCastle.Asn1.Sec;
using Org.BouncyCastle.Asn1.X9;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Crypto.Generators;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Security;

namespace ModularCA.Shared.Utils;

/// <summary>
/// Generates cryptographic key pairs for various algorithms including RSA, ECDSA, EdDSA, and post-quantum (ML-DSA, SLH-DSA).
/// </summary>
public static class KeyGenerationUtil
{
    /// <summary>
    /// Generates an asymmetric key pair for the specified algorithm and key size or curve name.
    /// </summary>
    public static AsymmetricCipherKeyPair GenerateKeyPair(string algorithm, string keySizeOrCurve)
    {
        var upper = algorithm.ToUpperInvariant();
        if (upper == "RSA") return GenerateRsaKeyPair(keySizeOrCurve);
        if (upper == "ECDSA") return GenerateEcdsaKeyPair(keySizeOrCurve);
        if (upper == "ED25519") return GenerateEd25519KeyPair();
        if (upper == "ED448") return GenerateEd448KeyPair();
        if (upper is "ML-DSA" or "ML-DSA-44" or "ML-DSA-65" or "ML-DSA-87" or "DILITHIUM")
            return GenerateMLDsaKeyPair(algorithm);
        if (upper is "SLH-DSA" or "SPHINCSPLUS" || upper.StartsWith("SLH-DSA-"))
            return GenerateSlhDsaKeyPair(algorithm);
        throw new ArgumentException($"Unsupported key algorithm: {algorithm}");
    }

    private static AsymmetricCipherKeyPair GenerateRsaKeyPair(string keySize)
    {
        int finalKeySize = keySize switch
        {
            "2048" => 2048,
            "3072" => 3072,
            "4096" => 4096,
            "7680" => 7680,
            "8192" => 8192,
            _ => throw new ArgumentException($"Unsupported RSA key size: {keySize}")
        };
        var generator = new RsaKeyPairGenerator();
        generator.Init(new KeyGenerationParameters(new SecureRandom(), finalKeySize));
        return generator.GenerateKeyPair();
    }

    private static AsymmetricCipherKeyPair GenerateEcdsaKeyPair(string curveBits)
    {
        string curveName = curveBits switch
        {
            "P-256" => "secp256r1",
            "P-384" => "secp384r1",
            "P-521" => "secp521r1",
            _ => throw new ArgumentException($"Unsupported curve bit size: {curveBits}")
        };

        var curveOid = Org.BouncyCastle.Asn1.Sec.SecObjectIdentifiers.SecP256r1;
        if (curveName == "secp384r1") curveOid = Org.BouncyCastle.Asn1.Sec.SecObjectIdentifiers.SecP384r1;
        else if (curveName == "secp521r1") curveOid = Org.BouncyCastle.Asn1.Sec.SecObjectIdentifiers.SecP521r1;

        var generator = new ECKeyPairGenerator();
        var keyGenParams = new ECKeyGenerationParameters(curveOid, new SecureRandom());
        generator.Init(keyGenParams);
        return generator.GenerateKeyPair();
    }

    private static AsymmetricCipherKeyPair GenerateEd25519KeyPair()
    {
        var generator = new Ed25519KeyPairGenerator();
        generator.Init(new Ed25519KeyGenerationParameters(new SecureRandom()));
        return generator.GenerateKeyPair();
    }

    private static AsymmetricCipherKeyPair GenerateEd448KeyPair()
    {
        var generator = new Ed448KeyPairGenerator();
        generator.Init(new Ed448KeyGenerationParameters(new SecureRandom()));
        return generator.GenerateKeyPair();
    }

    private static AsymmetricCipherKeyPair GenerateMLDsaKeyPair(string algorithm)
    {
        var mlDsaParams = algorithm.ToUpperInvariant() switch
        {
            "ML-DSA-44" => MLDsaParameters.ml_dsa_44,
            "ML-DSA-87" => MLDsaParameters.ml_dsa_87,
            _ => MLDsaParameters.ml_dsa_65
        };
        var generator = new MLDsaKeyPairGenerator();
        generator.Init(new MLDsaKeyGenerationParameters(new SecureRandom(), mlDsaParams));
        return generator.GenerateKeyPair();
    }

    private static AsymmetricCipherKeyPair GenerateSlhDsaKeyPair(string algorithm)
    {
        var slhDsaParams = algorithm.ToUpperInvariant() switch
        {
            "SLH-DSA-SHA2-128S" => SlhDsaParameters.slh_dsa_sha2_128s,
            "SLH-DSA-SHA2-192F" => SlhDsaParameters.slh_dsa_sha2_192f,
            "SLH-DSA-SHA2-192S" => SlhDsaParameters.slh_dsa_sha2_192s,
            "SLH-DSA-SHA2-256F" => SlhDsaParameters.slh_dsa_sha2_256f,
            "SLH-DSA-SHA2-256S" => SlhDsaParameters.slh_dsa_sha2_256s,
            "SLH-DSA-SHAKE-128F" => SlhDsaParameters.slh_dsa_shake_128f,
            "SLH-DSA-SHAKE-128S" => SlhDsaParameters.slh_dsa_shake_128s,
            "SLH-DSA-SHAKE-192F" => SlhDsaParameters.slh_dsa_shake_192f,
            "SLH-DSA-SHAKE-192S" => SlhDsaParameters.slh_dsa_shake_192s,
            "SLH-DSA-SHAKE-256F" => SlhDsaParameters.slh_dsa_shake_256f,
            "SLH-DSA-SHAKE-256S" => SlhDsaParameters.slh_dsa_shake_256s,
            _ => SlhDsaParameters.slh_dsa_sha2_128f
        };
        var generator = new SlhDsaKeyPairGenerator();
        generator.Init(new SlhDsaKeyGenerationParameters(new SecureRandom(), slhDsaParams));
        return generator.GenerateKeyPair();
    }
}
