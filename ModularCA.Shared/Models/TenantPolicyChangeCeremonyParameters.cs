namespace ModularCA.Shared.Models;

/// <summary>
/// Parameters for a <see cref="Enums.CeremonyType.TenantPolicyChange"/> ceremony.
/// Serialized into <see cref="Entities.KeyCeremonyEntity.ParametersJson"/> at initiation
/// and locked — approvers see exactly which fields will change and from what to what.
/// </summary>
/// <remarks>
/// Only downgrades of <see cref="Entities.TenantEntity.RequireKeyCeremony"/> (true→false) and
/// decreases of <see cref="Entities.TenantEntity.CeremonyRequiredApprovals"/> travel through
/// this ceremony. Upgrades and unrelated tenant field edits apply immediately in the
/// admin controller and never create a ceremony. The <c>Current*</c> snapshot is persisted
/// so the approve/execute path can detect a state change between initiate and execute —
/// if the tenant has already moved on, we abort and the ceremony expires without mutation.
/// </remarks>
public class TenantPolicyChangeCeremonyParameters
{
    /// <summary>The tenant whose policy fields this ceremony will update.</summary>
    public Guid TenantId { get; set; }

    /// <summary>Value of <c>RequireKeyCeremony</c> read from the tenant at initiation time.</summary>
    public bool CurrentRequireKeyCeremony { get; set; }

    /// <summary>Value of <c>CeremonyRequiredApprovals</c> read from the tenant at initiation time.</summary>
    public int CurrentCeremonyRequiredApprovals { get; set; }

    /// <summary>Proposed value for <c>RequireKeyCeremony</c>, or <c>null</c> if this ceremony doesn't touch that field.</summary>
    public bool? ProposedRequireKeyCeremony { get; set; }

    /// <summary>Proposed value for <c>CeremonyRequiredApprovals</c>, or <c>null</c> if this ceremony doesn't touch that field.</summary>
    public int? ProposedCeremonyRequiredApprovals { get; set; }
}
