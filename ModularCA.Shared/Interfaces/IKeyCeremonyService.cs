using ModularCA.Shared.Entities;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Manages key ceremony workflows for catastrophic CA operations requiring multi-party approval.
/// Ceremonies enforce quorum-based authorization, self-approval prevention, and 24-hour expiry.
/// </summary>
public interface IKeyCeremonyService
{
    /// <summary>
    /// Initiates a new key ceremony. If the resolved quorum is 1, the ceremony is auto-executed immediately.
    /// </summary>
    /// <param name="operationType">The operation type (e.g., CreateRootCA, RevokeCA).</param>
    /// <param name="description">Human-readable description of the operation.</param>
    /// <param name="targetEntityId">The ID of the target entity (e.g., CA ID).</param>
    /// <param name="initiatorUserId">The user ID of the initiator.</param>
    /// <param name="initiatorUsername">The username of the initiator.</param>
    /// <param name="parametersJson">Serialized JSON of the operation parameters.</param>
    /// <param name="quorumOverride">Optional explicit quorum. If null, resolved from the CA admin group.</param>
    /// <returns>The created ceremony entity.</returns>
    Task<KeyCeremonyEntity> InitiateAsync(
        string operationType,
        string description,
        string targetEntityId,
        Guid initiatorUserId,
        string initiatorUsername,
        string parametersJson,
        int? quorumOverride = null);

    /// <summary>
    /// Records an approval for a pending ceremony. Prevents self-approval by the initiator.
    /// When approvals reach the quorum threshold, the ceremony status transitions to Approved.
    /// </summary>
    /// <returns>The updated ceremony entity.</returns>
    Task<KeyCeremonyEntity> ApproveAsync(Guid ceremonyId, Guid approverId, string approverUsername);

    /// <summary>
    /// Rejects a pending ceremony, setting its status to Rejected.
    /// </summary>
    /// <returns>The updated ceremony entity.</returns>
    Task<KeyCeremonyEntity> RejectAsync(Guid ceremonyId, Guid rejectorId, string rejectorUsername);

    /// <summary>
    /// Cancels a pending ceremony. Only the original initiator may cancel.
    /// </summary>
    /// <returns>The updated ceremony entity.</returns>
    Task<KeyCeremonyEntity> CancelAsync(Guid ceremonyId, Guid requestorId);

    /// <summary>
    /// Marks a ceremony as executed after the operation has been carried out.
    /// </summary>
    Task MarkExecutedAsync(Guid ceremonyId);

    /// <summary>
    /// Retrieves a ceremony by its ID.
    /// </summary>
    Task<KeyCeremonyEntity?> GetByIdAsync(Guid ceremonyId);

    /// <summary>
    /// Lists all ceremonies, optionally filtered by status.
    /// </summary>
    Task<List<KeyCeremonyEntity>> ListAsync(string? statusFilter = null);

    /// <summary>
    /// Lists ceremonies filtered to specific tenant IDs, optionally filtered by status.
    /// </summary>
    Task<List<KeyCeremonyEntity>> ListByTenantsAsync(IEnumerable<Guid> tenantIds, string? statusFilter = null);

    /// <summary>
    /// Expires all pending ceremonies whose ExpiresAt has passed.
    /// </summary>
    Task<int> ExpireStaleCeremoniesAsync();
}
