namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Canonical registry of system (singleton) scheduler jobs. Knows the stable list of
/// job names, where each job's cron expression and feature-flag toggle live in
/// <c>SystemConfig</c>, and how to invoke each job once on demand.
/// <para>
/// The registry exists because cron expressions for system jobs are scattered across
/// dozens of paths (<c>Backup.Schedule</c>, <c>Audit.Retention.Schedule</c>,
/// <c>CertExpiryNotification.Schedule</c>, <c>ComplianceScan.Schedule</c>,
/// <c>CertPolicy.ExpireCheckSchedule</c>, <c>AutoRenewal.Schedule</c>, …) with no
/// single dispatch table. The Schedules admin page consumes this registry as the
/// source of truth and the <c>AdminSchedulerController</c> mutates cron + per-job
/// timeout values through it so the writeback always lands at the right path.
/// </para>
/// <para>
/// Per-row jobs (CRL exports, LDAP publishers) are not represented here — those have
/// their own DB tables and are managed by <c>AdminCrlScheduleController</c> /
/// <c>AdminLdapPublishersController</c>. Only singleton system jobs live in the registry.
/// </para>
/// </summary>
public interface ISchedulerJobRegistry
{
    /// <summary>
    /// Returns the canonical list of system job names in registration order, in their
    /// canonical casing (e.g. <c>"BackupCreation"</c>). The list itself is a plain
    /// <see cref="IReadOnlyList{T}"/> so its <c>Contains</c> is case-sensitive — use
    /// <see cref="IsRegistered(string)"/> for case-insensitive existence checks.
    /// </summary>
    IReadOnlyList<string> JobNames { get; }

    /// <summary>
    /// Reads the current cron expression for <paramref name="jobName"/> from
    /// <c>SystemConfig</c>. Returns null when the job is not registered or has no
    /// cron-driven schedule (e.g. continuous internal-throttle jobs).
    /// </summary>
    string? GetCron(string jobName);

    /// <summary>
    /// Returns whether <paramref name="jobName"/> is currently considered enabled. The
    /// flag may be backed by a section-specific <c>Enabled</c> boolean in
    /// <c>SystemConfig</c> (e.g. <c>AutoRenewal.Enabled</c>) or by a <c>FeatureFlags</c>
    /// row, depending on the job. Returns true when no explicit toggle exists.
    /// </summary>
    Task<bool> GetEnabledAsync(string jobName, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns the per-job timeout in seconds, falling back to
    /// <c>SchedulerConfig.DefaultJobTimeoutSeconds</c> when the job does not have a
    /// dedicated entry in <c>SchedulerConfig.JobTimeouts</c>.
    /// </summary>
    int GetTimeoutSeconds(string jobName);

    /// <summary>
    /// Updates the cron expression for <paramref name="jobName"/> in the in-memory
    /// <c>SystemConfig</c>. Caller is responsible for persisting <c>SystemConfig</c>
    /// to <c>config.yaml</c> after one or more registry mutations. Returns false when
    /// the job has no writable cron path (e.g. continuous-throttle jobs).
    /// </summary>
    bool SetCron(string jobName, string cronExpression);

    /// <summary>
    /// Updates the per-job timeout in <c>SchedulerConfig.JobTimeouts</c> in memory.
    /// </summary>
    void SetTimeoutSeconds(string jobName, int seconds);

    /// <summary>
    /// Updates the enabled state for <paramref name="jobName"/> by writing the
    /// corresponding <c>SystemConfig</c> boolean (e.g. <c>Backup.CreateOnSchedule</c>,
    /// <c>AutoRenewal.Enabled</c>). Returns false when the job has no operator-tunable
    /// enabled toggle (e.g. continuous-throttle jobs that are intrinsically always on).
    /// Caller is responsible for persisting <c>SystemConfig</c> to <c>config.yaml</c>
    /// after the mutation.
    /// </summary>
    bool SetEnabled(string jobName, bool enabled);

    /// <summary>
    /// Returns whether <paramref name="jobName"/> is registered.
    /// </summary>
    bool IsRegistered(string jobName);

    /// <summary>
    /// Invokes the named job once, fire-and-forget, on a background task that owns its
    /// own DI scope and cancellation. Returns immediately; failures land in the
    /// registry's logger and the job's own audit/alert path.
    /// </summary>
    Task RunNowAsync(string jobName, CancellationToken cancellationToken = default);
}
