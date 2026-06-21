using ModularCA.Shared.Models.Acme;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Manages ACME account lifecycle including creation, lookup, updates, deactivation, and key changes.
/// </summary>
public interface IAcmeAccountService
{
    /// <summary>
    /// Creates a new ACME account with the specified JWK and contact information.
    /// <paramref name="caLabel"/> is persisted so later requests
    /// to the plain <c>/api/v1/acme/account/{id}</c> endpoint can still resolve
    /// the right CA context.
    /// </summary>
    Task<AcmeAccountDto> CreateAsync(string jwkJson, string thumbprint, List<string>? contacts, bool termsAgreed, string? caLabel = null);

    /// <summary>
    /// Returns the full <see cref="ModularCA.Shared.Entities.AcmeAccountEntity"/> status string
    /// (e.g. <c>Valid</c>, <c>Deactivated</c>). Callers need the
    /// raw status to reject deactivated accounts on <c>new-account</c> fast path.
    /// </summary>
    Task<string?> GetStatusByThumbprintAsync(string thumbprint);

    /// <summary>
    /// Returns the CA label the account was created under, or
    /// null if none was stored.
    /// </summary>
    Task<string?> GetCaLabelByIdAsync(Guid id);

    /// <summary>
    /// Retrieves an ACME account by its ID.
    /// </summary>
    Task<AcmeAccountDto?> GetByIdAsync(Guid id);

    /// <summary>
    /// Retrieves an ACME account by its JWK thumbprint.
    /// </summary>
    Task<AcmeAccountDto?> GetByThumbprintAsync(string thumbprint);

    /// <summary>
    /// Updates an existing ACME account's contacts or terms agreement.
    /// </summary>
    Task<AcmeAccountDto> UpdateAsync(Guid id, UpdateAcmeAccountRequest request);

    /// <summary>
    /// Deactivates an ACME account, preventing further use.
    /// </summary>
    Task<AcmeAccountDto> DeactivateAsync(Guid id);

    /// <summary>
    /// Gets the raw JWK JSON for an ACME account by ID.
    /// </summary>
    Task<string?> GetJwkByIdAsync(Guid id);

    /// <summary>
    /// Changes the key associated with an ACME account.
    /// </summary>
    Task KeyChangeAsync(Guid accountId, string newJwkJson, string newThumbprint);
}
