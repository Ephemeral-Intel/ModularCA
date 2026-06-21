using ModularCA.Core.Services;
using ModularCA.Shared.Entities;

namespace ModularCA.Tests.TestUtils;

/// <summary>
/// Records every <see cref="ISecurityAlertService.RaiseAlertAsync"/> call so tests can assert
/// what alerts fired without standing up the real alert pipeline.
/// </summary>
internal sealed class RecordingAlertService : ISecurityAlertService
{
    public List<(string EventType, string Severity, string Message)> Raised { get; } = new();

    public Task RaiseAlertAsync(string eventType, string severity, string message, object? details = null)
    {
        Raised.Add((eventType, severity, message));
        return Task.CompletedTask;
    }
}

/// <summary>
/// No-op <see cref="INotificationService"/>. Tests that need to assert what notifications fired
/// can subclass this and override the relevant method; tests that only care about side effects
/// elsewhere (DB writes, alert state) can use the no-op shape directly.
/// </summary>
internal class NoopNotificationService : INotificationService
{
    public virtual Task NotifyCertExpiringAsync(CertificateEntity cert, int daysRemaining) => Task.CompletedTask;
    public virtual Task NotifyCertRevokedAsync(string subjectDN, string serial, string reason) => Task.CompletedTask;
    public virtual Task NotifyCertIssuedAsync(string subjectDN, string serial, string protocol) => Task.CompletedTask;
    public virtual Task NotifyAccountLockedAsync(string username, string reason) => Task.CompletedTask;
    public virtual Task NotifyPasswordResetAsync(string username, string email, string newPassword) => Task.CompletedTask;
    public virtual Task NotifyPasswordExpiringAsync(string username, string email, int daysRemaining) => Task.CompletedTask;
    public virtual Task NotifyCrlGenerationFailedAsync(string caName, string error) => Task.CompletedTask;
    public virtual Task NotifyTlsCertRenewedAsync(string newSerial, DateTime newExpiry) => Task.CompletedTask;
    public virtual Task NotifyAsync(string eventType, string message) => Task.CompletedTask;
    public virtual Task NotifyCsrPendingApprovalAsync(string subject, string protocol) => Task.CompletedTask;
}
