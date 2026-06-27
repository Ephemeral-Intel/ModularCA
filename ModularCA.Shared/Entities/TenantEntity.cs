using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Represents a logical tenant in the multi-tenancy model. Every CA and group must belong
/// to a tenant. The "System" tenant owns infrastructure CAs (system signing CA). Bootstrap
/// creates a second tenant from the config's Organization name for the root CA.
/// </summary>
public class TenantEntity
{
    /// <summary>Primary key.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Human-readable tenant name.</summary>
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    /// <summary>URL-safe identifier used in route segments and API filters.</summary>
    [MaxLength(255)]
    public string Slug { get; set; } = string.Empty;

    /// <summary>Optional description of the tenant's purpose or organization.</summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>Whether this tenant is active. Disabled tenants cannot issue certificates.</summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>Whether this is the internal system tenant. System tenants cannot be deleted or disabled.</summary>
    public bool IsSystemTenant { get; set; } = false;

    /// <summary>Whether this tenant can be deleted by administrators. Bootstrap tenants are protected.</summary>
    public bool CanBeDeleted { get; set; } = true;

    /// <summary>Timestamp when this tenant was created.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Maximum number of certificate authorities allowed for this tenant. 0 means unlimited.</summary>
    public int MaxCertificateAuthorities { get; set; } = 0;

    /// <summary>Maximum total certificates that can be issued across all CAs in this tenant. 0 means unlimited.</summary>
    public int MaxCertificatesTotal { get; set; } = 0;

    /// <summary>Maximum number of users that can be assigned to this tenant's groups. 0 means unlimited.</summary>
    public int MaxUsers { get; set; } = 0;

    /// <summary>
    /// When true, CA creation for this tenant requires a key ceremony approval workflow.
    /// Direct creation endpoints auto-create a ceremony instead of creating the CA immediately.
    /// </summary>
    public bool RequireKeyCeremony { get; set; } = true;

    /// <summary>
    /// Number of approvals required for CA creation ceremonies in this tenant. Used when the
    /// target CA doesn't exist yet (CreateRootCA, CreateIntermediateCA). For operations on
    /// existing CAs (RevokeCA), the CA's admin group RequiredQuorum is used instead.
    /// </summary>
    public int CeremonyRequiredApprovals { get; set; } = 2;

    /// <summary>
    /// Per-tenant "user quorum" override for controlled-user ceremonies (promote/demote/delete
    /// of an admin/operator/CA-admin) scoped to this tenant's CAs. Null = fall back to the
    /// system-level <see cref="SecurityPolicyEntity.UserQuorum"/>. Distinct from
    /// <see cref="CeremonyRequiredApprovals"/> (the CA/key quorum).
    /// </summary>
    public int? UserCeremonyRequiredApprovals { get; set; }

    /// <summary>
    /// Soft-delete flag. When true, the row is hidden from every
    /// application query via the EF global query filter in
    /// <see cref="ModularCA.Database.ModularCADbContext"/>. Call
    /// <c>IgnoreQueryFilters()</c> (with an explicit system-admin gate) to resurrect.
    /// </summary>
    public bool IsDeleted { get; set; } = false;

    /// <summary>Timestamp when <see cref="IsDeleted"/> was flipped to true. Null when active.</summary>
    public DateTime? DeletedAt { get; set; }
}
