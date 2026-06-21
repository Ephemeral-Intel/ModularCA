using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ModularCA.Core.Services;
using ModularCA.Database;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Config;

namespace ModularCA.Core.Services.SchedulerJobs;

/// <summary>
/// Scheduled job that cleans up expired ACME orders and nonces. Honors the scheduler
/// job cancellation token through every downstream call.
/// Also reconciles ACME challenges stuck in <c>Processing</c>
/// past their timeout via <see cref="IAcmeChallengeService.ReconcileStuckChallengesAsync"/>.
///
/// Inherits <see cref="SingletonCronJob"/> so the base class owns past-due math against
/// <c>Acme.CleanupSchedule</c>, missed-run policy, timeout enforcement, metrics, and
/// <c>SchedulerJobStates</c> persistence — the body below is purely the per-tick
/// cleanup work. There is no master <c>Enabled</c> gate for ACME cleanup; the job is
/// internally idempotent (each branch is keyed on a "has work?" probe) so it's safe
/// to run on the default <c>"*/5 * * * *"</c> cadence regardless of ACME usage. The
/// <c>RunAsync(ct)</c> entry point is retained as the operator-facing manual-run path:
/// <c>SchedulerJobRegistry.RunNowAsync</c> calls it directly when an operator clicks
/// "Run Now" in the admin Schedules page — bypassing the cron past-due gate that
/// <see cref="SingletonCronJob.TickAsync"/> evaluates so the work fires immediately
/// regardless of schedule.
/// </summary>
public class AcmeCleanupJob : SingletonCronJob
{
    private readonly ILogger<AcmeCleanupJob> _logger;
    private readonly IAcmeOrderService _orderService;
    private readonly IAcmeNonceService _nonceService;
    private readonly IAcmeChallengeService _challengeService;
    private readonly IAuditService _audit;
    private readonly ModularCADbContext _db;
    private readonly SystemConfig _config;

    /// <summary>
    /// Initializes a new instance of <see cref="AcmeCleanupJob"/>. Takes the standard
    /// <see cref="SingletonCronJob"/> base dependencies plus the ACME-specific services
    /// and DB context required to expire stale orders, sweep nonces, reconcile stuck
    /// challenges, and clean up expired SCEP/CMP transaction rows.
    /// </summary>
    public AcmeCleanupJob(
        ILogger<AcmeCleanupJob> logger,
        IAcmeOrderService orderService,
        IAcmeNonceService nonceService,
        IAcmeChallengeService challengeService,
        IAuditService audit,
        ModularCADbContext db,
        SystemConfig config,
        IServiceProvider serviceProvider,
        SchedulerJobRunner runner)
        : base(serviceProvider, logger, config, runner)
    {
        _logger = logger;
        _orderService = orderService;
        _nonceService = nonceService;
        _challengeService = challengeService;
        _audit = audit;
        _db = db;
        _config = config;
    }

    /// <inheritdoc />
    public override string Name => "AcmeCleanup";

    /// <summary>
    /// Cron expression for the ACME cleanup sweep. No master <c>Enabled</c> gate —
    /// each step inside <see cref="ExecuteAsync"/> is internally idempotent and
    /// short-circuits when there is nothing to do, so running on the configured
    /// cadence even with no ACME traffic is cheap.
    /// </summary>
    protected override string CronExpression => _config.Acme.CleanupSchedule;

    /// <summary>
    /// Manual-run shim. <c>SchedulerJobRegistry.RunNowAsync</c> calls this when an
    /// operator clicks "Run Now" for this job — bypassing the cron past-due gate that
    /// <see cref="SingletonCronJob.TickAsync"/> evaluates so the work fires immediately
    /// regardless of schedule. The protected <see cref="ExecuteAsync"/> body is invoked
    /// directly.
    /// </summary>
    public Task RunAsync(CancellationToken cancellationToken) => ExecuteAsync(cancellationToken);

    /// <summary>
    /// Executes the ACME cleanup cycle. Honors <paramref name="cancellationToken"/>
    /// through every downstream call, expiring stale orders, cleaning expired
    /// nonces, and reconciling stuck challenges.
    /// </summary>
    protected override async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        var hasStaleOrders = await _orderService.HasStaleOrdersAsync(cancellationToken);
        var hasExpiredNonces = await _nonceService.HasExpiredNoncesAsync(cancellationToken);
        var hasStuckChallenges = await _challengeService.HasStuckChallengesAsync(cancellationToken);

        if (!hasStaleOrders && !hasExpiredNonces && !hasStuckChallenges)
            return;

        _logger.LogInformation("Running ACME cleanup job...");

        if (hasStaleOrders)
        {
            await _orderService.ExpireStaleOrdersAsync(cancellationToken);
            _logger.LogDebug("Expired stale ACME orders and authorizations.");
        }

        if (hasExpiredNonces)
        {
            await _nonceService.CleanupExpiredAsync(cancellationToken);
            _logger.LogDebug("Cleaned up expired ACME nonces.");
        }

        int reconciledChallenges = 0;
        if (hasStuckChallenges)
        {
            reconciledChallenges = await _challengeService.ReconcileStuckChallengesAsync(cancellationToken);
            _logger.LogDebug("Reconciled {Count} stuck ACME challenges.", reconciledChallenges);
        }

        await _audit.LogAsync(AuditActionType.AcmeCleanupCompleted, null, "Scheduler",
            details: new
            {
                StaleOrders = hasStaleOrders,
                ExpiredNonces = hasExpiredNonces,
                StuckChallenges = reconciledChallenges
            });

        // Sweep stale SCEP transactions (>10 min) + CMP
        // transactions (>1 hour). Hitchhikes on the ACME cleanup tick so we don't
        // have to register a second scheduler job. Failures propagate to the runner
        // so consecutive sweep failures escalate the same as any other tick failure.
        var scepCutoff = TimeProvider.GetUtcNow().UtcDateTime;
        var deletedScep = await _db.ScepTransactions
            .Where(t => t.ExpiresAt < scepCutoff)
            .ExecuteDeleteAsync(cancellationToken);
        if (deletedScep > 0)
            _logger.LogDebug("Swept {Count} expired SCEP transaction rows.", deletedScep);

        var cmpCutoff = TimeProvider.GetUtcNow().UtcDateTime.AddHours(-1);
        var deletedCmp = await _db.CmpTransactions
            .Where(t => t.CreatedAt < cmpCutoff)
            .ExecuteDeleteAsync(cancellationToken);
        if (deletedCmp > 0)
            _logger.LogDebug("Swept {Count} expired CMP transaction rows.", deletedCmp);

        _logger.LogInformation("ACME cleanup job completed.");
    }
}
