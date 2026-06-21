using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("AuditAcme")]
public class AuditAcmeEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(30)]
    public string Operation { get; set; } = string.Empty;

    public Guid? AccountId { get; set; }

    public Guid? OrderId { get; set; }

    [MaxLength(255)]
    public string? SubjectDN { get; set; }

    [MaxLength(64)]
    public string? CertificateSerial { get; set; }

    public string? Identifiers { get; set; }

    [MaxLength(50)]
    public string? RevocationReason { get; set; }

    /// <summary>CA label this ACME event relates to, or null for system-wide events.</summary>
    [MaxLength(255)]
    public string? CaLabel { get; set; }

    [MaxLength(45)]
    public string? SourceIp { get; set; }

    public bool Success { get; set; } = true;

    [MaxLength(500)]
    public string? ErrorMessage { get; set; }

    /// <summary>Certificate Authority ID for CA-scoped audit filtering.</summary>
    public Guid? CertificateAuthorityId { get; set; }

    /// <summary>Tenant ID for tenant-scoped audit filtering.</summary>
    public Guid? TenantId { get; set; }

    /// <summary>
    /// Signing profile id used to sign the issued certificate.
    /// Populated at order finalization and order creation so post-incident
    /// forensics can trace a revoked cert back to the profile that issued it.
    /// </summary>
    public Guid? SigningProfileId { get; set; }

    /// <summary>
    /// Certificate profile id applied to the issued certificate.
    /// </summary>
    public Guid? CertProfileId { get; set; }
}
