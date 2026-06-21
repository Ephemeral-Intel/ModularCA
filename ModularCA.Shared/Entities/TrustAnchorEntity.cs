using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// An imported external CA certificate used as a trust anchor for cross-certification.
/// Trust anchors don't have private keys — they're public certificates from external CAs
/// that this ModularCA instance trusts for chain validation.
/// </summary>
[Table("TrustAnchors")]
public class TrustAnchorEntity
{
    /// <summary>
    /// Unique identifier for this trust anchor.
    /// </summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The subject distinguished name of the imported certificate.
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string SubjectDN { get; set; } = string.Empty;

    /// <summary>
    /// The issuer distinguished name of the imported certificate.
    /// </summary>
    [MaxLength(255)]
    public string? Issuer { get; set; }

    /// <summary>
    /// The certificate serial number in uppercase hex format.
    /// </summary>
    [MaxLength(64)]
    public string? SerialNumber { get; set; }

    /// <summary>
    /// PEM-encoded representation of the certificate.
    /// </summary>
    [Required]
    public string Pem { get; set; } = string.Empty;

    /// <summary>
    /// DER-encoded raw certificate bytes.
    /// </summary>
    public byte[] RawCertificate { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// Certificate validity start date.
    /// </summary>
    public DateTime NotBefore { get; set; }

    /// <summary>
    /// Certificate validity end date.
    /// </summary>
    public DateTime NotAfter { get; set; }

    /// <summary>
    /// Optional human-readable label for this trust anchor.
    /// </summary>
    [MaxLength(255)]
    public string? Label { get; set; }

    /// <summary>
    /// Optional description of the trust anchor's purpose or origin.
    /// </summary>
    [MaxLength(255)]
    public string? Description { get; set; }

    /// <summary>
    /// Whether this trust anchor is currently active for chain validation.
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// The user ID of the administrator who imported this trust anchor.
    /// </summary>
    public Guid? ImportedByUserId { get; set; }

    /// <summary>
    /// The username of the administrator who imported this trust anchor.
    /// </summary>
    [MaxLength(255)]
    public string? ImportedByUsername { get; set; }

    /// <summary>
    /// Timestamp when this trust anchor was imported.
    /// </summary>
    public DateTime ImportedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// JSON-serialized dictionary of certificate thumbprints (SHA-1, SHA-256).
    /// </summary>
    public string? Thumbprints { get; set; }
}
