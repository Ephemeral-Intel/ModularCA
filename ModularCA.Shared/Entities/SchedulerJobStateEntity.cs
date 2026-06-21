using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Persistent per-job scheduler state. Survives restarts
/// so cron history is not lost, records the last/next run time, the last outcome,
/// and a consecutive-failure counter used by the alert-escalation path.
/// </summary>
[Table("SchedulerJobStates")]
public class SchedulerJobStateEntity
{
    /// <summary>
    /// Logical job name (e.g. <c>"AutoRenewal"</c>, <c>"BackupVerification"</c>).
    /// Matches the dispatch name used by <c>SchedulerService.RunJobAsync</c>.
    /// </summary>
    [Key]
    [MaxLength(100)]
    public string JobName { get; set; } = string.Empty;

    /// <summary>UTC timestamp of the most recent successful or failed run.</summary>
    public DateTime? LastRunUtc { get; set; }

    /// <summary>
    /// UTC timestamp of the next scheduled occurrence computed from the job's cron expression.
    /// Used by the missed-run policy on startup to determine whether catch-up is needed.
    /// </summary>
    public DateTime? NextRunUtc { get; set; }

    /// <summary>One of <c>success</c>, <c>failed</c>, <c>cancelled</c>, <c>skipped</c>.</summary>
    [MaxLength(32)]
    public string? LastResult { get; set; }

    /// <summary>Truncated error message on failure, null on success.</summary>
    [MaxLength(2048)]
    public string? LastError { get; set; }

    /// <summary>Wall-clock duration of the most recent run in milliseconds.</summary>
    public long? LastDurationMs { get; set; }

    /// <summary>
    /// Number of consecutive failed runs. Reset to 0 on success. Used by the alert path
    /// to escalate <c>Warning -&gt; Critical</c> after <c>ConsecutiveFailureThreshold</c>.
    /// </summary>
    public int ConsecutiveFailureCount { get; set; }
}
