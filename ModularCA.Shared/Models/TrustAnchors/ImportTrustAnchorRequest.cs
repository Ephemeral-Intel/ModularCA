using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Models.TrustAnchors;

/// <summary>
/// Request body for importing an external CA certificate as a trust anchor.
/// </summary>
public class ImportTrustAnchorRequest
{
    /// <summary>
    /// The certificate to import, either PEM-encoded or base64-encoded DER.
    /// </summary>
    [Required, MaxLength(65536)]
    public string Certificate { get; set; } = string.Empty;

    /// <summary>
    /// Optional human-readable label for the trust anchor.
    /// </summary>
    [MaxLength(255)]
    public string? Label { get; set; }

    /// <summary>
    /// Optional description of the trust anchor's purpose or origin.
    /// </summary>
    [MaxLength(1000)]
    public string? Description { get; set; }
}
