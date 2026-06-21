using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Represents a key-value tag attached to a certificate for dependency tracking and service mapping.
/// Common tag keys include "service", "environment", "team", "owner", and "application".
/// </summary>
[Table("CertificateTags")]
public class CertificateTagEntity
{
    /// <summary>
    /// Unique identifier for the tag.
    /// </summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The certificate this tag is attached to.
    /// </summary>
    public Guid CertificateId { get; set; }

    /// <summary>
    /// Tag key describing the category (e.g., "service", "environment", "team").
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string Key { get; set; } = string.Empty;

    /// <summary>
    /// Tag value (e.g., "nginx", "production", "devops").
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string Value { get; set; } = string.Empty;

    /// <summary>
    /// Timestamp when the tag was created.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Navigation property to the parent certificate.
    /// </summary>
    [ForeignKey("CertificateId")]
    public virtual CertificateEntity? Certificate { get; set; }
}
