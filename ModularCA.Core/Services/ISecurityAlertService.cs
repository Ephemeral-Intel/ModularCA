namespace ModularCA.Core.Services;

/// <summary>
/// Dispatches real-time security alerts for high-risk operations via email and webhooks.
/// Respects severity thresholds and cooldown periods to prevent alert fatigue.
/// </summary>
public interface ISecurityAlertService
{
    /// <summary>
    /// Raises a security alert if the event severity meets the configured threshold
    /// and the cooldown period for this event type has elapsed.
    /// </summary>
    /// <param name="eventType">The type of security event (e.g., "CaRevoked", "PrivateKeyExported").</param>
    /// <param name="severity">The severity level from <see cref="ModularCA.Shared.Enums.AlertSeverity"/>.</param>
    /// <param name="message">Human-readable alert message.</param>
    /// <param name="details">Optional structured details about the event.</param>
    Task RaiseAlertAsync(string eventType, string severity, string message, object? details = null);
}
