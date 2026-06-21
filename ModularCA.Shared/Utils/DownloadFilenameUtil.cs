using System.Text.RegularExpressions;

namespace ModularCA.Shared.Utils;

/// <summary>
/// Shared helper for sanitizing filenames that flow from
/// attacker-controlled sources (CSR subject CN, multipart upload headers) into
/// <c>Content-Disposition</c> headers, audit-log details, or the rendered admin UI.
/// Central source of truth so the three public download controllers
/// (<c>PublicCaCertController</c>, <c>PublicCrlController</c>, <c>PublicShortUrlController</c>)
/// plus audit-logging code all agree on allowed characters.
/// </summary>
public static partial class DownloadFilenameUtil
{
    /// <summary>Characters always considered invalid in filenames across both Windows and POSIX.</summary>
    private static readonly HashSet<char> InvalidFilenameChars = new()
    {
        '\\', '/', ':', '*', '?', '"', '<', '>', '|', '\0', '\r', '\n', '\t',
    };

    /// <summary>
    /// Regex matching the whitelist of characters that are safe for download filenames:
    /// ASCII letters, digits, period, underscore, hyphen. Everything else is dropped.
    /// Uses a non-backtracking, generated regex so it is immune to RegexDoS.
    /// </summary>
    [GeneratedRegex(@"[^A-Za-z0-9._-]", RegexOptions.CultureInvariant | RegexOptions.NonBacktracking)]
    private static partial Regex DownloadFilenameWhitelistRegex();

    /// <summary>
    /// Regex used when sanitizing filenames for display in audit-log details. Allows the
    /// same characters as downloads plus spaces, which are common in legitimate multipart
    /// uploads. Length is bounded via a separate truncate step.
    /// </summary>
    [GeneratedRegex(@"[^A-Za-z0-9._ -]", RegexOptions.CultureInvariant | RegexOptions.NonBacktracking)]
    private static partial Regex AuditFilenameWhitelistRegex();

    /// <summary>
    /// Returns a filename safe for use in a <c>Content-Disposition</c> header. Control
    /// characters, path separators, and any character outside <c>[A-Za-z0-9._-]</c> are
    /// removed. The result is truncated to <paramref name="maxLength"/> characters
    /// (default 64) and falls back to <paramref name="fallback"/> when the sanitized
    /// form is empty.
    /// </summary>
    /// <param name="name">Source name (e.g. a certificate CN).</param>
    /// <param name="maxLength">Maximum length of the returned filename.</param>
    /// <param name="fallback">Replacement used when the sanitized name is empty.</param>
    public static string SafeDownloadFilename(string? name, int maxLength = 64, string fallback = "download")
    {
        if (string.IsNullOrWhiteSpace(name))
            return fallback;

        // Strip control characters before the regex pass — char.IsControl catches CR/LF,
        // vertical tab, form feed, BEL, etc., regardless of OS.
        var stripped = new string(name.Where(c => !char.IsControl(c) && !InvalidFilenameChars.Contains(c)).ToArray()).Trim();
        if (string.IsNullOrEmpty(stripped)) return fallback;

        var whitelisted = DownloadFilenameWhitelistRegex().Replace(stripped, "_");
        whitelisted = whitelisted.Trim('_', '.', '-');

        if (string.IsNullOrEmpty(whitelisted)) return fallback;
        if (whitelisted.Length > maxLength)
            whitelisted = whitelisted.Substring(0, maxLength);
        return whitelisted;
    }

    /// <summary>
    /// Sanitizes a multipart-supplied <c>file.FileName</c> for safe inclusion in audit-log
    /// details. Control characters are stripped and the result is constrained to the
    /// whitelist <c>[A-Za-z0-9._ -]{1,128}</c>. Empty results are returned as <c>"(unnamed)"</c>.
    /// </summary>
    /// <param name="fileName">Attacker-controlled filename from a multipart upload.</param>
    public static string SanitizeForAuditLog(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName)) return "(unnamed)";

        var stripped = new string(fileName.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (string.IsNullOrEmpty(stripped)) return "(unnamed)";

        var whitelisted = AuditFilenameWhitelistRegex().Replace(stripped, "_").Trim();
        if (string.IsNullOrEmpty(whitelisted)) return "(unnamed)";
        if (whitelisted.Length > 128)
            whitelisted = whitelisted.Substring(0, 128);
        return whitelisted;
    }

    /// <summary>
    /// Extracts the CN value from a subject DN string like <c>"CN=My CA, O=Org"</c>.
    /// Returns <c>null</c> when the DN is empty or contains no CN component.
    /// </summary>
    public static string? ExtractCn(string? subjectDn)
    {
        if (string.IsNullOrWhiteSpace(subjectDn)) return null;
        foreach (var part in subjectDn.Split(','))
        {
            var trimmed = part.Trim();
            if (trimmed.StartsWith("CN=", System.StringComparison.OrdinalIgnoreCase))
                return trimmed.Substring(3).Trim();
        }
        return null;
    }
}
