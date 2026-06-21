using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("SshCaKeys")]
public class SshCaKeyEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string KeyType { get; set; } = "ed25519";

    /// <summary>
    /// Key size in bits. For RSA: 2048/3072/4096. For ECDSA: 256/384/521 (NIST curve size).
    /// Null for fixed-size algorithms like ed25519.
    /// </summary>
    public int? KeySize { get; set; }

    public string PublicKey { get; set; } = string.Empty;

    [MaxLength(500)]
    public string PrivateKeyPath { get; set; } = string.Empty;

    /// <summary>
    /// The CA entity this SSH CA key is linked to. Used for group-role authorization.
    /// The CA entity is auto-created during SSH key generation.
    /// </summary>
    [Required]
    public Guid CertificateAuthorityId { get; set; }

    [ForeignKey("CertificateAuthorityId")]
    public virtual CertificateAuthorityEntity CertificateAuthority { get; set; } = default!;

    public bool IsUserCa { get; set; } = true;
    public bool IsHostCa { get; set; } = false;
    public int MaxValidityHours { get; set; } = 24;
    public bool IsEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
