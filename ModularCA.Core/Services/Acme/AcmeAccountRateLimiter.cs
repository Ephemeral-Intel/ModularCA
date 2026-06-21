using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using ModularCA.Shared.Interfaces;

namespace ModularCA.Core.Services.Acme;

/// <summary>
/// Per-account rate limiter for ACME operations. Runs in
/// addition to the IP-based limits enforced by
/// <c>ProtocolRateLimitMiddleware</c>. Tracks <c>new-order</c>, <c>finalize</c>,
/// and <c>failed-validation</c> buckets keyed on the ACME account id so an
/// attacker who opens one account can't amplify abuse by rotating IPs.
/// <para>
/// Storage uses <see cref="IDistributedCache"/> when available (same approach
/// as <see cref="LoginRateLimitMiddleware"/>) with a process-local fallback.
/// </para>
/// Default limits mirror Let's Encrypt Boulder's public limits:
/// <list type="bullet">
/// <item><description>new-order: 20/hour per account</description></item>
/// <item><description>finalize: 10/hour per account</description></item>
/// <item><description>failed-validation: 5/hour per account</description></item>
/// </list>
/// </summary>
public class AcmeAccountRateLimiter(IDistributedCache? cache = null) : IAcmeAccountRateLimiter
{
    private readonly IDistributedCache? _cache = cache;

    // Process-local fallback for when the distributed cache isn't wired.
    private static readonly ConcurrentDictionary<string, Queue<DateTime>> _local = new();

    /// <summary>
    /// Default per-account hourly caps. Operators can tune these via a future
    /// config section if the need arises; right now they're baked in because
    /// the spec case is already quite loose.
    /// </summary>
    private static readonly (int max, TimeSpan window) NewOrderLimit = (20, TimeSpan.FromHours(1));
    private static readonly (int max, TimeSpan window) FinalizeLimit = (10, TimeSpan.FromHours(1));
    private static readonly (int max, TimeSpan window) FailedValidationLimit = (5, TimeSpan.FromHours(1));

    /// <summary>Returns <c>true</c> if the caller may proceed, <c>false</c> if the limit was exceeded.</summary>
    public Task<bool> TryRecordNewOrderAsync(Guid accountId)
        => TryRecordAsync($"acme-acct:{accountId}:new-order", NewOrderLimit.max, NewOrderLimit.window);

    /// <summary>Returns <c>true</c> if the caller may proceed, <c>false</c> if the limit was exceeded.</summary>
    public Task<bool> TryRecordFinalizeAsync(Guid accountId)
        => TryRecordAsync($"acme-acct:{accountId}:finalize", FinalizeLimit.max, FinalizeLimit.window);

    /// <summary>Increments the failed-validation counter; returns <c>true</c> if the account is still under budget.</summary>
    public Task<bool> TryRecordFailedValidationAsync(Guid accountId)
        => TryRecordAsync($"acme-acct:{accountId}:failed-validation", FailedValidationLimit.max, FailedValidationLimit.window);

    private async Task<bool> TryRecordAsync(string key, int max, TimeSpan window)
    {
        var now = DateTime.UtcNow;
        if (_cache != null)
        {
            try
            {
                var raw = await _cache.GetStringAsync(key);
                var timestamps = raw != null
                    ? JsonSerializer.Deserialize<List<long>>(raw) ?? new List<long>()
                    : new List<long>();
                var cutoff = now - window;
                timestamps.RemoveAll(t => DateTime.FromBinary(t) < cutoff);
                if (timestamps.Count >= max)
                {
                    await _cache.SetStringAsync(key, JsonSerializer.Serialize(timestamps),
                        new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = window });
                    return false;
                }
                timestamps.Add(now.ToBinary());
                await _cache.SetStringAsync(key, JsonSerializer.Serialize(timestamps),
                    new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = window });
                return true;
            }
            catch
            {
                // Fall through to local fallback on cache failure.
            }
        }

        var queue = _local.GetOrAdd(key, _ => new Queue<DateTime>());
        lock (queue)
        {
            while (queue.Count > 0 && now - queue.Peek() > window) queue.Dequeue();
            if (queue.Count >= max) return false;
            queue.Enqueue(now);
            return true;
        }
    }
}
