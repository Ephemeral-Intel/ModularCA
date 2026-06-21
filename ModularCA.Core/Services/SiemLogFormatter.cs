using Microsoft.Extensions.Logging;
using ModularCA.Shared.Models.Config;
using System.Net.Sockets;
using System.Text;

namespace ModularCA.Core.Services;

/// <summary>
/// Formats audit events in ArcSight Common Event Format (CEF) for SIEM integration
/// and optionally forwards them to a configured SIEM endpoint over TCP or UDP.
/// </summary>
/// <remarks>
/// CEF format: CEF:0|DeviceVendor|DeviceProduct|DeviceVersion|SignatureID|Name|Severity|Extension
/// Reference: https://www.microfocus.com/documentation/arcsight/arcsight-smartconnectors/pdfdoc/cef-implementation-standard/cef-implementation-standard.pdf
/// </remarks>
public class SiemLogFormatter
{
    private const string CefVersion = "0";
    private const string DeviceVendor = "ModularCA";
    private const string DeviceProduct = "ModularCA";
    private const string DeviceVersion = "1.0";

    private readonly ILogger<SiemLogFormatter> _logger;
    private readonly NetworkLogConfig _networkConfig;

    /// <summary>
    /// Initializes a new instance of <see cref="SiemLogFormatter"/> with the system configuration
    /// and logger. SIEM forwarding is enabled when <see cref="NetworkLogConfig.Enabled"/> is true
    /// and a valid host is configured.
    /// </summary>
    public SiemLogFormatter(ILogger<SiemLogFormatter> logger, SystemConfig config)
    {
        _logger = logger;
        _networkConfig = config.Logging.Network;
    }

    /// <summary>
    /// Formats an audit event into a CEF-compliant string following the ArcSight CEF standard.
    /// </summary>
    /// <param name="eventType">Signature ID / event type code (e.g., "CertIssued", "LoginFailed").</param>
    /// <param name="eventName">Human-readable event name (e.g., "Certificate Issued", "Login Failed").</param>
    /// <param name="severity">CEF severity level (0-10). 0 = lowest, 10 = highest.</param>
    /// <param name="sourceIp">Source IP address of the request originator.</param>
    /// <param name="serverIp">Destination/server IP address.</param>
    /// <param name="username">Username associated with the event, if any.</param>
    /// <param name="details">Free-text details or description of the event.</param>
    /// <param name="additionalExtensions">Optional additional CEF key-value extension pairs.</param>
    /// <returns>A CEF-formatted string ready for SIEM ingestion.</returns>
    public static string FormatCef(
        string eventType,
        string eventName,
        int severity,
        string? sourceIp = null,
        string? serverIp = null,
        string? username = null,
        string? details = null,
        Dictionary<string, string>? additionalExtensions = null)
    {
        // Clamp severity to valid CEF range 0-10
        severity = Math.Clamp(severity, 0, 10);

        // Build extension fields per CEF spec
        var extensions = new StringBuilder();

        if (!string.IsNullOrEmpty(sourceIp))
            extensions.Append($"src={EscapeExtensionValue(sourceIp)} ");
        if (!string.IsNullOrEmpty(serverIp))
            extensions.Append($"dst={EscapeExtensionValue(serverIp)} ");
        if (!string.IsNullOrEmpty(username))
            extensions.Append($"suser={EscapeExtensionValue(username)} ");
        if (!string.IsNullOrEmpty(details))
            extensions.Append($"msg={EscapeExtensionValue(details)} ");

        // Append the event timestamp in CEF rt= format (milliseconds since epoch)
        extensions.Append($"rt={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()} ");

        if (additionalExtensions != null)
        {
            foreach (var kvp in additionalExtensions)
            {
                extensions.Append($"{EscapeExtensionKey(kvp.Key)}={EscapeExtensionValue(kvp.Value)} ");
            }
        }

        // CEF header: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extensions
        return $"CEF:{CefVersion}|{EscapeHeaderField(DeviceVendor)}|{EscapeHeaderField(DeviceProduct)}|{EscapeHeaderField(DeviceVersion)}|{EscapeHeaderField(eventType)}|{EscapeHeaderField(eventName)}|{severity}|{extensions.ToString().TrimEnd()}";
    }

    /// <summary>
    /// Formats an audit event as CEF and sends it to the configured SIEM endpoint if enabled.
    /// Falls back to structured logging if the network endpoint is unreachable.
    /// </summary>
    /// <param name="eventType">Signature ID / event type code.</param>
    /// <param name="eventName">Human-readable event name.</param>
    /// <param name="severity">CEF severity level (0-10).</param>
    /// <param name="sourceIp">Source IP address.</param>
    /// <param name="serverIp">Server IP address.</param>
    /// <param name="username">Username associated with the event.</param>
    /// <param name="details">Event details.</param>
    /// <param name="additionalExtensions">Optional additional CEF extension pairs.</param>
    public async Task FormatAndSendAsync(
        string eventType,
        string eventName,
        int severity,
        string? sourceIp = null,
        string? serverIp = null,
        string? username = null,
        string? details = null,
        Dictionary<string, string>? additionalExtensions = null)
    {
        var cefMessage = FormatCef(eventType, eventName, severity, sourceIp, serverIp, username, details, additionalExtensions);

        // Always log the CEF message through structured logging for local audit trail
        _logger.LogInformation("CEF SIEM Event: {CefMessage}", cefMessage);

        // Forward to SIEM endpoint if configured
        if (_networkConfig.Enabled && !string.IsNullOrWhiteSpace(_networkConfig.Host))
        {
            await SendToSiemAsync(cefMessage);
        }
    }

    /// <summary>
    /// Maps common audit action types to CEF severity levels.
    /// </summary>
    /// <param name="actionType">The audit action type string from <see cref="AuditService"/>.</param>
    /// <param name="success">Whether the action succeeded.</param>
    /// <returns>CEF severity (0-10).</returns>
    public static int MapSeverity(string actionType, bool success = true)
    {
        if (!success)
        {
            // Failed operations are generally higher severity
            return actionType switch
            {
                "Login" => 7,             // Failed login = suspicious
                "MfaVerification" => 8,   // Failed MFA = very suspicious
                "CertificateRevoke" => 6,
                _ => 5
            };
        }

        return actionType switch
        {
            "Login" => 1,
            "Logout" => 1,
            "MfaVerification" => 2,
            "CertificateIssued" => 3,
            "CertificateRevoke" => 5,
            "CertificateRenew" => 3,
            "CsrSubmitted" => 2,
            "CsrApproved" => 3,
            "CsrDenied" => 4,
            "CrlGenerated" => 2,
            "UserCreated" => 3,
            "UserDeleted" => 5,
            "RoleChanged" => 5,
            "ConfigChanged" => 6,
            "CaCreated" => 7,
            "CaDeleted" => 8,
            "KeyExport" => 8,
            "VulnerabilityDetected" => 6,
            "SecurityAlert" => 8,
            "BackupCreated" => 2,
            "BackupRestored" => 7,
            _ => 3
        };
    }

    /// <summary>
    /// Convenience method to format and send an audit event using the standard audit service parameters.
    /// Can be called directly from <see cref="AuditService.LogAsync"/> or protocol audit methods.
    /// </summary>
    /// <param name="actionType">The audit action type.</param>
    /// <param name="username">Actor username.</param>
    /// <param name="sourceIp">Request source IP.</param>
    /// <param name="success">Whether the action succeeded.</param>
    /// <param name="targetEntityType">Target entity type (e.g., "Certificate", "User").</param>
    /// <param name="targetEntityId">Target entity identifier.</param>
    /// <param name="errorMessage">Error message if the action failed.</param>
    public async Task SendAuditEventAsync(
        string actionType,
        string? username,
        string? sourceIp,
        bool success = true,
        string? targetEntityType = null,
        string? targetEntityId = null,
        string? errorMessage = null)
    {
        var severity = MapSeverity(actionType, success);
        var eventName = FormatEventName(actionType, success);
        var details = BuildDetailsMessage(actionType, targetEntityType, targetEntityId, success, errorMessage);

        var extensions = new Dictionary<string, string>();
        if (!string.IsNullOrEmpty(targetEntityType))
            extensions["cs1Label"] = "TargetType";
        if (!string.IsNullOrEmpty(targetEntityType))
            extensions["cs1"] = targetEntityType;
        if (!string.IsNullOrEmpty(targetEntityId))
            extensions["cs2Label"] = "TargetId";
        if (!string.IsNullOrEmpty(targetEntityId))
            extensions["cs2"] = targetEntityId;
        if (!success)
            extensions["outcome"] = "failure";
        else
            extensions["outcome"] = "success";

        await FormatAndSendAsync(actionType, eventName, severity, sourceIp, null, username, details, extensions);
    }

    /// <summary>
    /// Sends a CEF-formatted message to the configured SIEM endpoint via TCP or UDP.
    /// </summary>
    private async Task SendToSiemAsync(string cefMessage)
    {
        try
        {
            var messageBytes = Encoding.UTF8.GetBytes(cefMessage + "\n");

            if (_networkConfig.Protocol?.Equals("TCP", StringComparison.OrdinalIgnoreCase) == true)
            {
                using var client = new TcpClient();
                client.SendTimeout = 5000;
                await client.ConnectAsync(_networkConfig.Host, _networkConfig.Port);
                await using var stream = client.GetStream();
                await stream.WriteAsync(messageBytes);
                await stream.FlushAsync();
            }
            else
            {
                using var client = new UdpClient();
                await client.SendAsync(messageBytes, messageBytes.Length, _networkConfig.Host, _networkConfig.Port);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send CEF message to SIEM endpoint {Host}:{Port}",
                _networkConfig.Host, _networkConfig.Port);
        }
    }

    /// <summary>
    /// Formats the action type and success flag into a human-readable CEF event name.
    /// </summary>
    private static string FormatEventName(string actionType, bool success)
    {
        var outcome = success ? "Success" : "Failure";
        return $"{actionType} {outcome}";
    }

    /// <summary>
    /// Builds a descriptive message for the CEF msg= extension field.
    /// </summary>
    private static string BuildDetailsMessage(string actionType, string? targetEntityType, string? targetEntityId, bool success, string? errorMessage)
    {
        var sb = new StringBuilder();
        sb.Append($"Action={actionType}");

        if (!string.IsNullOrEmpty(targetEntityType))
            sb.Append($" Target={targetEntityType}");
        if (!string.IsNullOrEmpty(targetEntityId))
            sb.Append($" TargetId={targetEntityId}");
        if (!success && !string.IsNullOrEmpty(errorMessage))
            sb.Append($" Error={errorMessage}");

        return sb.ToString();
    }

    /// <summary>
    /// Escapes CEF header field values by escaping pipe (|) and backslash (\) characters.
    /// </summary>
    private static string EscapeHeaderField(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Replace("\\", "\\\\").Replace("|", "\\|");
    }

    /// <summary>
    /// Escapes CEF extension values by escaping backslash (\), equals (=), and newlines.
    /// </summary>
    private static string EscapeExtensionValue(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value
            .Replace("\\", "\\\\")
            .Replace("=", "\\=")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r");
    }

    /// <summary>
    /// Escapes CEF extension keys. Keys should contain only alphanumeric characters per spec,
    /// but we sanitize defensively.
    /// </summary>
    private static string EscapeExtensionKey(string key)
    {
        if (string.IsNullOrEmpty(key)) return string.Empty;
        // CEF extension keys must be alphanumeric; strip invalid characters
        var sb = new StringBuilder(key.Length);
        foreach (var c in key)
        {
            if (char.IsLetterOrDigit(c))
                sb.Append(c);
        }
        return sb.ToString();
    }
}
