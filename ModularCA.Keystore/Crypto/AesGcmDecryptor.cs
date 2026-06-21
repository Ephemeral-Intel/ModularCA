using System.Security.Cryptography;

namespace ModularCA.Keystore.Crypto;

/// <summary>
/// Decrypts AES-256-GCM encrypted data given a nonce, ciphertext, authentication tag, and key.
/// Enforces full-size (16-byte) GCM tags — truncated tags reduce authentication
/// strength and are refused here even though <see cref="AesGcm"/> technically accepts any
/// length in <see cref="AesGcm.TagByteSizes"/>.
/// </summary>
public static class AesGcmDecryptor
{
    /// <summary>Required AES-GCM authentication tag length, in bytes.</summary>
    public const int RequiredTagLength = 16;

    /// <summary>Required AES-GCM nonce length, in bytes.</summary>
    public const int RequiredNonceLength = 12;

    /// <summary>
    /// Decrypts AES-GCM ciphertext and returns the plaintext bytes. Throws
    /// <see cref="CryptographicException"/> if the tag length is not 16 bytes or the nonce
    /// length is not 12 bytes.
    /// </summary>
    public static byte[] Decrypt(byte[] nonce, byte[] ciphertext, byte[] tag, byte[] key)
    {
        if (tag == null || tag.Length != RequiredTagLength)
            throw new CryptographicException($"AES-GCM tag must be exactly {RequiredTagLength} bytes (got {tag?.Length ?? 0}).");
        if (nonce == null || nonce.Length != RequiredNonceLength)
            throw new CryptographicException($"AES-GCM nonce must be exactly {RequiredNonceLength} bytes (got {nonce?.Length ?? 0}).");
        if (ciphertext == null)
            throw new ArgumentNullException(nameof(ciphertext));

        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(key, RequiredTagLength);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);

        return plaintext;
    }
}
