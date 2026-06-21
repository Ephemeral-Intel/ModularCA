using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// A single capability grant for a group, optionally scoped to a specific resource.
/// Rows with null ResourceType/ResourceId grant the capability across the group's scope.
/// Rows with non-null ResourceType/ResourceId grant the capability on a specific profile or resource.
/// </summary>
public class CapabilityGrantEntity
{
    /// <summary>Primary key.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The group this grant belongs to.</summary>
    [Required]
    public Guid GroupId { get; set; }

    /// <summary>
    /// The capability being granted (e.g. "cert.request", "cert.revoke", "profile.use").
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string Capability { get; set; } = string.Empty;

    /// <summary>
    /// Optional resource type for resource-scoped grants (e.g. "CertProfile", "SigningProfile", "RequestProfile").
    /// Null for scope-wide capability grants.
    /// </summary>
    [MaxLength(50)]
    public string? ResourceType { get; set; }

    /// <summary>
    /// Optional resource ID for resource-scoped grants (FK to the specific profile entity).
    /// Null for scope-wide capability grants.
    /// </summary>
    public Guid? ResourceId { get; set; }

    /// <summary>When this grant was created.</summary>
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;

    /// <summary>The user who created this grant, for audit trail.</summary>
    public Guid? GrantedByUserId { get; set; }

    // Navigation

    /// <summary>The group this grant belongs to.</summary>
    [ForeignKey("GroupId")]
    public virtual CaGroupEntity Group { get; set; } = null!;

    /// <summary>The user who created this grant, if tracked.</summary>
    [ForeignKey("GrantedByUserId")]
    public virtual UserEntity? GrantedByUser { get; set; }
}
