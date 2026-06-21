using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Models.Config;

namespace ModularCA.Core.Services;

/// <summary>
/// Dispatches real-time security alerts for high-risk CA operations via the notification
/// pipeline. Filters alerts by severity threshold and enforces per-event-type cooldown
/// periods using <see cref="IDistributedCache"/> to prevent alert fatigue.
/// </summary>
public class SecurityAlertService : ISecurityAlertService
{
    private readonly INotificationService _notification;
    private readonly IDistributedCache _cache;
    private readonly SystemConfig _config;
    private readonly ILogger<SecurityAlertService> _logger;

    /// <summary>
    /// Numeric ordering used to compare severity levels against the configured minimum threshold.
    /// </summary>
    private static readonly Dictionary<string, int> SeverityOrder = new()
    {
        [AlertSeverity.Info] = 0,
        [AlertSeverity.Warning] = 1,
        [AlertSeverity.Critical] = 2
    };

    /// <summary>
    /// Initializes a new instance of the <see cref="SecurityAlertService"/> class.
    /// </summary>
    /// <param name="notification">Notification service for dispatching alert emails and webhooks.</param>
    /// <param name="cache">Distributed cache for cooldown tracking.</param>
    /// <param name="config">System configuration containing alert settings.</param>
    /// <param name="logger">Logger instance.</param>
    public SecurityAlertService(
        INotificationService notification,
        IDistributedCache cache,
        SystemConfig config,
        ILogger<SecurityAlertService> logger)
    {
        _notification = notification;
        _cache = cache;
        _config = config;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task RaiseAlertAsync(string eventType, string severity, string message, object? details = null)
    {
        try
        {
            // Check if alerting is enabled
            if (!_config.Alert.Enabled)
                return;

            // Check severity threshold
            if (!MeetsSeverityThreshold(severity, _config.Alert.MinimumSeverity))
                return;

            // Check cooldown
            var cooldownKey = $"alert-cooldown:{eventType}";
            var existing = await _cache.GetStringAsync(cooldownKey);
            if (existing != null)
            {
                _logger.LogDebug("Security alert {EventType} suppressed by cooldown", eventType);
                return;
            }

            // Dispatch via notification service
            var alertMessage = $"[{severity}] {message}";
            await _notification.NotifyAsync($"SecurityAlert:{eventType}", alertMessage);

            _logger.LogWarning("Security alert raised: {EventType} ({Severity}) - {Message}", eventType, severity, message);

            // Set cooldown
            await _cache.SetStringAsync(cooldownKey, "1", new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(_config.Alert.CooldownMinutes)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to raise security alert for {EventType}", eventType);
        }
    }

    /// <summary>
    /// Determines whether the given severity meets or exceeds the configured minimum threshold.
    /// </summary>
    /// <param name="severity">The severity of the current alert.</param>
    /// <param name="minimumSeverity">The minimum severity threshold from configuration.</param>
    /// <returns>True if the alert severity meets the threshold; otherwise false.</returns>
    private static bool MeetsSeverityThreshold(string severity, string minimumSeverity)
    {
        var severityLevel = SeverityOrder.GetValueOrDefault(severity, -1);
        var minimumLevel = SeverityOrder.GetValueOrDefault(minimumSeverity, 0);
        return severityLevel >= minimumLevel;
    }
}
