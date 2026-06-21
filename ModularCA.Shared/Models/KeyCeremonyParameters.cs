using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Models;

/// <summary>
/// Structured parameters for a key ceremony operation. Serialized into
/// <see cref="Entities.KeyCeremonyEntity.ParametersJson"/> at initiation time
/// and locked — approvers review exactly what will be created/executed.
/// </summary>
public class KeyCeremonyParameters
{
    // Subject DN components
    [Required, MaxLength(256)]
    public string SubjectCN { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? SubjectO { get; set; }

    [MaxLength(256)]
    public string? SubjectOU { get; set; }

    [MaxLength(256)]
    public string? SubjectL { get; set; }

    [MaxLength(256)]
    public string? SubjectST { get; set; }

    [MaxLength(256)]
    public string? SubjectC { get; set; }

    // Key algorithm & size
    [Required, MaxLength(50)]
    public string KeyAlgorithm { get; set; } = "ECDSA";

    public int KeySize { get; set; } = 384;

    // Validity & scope
    public int ValidityYears { get; set; } = 10;
    public Guid TenantId { get; set; }
    public Guid? ParentCaId { get; set; }

    [MaxLength(255)]
    public string? Label { get; set; }

    [MaxLength(2048)]
    public string? PublicBaseUrl { get; set; }

    // Certificate profile (IsCaProfile=true)
    public Guid? CertProfileId { get; set; }

    // Name constraints (RFC 5280 §4.2.1.10 subtrees)
    public List<string>? NameConstraintsPermitted { get; set; }
    public List<string>? NameConstraintsExcluded { get; set; }
}
