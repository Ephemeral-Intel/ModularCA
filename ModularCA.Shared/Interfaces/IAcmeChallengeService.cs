using ModularCA.Shared.Models.Acme;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Manages ACME challenge creation, validation, and response for HTTP-01 and DNS-01 challenges.
/// </summary>
public interface IAcmeChallengeService
{
    /// <summary>
    /// Retrieves an ACME challenge by its ID.
    /// </summary>
    Task<AcmeChallengeDto?> GetByIdAsync(Guid challengeId, string baseUrl);

    /// <summary>
    /// Records a client response to a challenge and initiates validation.
    /// </summary>
    Task<AcmeChallengeDto> RespondAsync(Guid challengeId, string accountThumbprint, string baseUrl);

    /// <summary>
    /// Validates an HTTP-01 challenge by checking the well-known token endpoint.
    /// </summary>
    Task ValidateHttp01Async(Guid challengeId, string accountThumbprint);

    /// <summary>
    /// Validates a DNS-01 challenge by checking the _acme-challenge TXT record.
    /// </summary>
    Task ValidateDns01Async(Guid challengeId, string accountThumbprint);

    /// <summary>
    /// Gets the parent authorization ID for a given challenge.
    /// </summary>
    Task<Guid?> GetAuthorizationIdForChallengeAsync(Guid challengeId);

    /// <summary>
    /// Retrieves the account ID that owns the order containing this challenge's authorization.
    /// </summary>
    Task<Guid?> GetAccountIdForChallengeAsync(Guid challengeId);

    /// <summary>
    /// Reconciles challenges stuck in <c>Processing</c>. Used
    /// by <c>AcmeCleanupJob</c>. Transitions exhausted challenges to
    /// <c>Invalid</c>; retries remaining challenges back to <c>Pending</c>.
    /// Returns the number of challenges touched.
    /// </summary>
    Task<int> ReconcileStuckChallengesAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Cheap pre-check used by the cleanup job.
    /// </summary>
    Task<bool> HasStuckChallengesAsync(CancellationToken cancellationToken = default);
}
