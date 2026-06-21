using System.Security.Cryptography;
using System.Text;

namespace ModularCA.Auth.Utils;

/// <summary>
/// Utility for computing session fingerprints from HTTP request metadata.
/// </summary>
public static class FingerprintUtil
{
    /// <summary>
    /// Computes a SHA-256 hash of the User-Agent string for session fingerprinting.
    /// Returns null if the input is null or empty.
    /// </summary>
    public static string? ComputeUserAgentHash(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
            return null;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(userAgent));
        return Convert.ToHexStringLower(bytes);
    }
}
