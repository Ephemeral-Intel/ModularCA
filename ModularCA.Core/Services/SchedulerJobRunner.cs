using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Config;
using System.Diagnostics;

namespace ModularCA.Core.Services;

/// <summary>
/// Runs a single scheduler-job execution with all the cross-cutting machinery: per-job timeout,
/// Prometheus metrics, <c>SchedulerJobStates</c> persistence, consecutive-failure escalation,
/// and <c>SchedulerJobFailed</c> alert + audit on failure. Extracted from the legacy
/// <c>SchedulerService.RunJobAsync</c> so that the job classes themselves (via <c>SingletonCronJob</c>
/// and <c>PerRowScheduledJob</c> base classes) can call into it directly without
/// <c>SchedulerService</c> needing to know each job's scheduling shape.
/// </summary>
/// <remarks>
/// <para>
/// The runner owns the <c>SchedulerJobStates</c> row write per execution — if you don't want a
/// state row written (e.g. a tick that decided nothing was due), do not invoke <see cref="RunAsync"/>.
/// </para>
/// <para>
/// Per-row jobs (CRL export, LDAP publish) call <see cref="RunAsync"/> once per past-due row,
/// passing a unique <c>jobName</c> like <c>"CrlExport:{guid}"</c>; each row gets its own
/// <c>SchedulerJobStates</c> entry and consecutive-failure counter. The <c>jobName</c> prefix
/// (everything before the first <c>:</c>) is used for timeout lookup so all rows of a class
/// share the same timeout configuration.
/// </para>
/// </remarks>
public class SchedulerJobRunner
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SchedulerJobRunner> _logger;
    private readonly SystemConfig _config;
    private readonly TimeProvider _timeProvider;

    /// <summary>Per-instance ID exposed for diagnostics; injected by the scheduler.</summary>
    private readonly string _instanceId;

    /// <summary>
    /// Initializes a new instance. <paramref name="instanceId"/> is the scheduler's per-process
    /// GUID (used in failure-alert payloads); pass <c>SchedulerService.InstanceId</c>.
    /// </summary>
    public SchedulerJobRunner(
        IServiceProvider serviceProvider,
        ILogger<SchedulerJobRunner> logger,
        SystemConfig config,
        string instanceId,
        TimeProvider? timeProvider = null)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _config = config;
        _instanceId = instanceId;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>
    /// Executes <paramref name="body"/> with the standard wrapping. The body receives a
    /// per-job <see cref="CancellationToken"/> already linked to the global stopping token AND
    /// to a per-job timeout derived from <c>Scheduler.JobTimeouts</c> (or
    /// <c>DefaultJobTimeoutSeconds</c>).
    /// </summary>
    /// <param name="jobName">Stable metric/audit key. May include a <c>:rowId</c> suffix for per-row jobs.</param>
    /// <param name="body">The actual work to perform; the body resolves its own services from a fresh DI scope inside, since this runner does not create one (job bases own scope creation so they can pass scoped services to the body).</param>
    /// <param name="stoppingToken">Global background-service stopping token.</param>
    /// <param name="cronAnchor">Optional matched-occurrence timestamp; when set, <c>LastRunUtc</c> is anchored to this value instead of <c>now</c> (prevents cron drift under DST/NTP steps).</param>
    /// <param name="nextRunOverride">Optional next-run timestamp to write into <c>SchedulerJobStates.NextRunUtc</c>. Singleton cron jobs pass the next computed occurrence; per-row jobs pass <c>null</c> because their next-run lives on the row itself.</param>
    public async Task RunAsync(
        string jobName,
        Func<CancellationToken, Task> body,
        CancellationToken stoppingToken,
        DateTime? cronAnchor = null,
        DateTime? nextRunOverride = null)
    {
        if (stoppingToken.IsCancellationRequested) return;

        var timeout = ResolveJobTimeout(jobName);
        using var jobCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        jobCts.CancelAfter(timeout);
        var jobToken = jobCts.Token;

        var sw = Stopwatch.StartNew();
        string result = "success";
        string? errorMessage = null;
        bool shutdownCancelled = false;
        var startUtc = _timeProvider.GetUtcNow().UtcDateTime;

        try
        {
            await body(jobToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Graceful shutdown — do NOT persist state or escalate. Writing LastRunUtc
            // here would mislead missed-run policy on the next start (it'd think the
            // job ran successfully when it was just interrupted).
            result = "cancelled";
            shutdownCancelled = true;
            return;
        }
        catch (OperationCanceledException)
        {
            result = "cancelled";
            errorMessage = $"job timed out after {timeout.TotalSeconds:F0}s";
            _logger.LogWarning(
                "SchedulerJobRunner: job {JobName} cancelled after {Timeout}s",
                jobName, timeout.TotalSeconds);
        }
        catch (Exception ex)
        {
            result = "failed";
            errorMessage = ex.Message;
            _logger.LogError(ex, "SchedulerJobRunner: job {JobName} failed", jobName);
        }
        finally
        {
            sw.Stop();
            try
            {
                MetricsService.SchedulerJobRuns.WithLabels(jobName, result).Inc();
                MetricsService.SchedulerJobDuration.WithLabels(jobName).Observe(sw.Elapsed.TotalSeconds);
                if (result == "success")
                {
                    MetricsService.SchedulerJobLastSuccess.WithLabels(jobName)
                        .Set(_timeProvider.GetUtcNow().ToUnixTimeSeconds());
                }
            }
            catch { /* metric emission must never mask the real outcome */ }

            if (!shutdownCancelled)
            {
                // Bounded timeout for the state write so a hung MySQL connection doesn't
                // block this finally indefinitely. Independent of the job's stoppingToken
                // since we still want to record the outcome even if the host is shutting
                // down (the shutdownCancelled branch above already filtered that case).
                using var stateCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                try
                {
                    await PersistJobStateAsync(jobName, startUtc, sw.ElapsedMilliseconds, result, errorMessage, cronAnchor, nextRunOverride, stateCts.Token);
                }
                catch (Exception stateEx)
                {
                    _logger.LogWarning(stateEx,
                        "SchedulerJobRunner: failed to persist state for job {JobName}", jobName);
                }

                if (result == "failed")
                {
                    await HandleJobFailureAsync(jobName, errorMessage);
                }
            }
        }
    }

    /// <summary>
    /// Resolves the per-job timeout from <c>Scheduler.JobTimeouts</c>, falling back to
    /// <c>Scheduler.DefaultJobTimeoutSeconds</c>. Dynamic per-row names like
    /// <c>"CrlExport:{id}"</c> match the bare prefix.
    /// </summary>
    internal TimeSpan ResolveJobTimeout(string jobName)
    {
        var key = jobName.Contains(':') ? jobName[..jobName.IndexOf(':')] : jobName;
        if (_config.Scheduler.JobTimeouts.TryGetValue(key, out var seconds) && seconds > 0)
            return TimeSpan.FromSeconds(seconds);
        var fallback = _config.Scheduler.DefaultJobTimeoutSeconds;
        return TimeSpan.FromSeconds(fallback > 0 ? fallback : 120);
    }

    /// <summary>
    /// Writes / updates the <c>SchedulerJobStates</c> row for this execution. Always uses a
    /// fresh DI scope so cancellation of the job body doesn't poison the state write.
    /// </summary>
    private async Task PersistJobStateAsync(
        string jobName,
        DateTime startUtc,
        long durationMs,
        string result,
        string? errorMessage,
        DateTime? cronAnchor,
        DateTime? nextRunOverride,
        CancellationToken cancellationToken)
    {
        await using var scope = _serviceProvider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ModularCADbContext>();

        var row = await db.SchedulerJobStates
            .FirstOrDefaultAsync(s => s.JobName == jobName, cancellationToken);

        if (row == null)
        {
            row = new SchedulerJobStateEntity { JobName = jobName };
            db.SchedulerJobStates.Add(row);
        }

        row.LastRunUtc = cronAnchor ?? startUtc;
        row.LastResult = result;
        row.LastError = errorMessage == null ? null : Truncate(errorMessage, 2000);
        row.LastDurationMs = durationMs;
        if (result == "success")
        {
            row.ConsecutiveFailureCount = 0;
        }
        else if (result == "failed")
        {
            row.ConsecutiveFailureCount++;
        }

        if (nextRunOverride.HasValue)
        {
            row.NextRunUtc = nextRunOverride.Value;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    /// <summary>
    /// On consecutive-failure threshold, escalate the scheduler alert from Warning to Critical
    /// and write a <c>SchedulerJobFailed</c> audit row.
    /// </summary>
    private async Task HandleJobFailureAsync(string jobName, string? errorMessage)
    {
        try
        {
            await using var scope = _serviceProvider.CreateAsyncScope();
            var alerts = scope.ServiceProvider.GetService<ISecurityAlertService>();
            var audit = scope.ServiceProvider.GetService<IAuditService>();
            var db = scope.ServiceProvider.GetRequiredService<ModularCADbContext>();

            var state = await db.SchedulerJobStates
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.JobName == jobName);
            var failures = state?.ConsecutiveFailureCount ?? 1;
            var threshold = Math.Max(1, _config.Scheduler.ConsecutiveFailureAlertThreshold);
            var severity = failures >= threshold ? AlertSeverity.Critical : AlertSeverity.Warning;

            if (alerts != null)
            {
                await alerts.RaiseAlertAsync(
                    "SchedulerJobFailed",
                    severity,
                    $"Scheduled job '{jobName}' failed ({failures} consecutive): {errorMessage}",
                    new { JobName = jobName, ConsecutiveFailures = failures, Error = errorMessage, InstanceId = _instanceId });
            }

            if (audit != null)
            {
                await audit.LogAsync(
                    AuditActionType.SchedulerJobFailed,
                    actorUserId: null,
                    actorUsername: "system/scheduler",
                    targetEntityType: "SchedulerJob",
                    targetEntityId: jobName,
                    details: new { JobName = jobName, ConsecutiveFailures = failures, InstanceId = _instanceId },
                    success: false,
                    errorMessage: errorMessage);
            }
        }
        catch (Exception raiseEx)
        {
            _logger.LogWarning(raiseEx,
                "SchedulerJobRunner: alert/audit emit failed for job {JobName}", jobName);
        }
    }
}
