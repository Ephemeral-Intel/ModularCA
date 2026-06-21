using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("AuditScep")]
public class AuditScepEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(20)]
    public string Operation { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? SubjectDN { get; set; }

    [MaxLength(64)]
    public string? CertificateSerial { get; set; }

    [MaxLength(20)]
    public string? KeyAlgorithm { get; set; }

    [MaxLength(20)]
    public string? KeySize { get; set; }

    [MaxLength(50)]
    public string? CaLabel { get; set; }

    [MaxLength(255)]
    public string? TransactionId { get; set; }

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
    /// Authenticated principal — SCEP challenge-password token id
    /// or CMS signer cert serial, whichever the request carried.
    /// </summary>
    [MaxLength(255)]
    public string? CallerPrincipal { get; set; }
}
