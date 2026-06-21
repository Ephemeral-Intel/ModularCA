namespace ModularCA.Shared.Enums;

/// <summary>
/// Severity levels for security alerts. Used by ISecurityAlertService to classify
/// and filter alerts based on the configured minimum severity threshold.
/// </summary>
public static class AlertSeverity
{
    public const string Critical = "Critical";
    public const string Warning = "Warning";
    public const string Info = "Info";
}
