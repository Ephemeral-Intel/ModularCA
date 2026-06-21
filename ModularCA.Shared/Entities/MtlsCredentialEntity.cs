using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Tracks an mTLS client certificate issued to a user for MFA authentication.
/// The certificate is signed by the CA designated in the user's group configuration.
/// </summary>
public class MtlsCredentialEntity
{
    /// <summary>Unique identifier for this mTLS credential record.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The user who owns this mTLS credential.</summary>
    public Guid UserId { get; set; }

    /// <summary>Reference to the issued client certificate in the Certificates table.</summary>
    public Guid? CertificateId { get; set; }

    /// <summary>The CA that signed this mTLS certificate.</summary>
    public Guid SigningCaId { get; set; }

    /// <summary>SHA-256 thumbprint of the client certificate for fast lookup.</summary>
    [Required]
    [MaxLength(128)]
    public string Thumbprint { get; set; } = string.Empty;

    /// <summary>Certificate serial number.</summary>
    [Required]
    [MaxLength(255)]
    public string SerialNumber { get; set; } = string.Empty;

    /// <summary>Optional friendly name for the credential.</summary>
    [MaxLength(200)]
    public string? DeviceName { get; set; }

    /// <summary>Timestamp when the credential was issued.</summary>
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Expiration date of the client certificate.</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>Whether this credential has been revoked.</summary>
    public bool IsRevoked { get; set; } = false;

    /// <summary>Timestamp when the credential was revoked, if applicable.</summary>
    public DateTime? RevokedAt { get; set; }

    // Navigation

    /// <summary>Navigation property to the owning user.</summary>
    [ForeignKey("UserId")]
    public virtual UserEntity User { get; set; } = null!;

    /// <summary>Navigation property to the issued certificate record.</summary>
    [ForeignKey("CertificateId")]
    public virtual CertificateEntity? Certificate { get; set; }

    /// <summary>Navigation property to the signing CA.</summary>
    [ForeignKey("SigningCaId")]
    public virtual CertificateAuthorityEntity SigningCa { get; set; } = null!;
}
