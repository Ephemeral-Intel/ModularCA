namespace ModularCA.Shared.Authorization;

/// <summary>
/// Privilege tiers that a <i>controlled user</i> can hold, ordered low → high. Used to gate
/// who may approve (or initiate) a controlled-user ceremony: an approver must <b>dominate</b>
/// the affected privilege's tier. System tiers have no CA scope; CA tiers are scoped to one CA.
/// </summary>
public enum ControlledTierLevel
{
    /// <summary>Operator-level authority (system- or CA-scoped).</summary>
    Operator = 1,

    /// <summary>Administrator of a specific CA.</summary>
    CaAdmin = 2,

    /// <summary>Global system administrator (holds <c>system.manage</c> via a system group).</summary>
    SystemAdmin = 3,

    /// <summary>System-super (the bootstrap super tier). Dominates everything; mints directly.</summary>
    SystemSuper = 4,
}

/// <summary>
/// A concrete privilege tier: a <see cref="ControlledTierLevel"/> plus, for CA-scoped tiers,
/// the CA it applies to (<c>null</c> for system-scoped tiers).
/// </summary>
public readonly record struct ControlledTier(ControlledTierLevel Level, Guid? CaId)
{
    /// <summary>
    /// Returns true when this tier dominates <paramref name="target"/> — i.e. a holder of this
    /// tier is permitted to approve/initiate a change affecting the target tier.
    /// <list type="bullet">
    /// <item>system-super dominates everything.</item>
    /// <item>system-admin dominates system-admin and all CA-scoped tiers.</item>
    /// <item>ca-admin(X) dominates ca-admin(X) and operator(X) — same CA only.</item>
    /// <item>operator(X) dominates only operator(X).</item>
    /// </list>
    /// </summary>
    public bool Dominates(ControlledTier target)
    {
        return Level switch
        {
            ControlledTierLevel.SystemSuper => true,
            ControlledTierLevel.SystemAdmin => target.Level <= ControlledTierLevel.SystemAdmin,
            ControlledTierLevel.CaAdmin => CaId != null && target.CaId == CaId && target.Level <= ControlledTierLevel.CaAdmin,
            ControlledTierLevel.Operator => CaId != null && target.CaId == CaId && target.Level <= ControlledTierLevel.Operator,
            _ => false,
        };
    }
}
