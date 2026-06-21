namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Per-ACME-account rate limiter. Each method returns
/// <c>true</c> when the operation may proceed and <c>false</c> when the
/// account-scoped budget is exhausted. The call increments the counter as a
/// side effect so callers don't need to separately record successes.
/// </summary>
public interface IAcmeAccountRateLimiter
{
    /// <summary>Counter for <c>new-order</c> calls (default 20/hour/account).</summary>
    Task<bool> TryRecordNewOrderAsync(Guid accountId);

    /// <summary>Counter for <c>order/{id}/finalize</c> calls (default 10/hour/account).</summary>
    Task<bool> TryRecordFinalizeAsync(Guid accountId);

    /// <summary>
    /// Counter incremented on every failed challenge validation for this
    /// account. Default 5/hour/account; further new-order calls from the same
    /// account are rejected with <c>rateLimited</c> once the budget is spent.
    /// </summary>
    Task<bool> TryRecordFailedValidationAsync(Guid accountId);
}
