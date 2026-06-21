using System.Security.Cryptography;
using System.Text;

namespace ModularCA.Keystore.Utils;

/// <summary>
/// Cryptographic utility methods for salt generation and password hashing.
/// </summary>
public static class CryptoUtils
{
    /// <summary>
    /// Generates a cryptographically random salt of the specified length.
    /// </summary>
    public static byte[] GenerateSalt(int length = 16)
    {
        var salt = new byte[length];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(salt);
        return salt;
    }

    /// <summary>
    /// Computes a SHA-256 hash of the input string and returns it as a Base64-encoded string.
    /// </summary>
    public static string HashPass(string input)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToBase64String(hash);
    }
}
