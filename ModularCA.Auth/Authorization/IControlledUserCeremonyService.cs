using ModularCA.Shared.Authorization;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Models;

namespace ModularCA.Auth.Authorization;

/// <summary>
/// Orchestrates ceremony-gated changes to a <i>controlled user</i>'s privileges. A non-super
/// actor who promotes (grants), demotes (revokes), or deletes a user holding an
/// admin/operator/CA-admin tier must route the change through a
/// <see cref="Shared.Enums.CeremonyType.ControlledUserChange"/> ceremony; system-super applies
/// directly. Approvers must hold a tier that <see cref="ControlledTier.Dominates"/> the change.
/// Stage 1 implements the capability-grant (promote) path.
/// </summary>
public interface IControlledUserCeremonyService
{
    /// <summary>
    /// Classifies the tier a direct capability grant would confer, or <c>null</c> when the
    /// capability is not privilege-controlled (no ceremony required).
    /// </summary>
    ControlledTier? ClassifyCapabilityGrant(string capability, Guid? certificateAuthorityId);

    /// <summary>
    /// Classifies the tier a role assignment would confer (the role carries a controlled
    /// capability), or <c>null</c> when the role is not privilege-controlled.
    /// </summary>
    Task<ControlledTier?> ClassifyRoleAssignmentAsync(Guid roleId, Guid? certificateAuthorityId);

    /// <summary>
    /// Classifies the tier that membership in <paramref name="group"/> confers (a system group
    /// or a CA <c>Administrator</c> group), or <c>null</c> when the group is not privilege-controlled.
    /// </summary>
    ControlledTier? ClassifyGroup(CaGroupEntity group);

    /// <summary>
    /// Opens a <c>ControlledUserChange</c> ceremony for an arbitrary deferred change described by
    /// <paramref name="parameters"/>. Returns the ceremony id; threshold = resolved user quorum.
    /// </summary>
    Task<Guid> InitiateChangeAsync(
        ControlledUserChangeParameters parameters,
        ControlledTier minted,
        Guid initiatorUserId,
        string initiatorUsername);

    /// <summary>True when the actor is system-super (super applies privilege changes directly).</summary>
    Task<bool> IsSuperAsync(Guid userId);

    /// <summary>The privilege tiers the user currently holds (via group membership).</summary>
    Task<IReadOnlyList<ControlledTier>> GetUserTiersAsync(Guid userId);

    /// <summary>
    /// The tier an approver must dominate to delete this user, or <c>null</c> if the user holds no
    /// controlled tier (delete is uncontrolled). Collapses multi-CA holders up to system-admin
    /// since only system-tier dominates across CAs.
    /// </summary>
    Task<ControlledTier?> GetDeletionTierAsync(Guid userId);

    /// <summary>
    /// True when the actor holds a tier that dominates <paramref name="minted"/> — i.e. they're
    /// permitted to initiate (propose) a change affecting that tier.
    /// </summary>
    Task<bool> CanInitiateAsync(Guid userId, ControlledTier minted);

    /// <summary>
    /// Approver eligibility for a <c>ControlledUserChange</c> ceremony: the approver must dominate
    /// the ceremony's affected tier and must not be the change's target user.
    /// </summary>
    Task<bool> CanApproveAsync(Guid approverUserId, KeyCeremonyEntity ceremony);

    /// <summary>
    /// Opens a <c>ControlledUserChange</c> ceremony for a deferred capability grant. Returns the
    /// ceremony id. The approval threshold is the resolved <i>user quorum</i>.
    /// </summary>
    Task<Guid> InitiateCapabilityGrantAsync(
        Guid targetUserId,
        string? targetUsername,
        string capability,
        Guid? tenantId,
        Guid? certificateAuthorityId,
        string? resourceType,
        Guid? resourceId,
        ControlledTier minted,
        Guid initiatorUserId,
        string initiatorUsername);

    /// <summary>
    /// Counts the controlled users (other than <paramref name="excludeUserId"/>) who hold a tier
    /// that dominates <paramref name="minted"/>. Used by demote/delete to hard-refuse removing the
    /// last dominating controlled user of a scope.
    /// </summary>
    Task<int> CountDominatingControlledUsersAsync(ControlledTier minted, Guid excludeUserId);

    /// <summary>Applies an approved controlled-user ceremony on execute. Returns a summary for audit.</summary>
    Task<ControlledUserChangeResult> ApplyApprovedAsync(Guid ceremonyId);
}
