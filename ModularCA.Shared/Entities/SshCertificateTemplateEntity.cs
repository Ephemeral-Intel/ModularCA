using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// A named SSH certificate template that bundles an SSH CA key, signing profile,
/// cert profile, and optional request profile into a reusable enrollment configuration.
/// </summary>
[Table("SshCertificateTemplates")]
public class SshCertificateTemplateEntity
{
    /// <summary>Unique identifier for this SSH certificate template.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Human-readable template name (must be unique).</summary>
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description explaining the purpose or usage of this template.</summary>
    [MaxLength(255)]
    public string? Description { get; set; }

    /// <summary>The SSH CA key this template uses for signing.</summary>
    public Guid SshCaKeyId { get; set; }

    /// <summary>Navigation property for the associated SSH CA key.</summary>
    [ForeignKey("SshCaKeyId")]
    public virtual SshCaKeyEntity SshCaKey { get; set; } = null!;

    /// <summary>The SSH signing profile to use.</summary>
    public Guid SshSigningProfileId { get; set; }

    /// <summary>Navigation property for the associated SSH signing profile.</summary>
    [ForeignKey("SshSigningProfileId")]
    public virtual SshSigningProfileEntity SshSigningProfile { get; set; } = null!;

    /// <summary>The SSH cert profile to use.</summary>
    public Guid SshCertProfileId { get; set; }

    /// <summary>Navigation property for the associated SSH cert profile.</summary>
    [ForeignKey("SshCertProfileId")]
    public virtual SshCertProfileEntity SshCertProfile { get; set; } = null!;

    /// <summary>Optional SSH request profile for user-facing enrollment.</summary>
    public Guid? SshRequestProfileId { get; set; }

    /// <summary>Navigation property for the optional SSH request profile.</summary>
    [ForeignKey("SshRequestProfileId")]
    public virtual SshRequestProfileEntity? SshRequestProfile { get; set; }

    /// <summary>Whether this template is active and available for enrollment requests.</summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>UTC timestamp when this template was created.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
