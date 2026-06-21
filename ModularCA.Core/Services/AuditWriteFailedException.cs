namespace ModularCA.Core.Services;

/// <summary>
/// Thrown by <see cref="AuditService.LogAsync"/> when the audit DB
/// write fails and <c>Audit.FailMode</c> is <see cref="Shared.Models.Config.AuditFailMode.FailClosed"/>.
/// Controllers should catch this and return a 503 so the operator surfaces the audit
/// outage instead of silently completing the business operation. The constructor
/// captures the action type and the underlying driver exception so alert pipelines
/// can root-cause the specific table / connection failure.
/// </summary>
public sealed class AuditWriteFailedException : Exception
{
    /// <summary>
    /// Audit action type the failed write was attempting to persist.
    /// </summary>
    public string ActionType { get; }

    /// <summary>
    /// Constructs a new <see cref="AuditWriteFailedException"/> with the underlying
    /// driver exception and the action type whose persistence failed.
    /// </summary>
    public AuditWriteFailedException(string actionType, Exception inner)
        : base($"Audit write failed for action '{actionType}' and Audit.FailMode=FailClosed is in effect.", inner)
    {
        ActionType = actionType;
    }
}
