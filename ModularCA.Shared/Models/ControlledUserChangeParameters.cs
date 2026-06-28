namespace ModularCA.Shared.Models;

/// <summary>
/// Serialized into <c>KeyCeremonyEntity.ParametersJson</c> for a
/// <see cref="Enums.CeremonyType.ControlledUserChange"/> ceremony. Captures the deferred
/// privilege change (promote/demote/delete of a controlled user) plus the affected tier so
/// approver-dominance can be re-checked at approval time, and the change applied on execute.
/// </summary>
public class ControlledUserChangeParameters
{
    /// <summary>
    /// The kind of change. Stage 1 supports <c>GrantCapability</c>; later stages add
    /// <c>RevokeCapability</c>, <c>AssignRole</c>/<c>UnassignRole</c>,
    /// <c>AddGroupMember</c>/<c>RemoveGroupMember</c>, and <c>DeleteUser</c>.
    /// </summary>
    public string ChangeType { get; set; } = "GrantCapability";

    /// <summary>The user whose privileges change.</summary>
    public Guid TargetUserId { get; set; }

    /// <summary>The target user's username, captured for audit/description.</summary>
    public string? TargetUsername { get; set; }

    // ── Deferred capability-grant payload (ChangeType = GrantCapability) ──
    /// <summary>Capability to grant on execute.</summary>
    public string? Capability { get; set; }

    /// <summary>Tenant scope of the grant. Also used by the ceremony layer to stamp the ceremony's tenant.</summary>
    public Guid? TenantId { get; set; }

    /// <summary>CA scope of the grant.</summary>
    public Guid? CertificateAuthorityId { get; set; }

    /// <summary>Optional resource-type scope of the grant.</summary>
    public string? ResourceType { get; set; }

    /// <summary>Optional resource-id scope of the grant.</summary>
    public Guid? ResourceId { get; set; }

    // ── Role assignment / group membership payload ──
    /// <summary>
    /// Id of the record being removed on a demote change (the UserCapabilityGrant for
    /// RevokeCapability, the RoleAssignment for UnassignRole).
    /// </summary>
    public Guid? RecordId { get; set; }

    /// <summary>Role to assign (ChangeType = AssignRole).</summary>
    public Guid? RoleId { get; set; }

    /// <summary>
    /// Group involved: the target group for AddGroupMember, or the group a role is assigned to
    /// (AssignRole to a group rather than a user).
    /// </summary>
    public Guid? GroupId { get; set; }

    // ── Affected tier (for approver dominance) ──
    /// <summary><see cref="Authorization.ControlledTierLevel"/> of the privilege being changed.</summary>
    public int MintedTierLevel { get; set; }

    /// <summary>CA scope of the affected tier (null for system-scoped tiers).</summary>
    public Guid? MintedTierCaId { get; set; }

    /// <summary>Tenant scope of the affected tier (set for org- and CA-scoped tiers; null for system).</summary>
    public Guid? MintedTierTenantId { get; set; }
}

/// <summary>Summary returned by applying a controlled-user ceremony, for audit detail.</summary>
public record ControlledUserChangeResult(
    string ChangeType,
    Guid TargetUserId,
    string? Capability,
    Guid? TenantId,
    Guid? CertificateAuthorityId);
