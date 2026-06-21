using System.Security.Cryptography;

namespace ModularCA.Keystore.Utils;

/// <summary>
/// Encrypts data using AES-256-GCM with a random nonce.
/// </summary>
public static class AesGcmEncryptor
{
    /// <summary>
    /// Encrypts data with AES-GCM and returns the nonce, ciphertext, and authentication tag.
    /// </summary>
    public static (byte[] nonce, byte[] ciphertext, byte[] tag) Encrypt(byte[] data, byte[] key)
    {
        var nonce = new byte[12];
        RandomNumberGenerator.Fill(nonce);

        var tag = new byte[16];
        var ciphertext = new byte[data.Length];

        using var aes = new AesGcm(key, tag.Length);
        aes.Encrypt(nonce, data, ciphertext, tag);

        return (nonce, ciphertext, tag);
    }

}
