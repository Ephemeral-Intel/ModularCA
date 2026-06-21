namespace ModularCA.Shared.Models.TrustAnchors;

/// <summary>
/// Data transfer object representing an imported trust anchor certificate.
/// </summary>
public class TrustAnchorDto
{
    /// <summary>
    /// Unique identifier for this trust anchor.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// The subject distinguished name of the imported certificate.
    /// </summary>
    public string SubjectDN { get; set; } = string.Empty;

    /// <summary>
    /// The issuer distinguished name of the imported certificate.
    /// </summary>
    public string? Issuer { get; set; }

    /// <summary>
    /// The certificate serial number in uppercase hex format.
    /// </summary>
    public string? SerialNumber { get; set; }

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
    public string? Label { get; set; }

    /// <summary>
    /// Optional description of the trust anchor's purpose or origin.
    /// </summary>
    public string? Description { get; set; }

    /// <summary>
    /// Whether this trust anchor is currently active for chain validation.
    /// </summary>
    public bool IsEnabled { get; set; }

    /// <summary>
    /// The username of the administrator who imported this trust anchor.
    /// </summary>
    public string? ImportedByUsername { get; set; }

    /// <summary>
    /// Timestamp when this trust anchor was imported.
    /// </summary>
    public DateTime ImportedAt { get; set; }

    /// <summary>
    /// JSON-serialized dictionary of certificate thumbprints (SHA-1, SHA-256).
    /// </summary>
    public string? Thumbprints { get; set; }
}
