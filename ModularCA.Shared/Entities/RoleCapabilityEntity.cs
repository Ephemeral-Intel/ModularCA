using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// One capability binding inside a role, optionally scoped to a specific resource
/// (e.g. profile.use on a particular SigningProfile).
/// </summary>
public class RoleCapabilityEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The role this capability belongs to.</summary>
    [Required]
    public Guid RoleId { get; set; }

    /// <summary>The capability string (e.g. "cert.request", "profile.manage").</summary>
    [Required]
    [MaxLength(100)]
    public string Capability { get; set; } = string.Empty;

    /// <summary>
    /// Optional resource type for resource-scoped capabilities
    /// (e.g. "CertProfile", "SigningProfile", "RequestProfile").
    /// Null means the capability applies to all resources in scope.
    /// </summary>
    [MaxLength(50)]
    public string? ResourceType { get; set; }

    /// <summary>
    /// Optional resource ID for resource-scoped capabilities.
    /// Null means all resources of ResourceType in scope.
    /// </summary>
    public Guid? ResourceId { get; set; }

    // Navigation

    [ForeignKey("RoleId")]
    public virtual RoleEntity Role { get; set; } = null!;
}
