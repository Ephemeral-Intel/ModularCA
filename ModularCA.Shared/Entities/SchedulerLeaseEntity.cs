using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Database-backed lease for single-leader scheduler election.
/// <para>
/// Only the process that holds a non-expired lease on a well-known name (for example
/// <c>"scheduler"</c>) executes the poll cycle. Instances take the lease with an
/// atomic conditional UPDATE whose predicate is "expired or already-mine"; rows
/// affected = 1 means the caller holds the lease. The lease is refreshed every
/// poll cycle and allowed to expire naturally if the holder dies.
/// </para>
/// <para>
/// Preferred over MySQL <c>GET_LOCK</c> because it survives connection drops, is
/// observable via a simple SELECT, and does not depend on any session-scoped state.
/// Consistent with the pattern used for the bootstrap advisory lock.
/// </para>
/// </summary>
[Table("SchedulerLeases")]
public class SchedulerLeaseEntity
{
    /// <summary>
    /// Well-known lease name. Currently always <c>"scheduler"</c>; future subsystems
    /// can allocate additional names without sharing this row.
    /// </summary>
    [Key]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Instance ID (a GUID minted at process start) of the current holder. Shown in
    /// log lines and audit events so operators can trace which replica executed a job.
    /// </summary>
    [Required]
    [MaxLength(64)]
    public string OwnerInstanceId { get; set; } = string.Empty;

    /// <summary>
    /// UTC timestamp the lease was acquired (or most recently refreshed).
    /// </summary>
    public DateTime AcquiredAtUtc { get; set; }

    /// <summary>
    /// UTC timestamp at which the lease expires. Another replica may take the lease
    /// once <c>UtcNow &gt; ExpiresAtUtc</c>. Refreshed on every poll cycle.
    /// </summary>
    public DateTime ExpiresAtUtc { get; set; }
}
