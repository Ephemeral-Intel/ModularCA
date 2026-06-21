using ModularCA.Shared.Models.Acme;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Manages ACME authorization objects for domain validation during certificate issuance.
/// </summary>
public interface IAcmeAuthorizationService
{
    /// <summary>
    /// Retrieves an ACME authorization by its ID.
    /// </summary>
    Task<AcmeAuthorizationDto?> GetByIdAsync(Guid authzId, string baseUrl);

    /// <summary>
    /// Gets all authorizations associated with an ACME order.
    /// </summary>
    Task<List<AcmeAuthorizationDto>> GetByOrderIdAsync(Guid orderId, string baseUrl);

    /// <summary>
    /// Deactivates an authorization, stopping further challenge processing.
    /// </summary>
    Task DeactivateAsync(Guid authzId);

    /// <summary>
    /// Evaluates whether all challenges for an authorization are satisfied.
    /// </summary>
    Task EvaluateAsync(Guid authzId);

    /// <summary>
    /// Retrieves the account ID that owns the order containing this authorization.
    /// </summary>
    Task<Guid?> GetAccountIdForAuthorizationAsync(Guid authzId);
}
