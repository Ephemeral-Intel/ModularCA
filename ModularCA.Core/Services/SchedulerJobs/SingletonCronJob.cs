using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ModularCA.Database;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Config;
using NCrontab;

namespace ModularCA.Core.Services.SchedulerJobs;

/// <summary>
/// Base class for jobs that have a single global cron schedule (Backup, AuditRetention,
/// AutoRenewal, Compliance, CertExpiryNotification, CertExpire, AcmeCleanup,
/// LdapGroupSync, TlsRenewal). Subclasses override <see cref="CronExpression"/> and
/// <see cref="ExecuteAsync"/>; the base class evaluates past-due against the persistent
/// <c>SchedulerJobStates.LastRunUtc</c>, applies <c>Scheduler.MissedRunPolicy</c> on first
/// run, anchors the next <c>LastRunUtc</c> to the matched cron occurrence (DST/NTP-stable),
/// and routes execution through <see cref="SchedulerJobRunner"/> for metrics/audit/state.
/// </summary>
/// <remarks>
/// <para>
/// Subclasses MUST also override <see cref="Name"/> with a stable short identifier matching
/// the <c>SchedulerJobStates.JobName</c> column convention (e.g. <c>"BackupCreation"</c>).
/// </para>
/// <para>
/// When <see cref="CronExpression"/> is empty/whitespace, the job is treated as disabled and
/// <see cref="TickAsync"/> returns without writing any state. Subclasses that have a
/// <c>.Enabled</c> master toggle should short-circuit there too — return <c>string.Empty</c>
/// from <see cref="CronExpression"/> when disabled.
/// </para>
/// </remarks>
public abstract class SingletonCronJob : ISchedulerJob
{
    /// <summary>Service provider used to resolve scoped services (DbContext, audit, etc.).</summary>
    protected readonly IServiceProvider ServiceProvider;

    /// <summary>Logger scoped to the concrete job class.</summary>
    protected readonly ILogger Logger;

    /// <summary>Solution-wide config snapshot.</summary>
    protected readonly SystemConfig Config;

    private readonly SchedulerJobRunner _runner;

    /// <summary>
    /// Time provider used by the base class for cron anchor math and exposed to subclasses
    /// that need to override <see cref="TickAsync"/> with custom dispatch logic. Tests inject
    /// a fake via the constructor; subclasses MUST read this rather than <c>DateTime.UtcNow</c>
    /// to keep deterministic behavior under test fakes.
    /// </summary>
    protected readonly TimeProvider TimeProvider;

    /// <summary>
    /// Initializes the base. Concrete jobs request these via constructor injection and pass
    /// them up via <c>: base(...)</c>.
    /// </summary>
    protected SingletonCronJob(
        IServiceProvider serviceProvider,
        ILogger logger,
        SystemConfig config,
        SchedulerJobRunner runner,
        TimeProvider? timeProvider = null)
    {
        ServiceProvider = serviceProvider;
        Logger = logger;
        Config = config;
        _runner = runner;
        TimeProvider = timeProvider ?? System.TimeProvider.System;
    }

    /// <inheritdoc />
    public abstract string Name { get; }

    /// <summary>
    /// Cron expression evaluated each tick. Return empty/whitespace to disable the job
    /// without unregistering it.
    /// </summary>
    protected abstract string CronExpression { get; }

    /// <summary>
    /// Actual work performed when the cron is past due. Receives a per-job cancellation
    /// token already linked to a configured timeout.
    /// </summary>
    protected abstract Task ExecuteAsync(CancellationToken cancellationToken);

    /// <inheritdoc />
    public async Task TickAsync(CancellationToken cancellationToken)
    {
        var cron = CronExpression;
        if (string.IsNullOrWhiteSpace(cron))
            return;

        CrontabSchedule? schedule;
        try
        {
            schedule = CrontabSchedule.TryParse(cron);
        }
        catch (Exception ex)
        {
            Logger.LogWarning(ex,
                "SingletonCronJob({JobName}): invalid cron '{Cron}', skipping tick", Name, cron);
            await RaiseConfigurationInvalidAsync(cron, ex.Message);
            return;
        }

        if (schedule == null)
        {
            Logger.LogWarning(
                "SingletonCronJob({JobName}): cron '{Cron}' parsed to null, skipping tick", Name, cron);
            await RaiseConfigurationInvalidAsync(cron, "CrontabSchedule.TryParse returned null");
            return;
        }

        var now = TimeProvider.GetUtcNow().UtcDateTime;
        DateTime? cronAnchor = null;

        // Read prior state from a short-lived scope. Treat absence per Scheduler.MissedRunPolicy.
        await using (var scope = ServiceProvider.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ModularCADbContext>();
            var state = await db.SchedulerJobStates.AsNoTracking()
                .FirstOrDefaultAsync(s => s.JobName == Name, cancellationToken);

            if (state?.LastRunUtc != null)
            {
                var nextOccurrence = schedule.GetNextOccurrence(state.LastRunUtc.Value);
                if (now < nextOccurrence)
                    return;
                cronAnchor = nextOccurrence;
            }
            else
            {
                // No prior history. SkipMissed → wait until the next natural occurrence.
                if (string.Equals(Config.Scheduler.MissedRunPolicy, "SkipMissed",
                        StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }
                // RunOnce / RunAll → fire immediately, anchor to the MOST RECENT PAST OCCURRENCE
                // (not 'now') so subsequent schedule.GetNextOccurrence(LastRunUtc) stays aligned
                // to the cron grid. Anchoring to 'now' permanently drifts the schedule off-grid.
                cronAnchor = ComputeAnchorForFirstRun(schedule, now);
            }
        }

        // Past due. Run via the shared runner (handles timeout/metrics/audit/state).
        var nextRun = schedule.GetNextOccurrence(now);
        await _runner.RunAsync(
            Name,
            ExecuteAsync,
            cancellationToken,
            cronAnchor: cronAnchor,
            nextRunOverride: nextRun);
    }

    /// <summary>
    /// Computes the most recent past cron occurrence relative to <paramref name="now"/> so
    /// first-run anchoring lands on the cron grid rather than on wall-clock. NCrontab only
    /// exposes <c>GetNextOccurrence</c>, so we back up by one reasonable cron cycle and walk
    /// forward. 25 hours covers every cron we care about (daily crons are the slowest common
    /// case); sub-minute crons don't exist in our config since <c>CrontabSchedule</c> parses
    /// minute-granular.
    /// </summary>
    internal static DateTime ComputeAnchorForFirstRun(CrontabSchedule schedule, DateTime now)
    {
        var nextFromNow = schedule.GetNextOccurrence(now);
        var lookback = now.AddHours(-25);
        var occurrence = lookback;
        while (true)
        {
            var next = schedule.GetNextOccurrence(occurrence);
            if (next > now || next == nextFromNow) return occurrence;
            occurrence = next;
        }
    }

    /// <summary>
    /// Raises a <c>SchedulerConfigurationInvalid</c> alert when the cron expression fails to
    /// parse. Best-effort — failures here are logged and swallowed so a misconfigured cron
    /// can't break the scheduler loop.
    /// </summary>
    private async Task RaiseConfigurationInvalidAsync(string cron, string parseError)
    {
        try
        {
            await using var scope = ServiceProvider.CreateAsyncScope();
            var alerts = scope.ServiceProvider.GetService<ISecurityAlertService>();
            if (alerts != null)
            {
                await alerts.RaiseAlertAsync(
                    "SchedulerConfigurationInvalid",
                    AlertSeverity.Warning,
                    $"Scheduled job '{Name}' has invalid cron '{cron}': {parseError}",
                    new { JobName = Name, CronExpression = cron, ParseError = parseError });
            }
        }
        catch
        {
            // Alert raise failed — don't cascade.
        }
    }
}
