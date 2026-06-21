using Microsoft.Extensions.Logging;
using ModularCA.Core.Services;
using ModularCA.Shared.Models.Config;

namespace ModularCA.Core.Services.SchedulerJobs;

/// <summary>
/// Scheduled job that synchronizes user roles from LDAP group memberships. Failures
/// propagate to the scheduler which owns metrics, alerts, and audit emission.
/// <para>
/// Inherits <see cref="SingletonCronJob"/> so the base class owns past-due math
/// against <c>LdapAuth.GroupSyncSchedule</c>, missed-run policy, timeout enforcement,
/// metrics, and <c>SchedulerJobStates</c> persistence. The cron source is the new
/// <c>LdapAuth.GroupSyncSchedule</c> property (defaults to <c>"*/10 * * * *"</c>),
/// gated on the existing <c>LdapAuth.GroupSyncEnabled</c> flag. The
/// <see cref="RunAsync"/> entry point is retained as the operator-facing manual-run
/// path: <c>SchedulerJobRegistry.RunNowAsync</c> calls it directly when an operator
/// clicks "Run Now" in the admin Schedules page — bypassing the cron past-due gate
/// that <see cref="SingletonCronJob.TickAsync"/> evaluates so the work fires immediately
/// regardless of schedule.
/// </para>
/// </summary>
public class LdapGroupSyncJob : SingletonCronJob
{
    private readonly ILdapGroupSyncService _syncService;
    private readonly SystemConfig _config;
    private readonly ILogger<LdapGroupSyncJob> _logger;

    /// <summary>
    /// Initializes a new instance of <see cref="LdapGroupSyncJob"/>. Forwards the
    /// service provider, logger, config, and runner to the <see cref="SingletonCronJob"/>
    /// base so the shared scheduling/locking machinery wires up correctly.
    /// </summary>
    public LdapGroupSyncJob(
        IServiceProvider serviceProvider,
        ILdapGroupSyncService syncService,
        SystemConfig config,
        ILogger<LdapGroupSyncJob> logger,
        SchedulerJobRunner runner)
        : base(serviceProvider, logger, config, runner)
    {
        _syncService = syncService;
        _config = config;
        _logger = logger;
    }

    /// <inheritdoc />
    public override string Name => "LdapGroupSync";

    /// <summary>
    /// Cron expression for the LDAP group sync. Returns <see cref="string.Empty"/> when
    /// <c>LdapAuth.GroupSyncEnabled</c> is false, which the base
    /// <see cref="SingletonCronJob.TickAsync"/> treats as "skip without state write".
    /// </summary>
    protected override string CronExpression =>
        _config.LdapAuth.GroupSyncEnabled
            ? _config.LdapAuth.GroupSyncSchedule
            : string.Empty;

    /// <summary>
    /// Manual-run shim. <c>SchedulerJobRegistry.RunNowAsync</c> calls this when an
    /// operator clicks "Run Now" for this job — bypassing the cron past-due gate that
    /// <see cref="SingletonCronJob.TickAsync"/> evaluates so the work fires immediately
    /// regardless of schedule. The protected <see cref="ExecuteAsync"/> body is invoked
    /// directly.
    /// </summary>
    public Task RunAsync(CancellationToken cancellationToken) => ExecuteAsync(cancellationToken);

    /// <summary>
    /// Invokes <c>ILdapGroupSyncService.SyncAllUsersAsync</c>, honoring the supplied
    /// cancellation token. Exceptions bubble up to the scheduler's outer catch.
    /// </summary>
    protected override Task ExecuteAsync(CancellationToken cancellationToken)
    {
        // CronExpression already short-circuits when group sync is disabled. The check
        // here is defense-in-depth for the manual-run RunAsync path which bypasses
        // the cron evaluation in the base class.
        if (!_config.LdapAuth.GroupSyncEnabled)
        {
            _logger.LogDebug("LdapGroupSyncJob: GroupSyncEnabled is false; skipping.");
            return Task.CompletedTask;
        }

        _logger.LogDebug("LdapGroupSyncJob: invoking SyncAllUsersAsync");
        return _syncService.SyncAllUsersAsync(cancellationToken);
    }
}
