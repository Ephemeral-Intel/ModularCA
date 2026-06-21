using System.Security.Cryptography;
using System.Text;

namespace ModularCA.API.Startup;

/// <summary>
/// KC-11: process-wide holder for the one-time setup token generated at boot when
/// setup mode is detected. The setup wizard must present this token in the
/// <c>X-Setup-Token</c> header on every request. This prevents network-adjacent
/// attackers from accessing the wizard even if they can reach the port — the token
/// is only printed to the server console and must be copied by the operator.
/// <para>
/// Hardening: the token is stored alongside the UTC timestamp at which it was
/// generated. A 30-minute TTL is enforced by <see cref="ValidateToken"/>, and
/// comparison is done with <see cref="CryptographicOperations.FixedTimeEquals"/>
/// over UTF-8 bytes to eliminate per-byte timing side channels. A length mismatch
/// still runs a fixed-time compare against a dummy buffer so an attacker cannot
/// distinguish a length-check short-circuit from a byte-compare failure.
/// </para>
/// </summary>
internal static class SetupTokenHolder
{
    /// <summary>
    /// Default lifetime of the setup token. Operators who need longer should restart
    /// the process — the token is already printed only to the server console so a
    /// short lifetime is a reasonable tradeoff.
    /// </summary>
    public static readonly TimeSpan DefaultTokenTtl = TimeSpan.FromMinutes(30);

    private static string? _token;
    private static DateTime _issuedAtUtc;

    /// <summary>
    /// Stores the one-time setup token and stamps the current UTC time as the
    /// issuance instant used for TTL enforcement. Called once from startup when
    /// setup mode is detected.
    /// </summary>
    public static void SetToken(string token)
    {
        _token = token;
        _issuedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Returns the setup token, or <c>null</c> when the app is not running in setup mode.
    /// </summary>
    public static string? GetToken() => _token;

    /// <summary>
    /// Returns the UTC timestamp at which the current setup token was generated.
    /// Meaningful only when <see cref="GetToken"/> returns non-null.
    /// </summary>
    public static DateTime GetIssuedAtUtc() => _issuedAtUtc;

    /// <summary>
    /// Returns true when a token has been configured AND the TTL has elapsed.
    /// </summary>
    public static bool IsExpired(TimeSpan? ttl = null)
    {
        if (string.IsNullOrEmpty(_token)) return false;
        var window = ttl ?? DefaultTokenTtl;
        return DateTime.UtcNow - _issuedAtUtc > window;
    }

    /// <summary>
    /// Validation result for <see cref="ValidateToken"/>.
    /// </summary>
    public enum ValidationResult
    {
        /// <summary>No token configured — setup mode is not active.</summary>
        NotInSetupMode,
        /// <summary>Token present and matches within the TTL.</summary>
        Valid,
        /// <summary>No token was supplied by the caller.</summary>
        Missing,
        /// <summary>Supplied token does not match the configured value.</summary>
        Invalid,
        /// <summary>Supplied token matches but the TTL has elapsed.</summary>
        Expired,
    }

    /// <summary>
    /// Constant-time comparison of <paramref name="providedToken"/> against the
    /// configured setup token, enforcing the <paramref name="ttl"/> (default
    /// <see cref="DefaultTokenTtl"/>). Lengths are never short-circuited: a
    /// mismatched length still runs <see cref="CryptographicOperations.FixedTimeEquals"/>
    /// against a dummy buffer of the expected length so an attacker cannot observe
    /// a timing difference between a length miss and a byte miss.
    /// </summary>
    public static ValidationResult ValidateToken(string? providedToken, TimeSpan? ttl = null)
    {
        var expectedToken = _token;
        if (string.IsNullOrEmpty(expectedToken))
            return ValidationResult.NotInSetupMode;

        if (string.IsNullOrEmpty(providedToken))
            return ValidationResult.Missing;

        var expectedBytes = Encoding.UTF8.GetBytes(expectedToken);
        var providedBytes = Encoding.UTF8.GetBytes(providedToken);

        bool match;
        if (expectedBytes.Length == providedBytes.Length)
        {
            match = CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
        }
        else
        {
            // Run a fixed-time compare against a dummy of the expected length so the
            // duration does not depend on whether the lengths matched. The return
            // value is discarded — the mismatched length is already a fail — but the
            // work is done to avoid a timing oracle on length.
            var dummy = new byte[expectedBytes.Length];
            _ = CryptographicOperations.FixedTimeEquals(expectedBytes, dummy);
            match = false;
        }

        if (!match)
            return ValidationResult.Invalid;

        // Token matches — enforce TTL last so an attacker spraying guesses cannot
        // distinguish "correct token but expired" from "wrong token" via timing.
        var window = ttl ?? DefaultTokenTtl;
        if (DateTime.UtcNow - _issuedAtUtc > window)
            return ValidationResult.Expired;

        return ValidationResult.Valid;
    }
}
