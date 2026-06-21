using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("SshCertificates")]
public class SshCertificateEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid SshCaKeyId { get; set; }

    [ForeignKey("SshCaKeyId")]
    public virtual SshCaKeyEntity SshCaKey { get; set; } = default!;

    [Required]
    [MaxLength(10)]
    public string CertificateType { get; set; } = "user";

    [MaxLength(255)]
    public string KeyId { get; set; } = string.Empty;

    public long SerialNumber { get; set; }

    public string Principals { get; set; } = "[]";

    public DateTime ValidAfter { get; set; }
    public DateTime ValidBefore { get; set; }

    public string PublicKey { get; set; } = string.Empty;
    public string SignedCertificate { get; set; } = string.Empty;

    public string? Extensions { get; set; }

    public bool IsRevoked { get; set; } = false;

    public Guid? IssuedByUserId { get; set; }

    [MaxLength(45)]
    public string? SourceIp { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
