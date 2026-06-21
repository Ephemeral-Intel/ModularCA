using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// A named certificate template that bundles a Request Profile, Cert Profile, Signing Profile,
/// and CA together. Clients can request certificates by template name instead of profile IDs.
/// </summary>
[Table("CertificateTemplates")]
public class CertificateTemplateEntity
{
    /// <summary>
    /// Unique identifier for the certificate template.
    /// </summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Human-readable template name used by protocol clients to request certificates.
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Optional description explaining the purpose or usage of this template.
    /// </summary>
    [MaxLength(255)]
    public string? Description { get; set; }

    /// <summary>
    /// The Certificate Authority that will issue certificates using this template.
    /// </summary>
    [Required]
    public Guid CaId { get; set; }

    /// <summary>
    /// Navigation property to the associated Certificate Authority.
    /// </summary>
    [ForeignKey("CaId")]
    public virtual CertificateAuthorityEntity Ca { get; set; } = default!;

    /// <summary>
    /// Optional request profile that controls subject/SAN validation and approval behavior.
    /// </summary>
    public Guid? RequestProfileId { get; set; }

    /// <summary>
    /// Navigation property to the optional request profile.
    /// </summary>
    [ForeignKey("RequestProfileId")]
    public virtual RequestProfileEntity? RequestProfile { get; set; }

    /// <summary>
    /// The certificate profile defining key usage, extensions, and certificate content.
    /// </summary>
    [Required]
    public Guid CertProfileId { get; set; }

    /// <summary>
    /// Navigation property to the associated certificate profile.
    /// </summary>
    [ForeignKey("CertProfileId")]
    public virtual CertProfileEntity CertProfile { get; set; } = default!;

    /// <summary>
    /// The signing profile defining algorithm and validity period for issued certificates.
    /// </summary>
    [Required]
    public Guid SigningProfileId { get; set; }

    /// <summary>
    /// Navigation property to the associated signing profile.
    /// </summary>
    [ForeignKey("SigningProfileId")]
    public virtual SigningProfileEntity SigningProfile { get; set; } = default!;

    /// <summary>
    /// Whether this template is active and available for enrollment requests.
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Timestamp when this template was created.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
