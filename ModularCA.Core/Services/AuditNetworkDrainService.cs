using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using Prometheus;

namespace ModularCA.Core.Services;

/// <summary>
/// Replaces the fire-and-forget <c>Task.Run</c> pattern in
/// <c>RequestAuditMiddleware</c> with a bounded <see cref="Channel{T}"/> consumer that
/// batches <see cref="AuditNetworkEntity"/> inserts. Enqueues are non-blocking — if the
/// channel is full the row is dropped and a metric is bumped so operators can alert on
/// data loss. The consumer flushes on a size trigger (100 rows) or a time trigger (1 s)
/// whichever fires first, which keeps AuditNetwork writes off the request hot path
/// under ACME/OCSP fan-out load.
/// </summary>
public class AuditNetworkDrainService : BackgroundService
{
    private const int ChannelCapacity = 10_000;
    private const int FlushBatchSize = 100;
    private static readonly TimeSpan FlushInterval = TimeSpan.FromSeconds(1);

    // Drops are counted so a sustained flood under ACME fan-out
    // shows up in the metrics pipeline. Without this the loss is invisible.
    private static readonly Counter DroppedCounter = Metrics.CreateCounter(
        "modularca_audit_network_dropped_total",
        "AuditNetwork rows dropped because the drain channel was full or the service was stopping");

    private static readonly Channel<AuditNetworkEntity> _channel = Channel.CreateBounded<AuditNetworkEntity>(
        new BoundedChannelOptions(ChannelCapacity)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
            SingleWriter = false,
        });

    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AuditNetworkDrainService> _logger;

    /// <summary>
    /// Constructs the drain service. The service provider is used to create a scoped
    /// <see cref="AuditDbContext"/> per batch — the background service lifetime is
    /// singleton so scoped contexts cannot be field-injected.
    /// </summary>
    public AuditNetworkDrainService(IServiceProvider serviceProvider, ILogger<AuditNetworkDrainService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    /// <summary>
    /// Enqueue an <see cref="AuditNetworkEntity"/> for batched insert.
    /// Returns <c>true</c> on success; <c>false</c> (and bumps the drop counter) if the
    /// channel is full. Callers must treat a <c>false</c> return as "row lost" — never
    /// block on the channel write, because the request pipeline cannot afford to wait
    /// on the audit sink.
    /// </summary>
    public static bool TryEnqueue(AuditNetworkEntity entity)
    {
        if (_channel.Writer.TryWrite(entity))
            return true;

        try { DroppedCounter.Inc(); } catch { /* counter registration must never crash caller */ }
        return false;
    }

    /// <summary>
    /// Consumer loop. Collects up to <see cref="FlushBatchSize"/> entities or waits up to
    /// <see cref="FlushInterval"/> before persisting a partial batch. Failures log and
    /// increment the drop counter so the rows aren't silently lost from the metrics view.
    /// </summary>
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AuditNetworkDrainService started (capacity={Capacity}, flushBatch={Batch}, flushInterval={Interval}s)",
            ChannelCapacity, FlushBatchSize, FlushInterval.TotalSeconds);

        var batch = new List<AuditNetworkEntity>(FlushBatchSize);
        var reader = _channel.Reader;

        while (!stoppingToken.IsCancellationRequested)
        {
            batch.Clear();
            using var flushCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            flushCts.CancelAfter(FlushInterval);

            try
            {
                // Block until at least one row is available (or cancellation fires).
                while (batch.Count < FlushBatchSize)
                {
                    if (batch.Count == 0)
                    {
                        try
                        {
                            if (!await reader.WaitToReadAsync(stoppingToken))
                                return; // channel completed — service stopping
                        }
                        catch (OperationCanceledException) { return; }
                    }

                    if (!reader.TryRead(out var item))
                    {
                        if (batch.Count > 0)
                            break; // flush what we have
                        try
                        {
                            await Task.Delay(FlushInterval, stoppingToken);
                        }
                        catch (OperationCanceledException) { return; }
                        continue;
                    }

                    batch.Add(item);
                    // If we hit the time window after the first row, break out to flush.
                    if (flushCts.IsCancellationRequested)
                        break;
                }
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
            {
                // Flush timer fired — fall through and persist whatever we have.
            }

            if (batch.Count == 0)
                continue;

            try
            {
                using var scope = _serviceProvider.CreateScope();
                var auditDb = scope.ServiceProvider.GetService<AuditDbContext>();
                if (auditDb == null)
                {
                    // No audit DB in this process — drop the batch and count it.
                    DroppedCounter.Inc(batch.Count);
                    continue;
                }

                auditDb.AuditNetwork.AddRange(batch);
                await auditDb.SaveChangesAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                DroppedCounter.Inc(batch.Count);
                return;
            }
            catch (Exception ex)
            {
                // Increment the audit failure counter labelled by exception type so the
                // existing alerting pipeline fires. Also bump the drop counter.
                try { MetricsService.AuditWritesFailed.WithLabels(ex.GetType().Name).Inc(); } catch { }
                DroppedCounter.Inc(batch.Count);
                _logger.LogError(ex, "AuditNetworkDrainService batch insert failed; {Count} rows dropped", batch.Count);
            }
        }

        // Best-effort final drain on shutdown: pull anything still buffered and try to
        // persist it. Anything that can't flush in the shutdown window is dropped.
        await FinalDrainAsync();
    }

    /// <summary>
    /// Final drain on shutdown. Pulls any remaining rows out of the channel and
    /// attempts one last batched insert under a short deadline.
    /// </summary>
    private async Task FinalDrainAsync()
    {
        try
        {
            var remaining = new List<AuditNetworkEntity>();
            while (_channel.Reader.TryRead(out var item))
            {
                remaining.Add(item);
                if (remaining.Count >= FlushBatchSize * 4) break;
            }
            if (remaining.Count == 0) return;

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            using var scope = _serviceProvider.CreateScope();
            var auditDb = scope.ServiceProvider.GetService<AuditDbContext>();
            if (auditDb == null) { DroppedCounter.Inc(remaining.Count); return; }

            auditDb.AuditNetwork.AddRange(remaining);
            await auditDb.SaveChangesAsync(cts.Token);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AuditNetworkDrainService final drain failed");
        }
    }
}
