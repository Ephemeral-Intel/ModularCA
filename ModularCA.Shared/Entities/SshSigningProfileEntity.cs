using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Defines an SSH signing profile that controls how an SSH CA key signs certificates,
/// including validity limits, allowed certificate types, forced commands, and extension defaults.
/// </summary>
[Table("SshSigningProfiles")]
public class SshSigningProfileEntity
{
    /// <summary>Unique identifier for this signing profile.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Human-readable name (must be unique).</summary>
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description of the profile's purpose.</summary>
    [MaxLength(255)]
    public string? Description { get; set; }

    /// <summary>The SSH CA key this profile is bound to. Null until an SSH CA key is generated and assigned.</summary>
    public Guid? SshCaKeyId { get; set; }

    /// <summary>Navigation property for the associated SSH CA key.</summary>
    [ForeignKey("SshCaKeyId")]
    public virtual SshCaKeyEntity? SshCaKey { get; set; }

    /// <summary>Maximum validity duration in hours that this profile allows.</summary>
    public int MaxValidityHours { get; set; } = 720;

    /// <summary>Whether this profile permits issuing user certificates.</summary>
    public bool AllowUserCerts { get; set; } = true;

    /// <summary>Whether this profile permits issuing host certificates.</summary>
    public bool AllowHostCerts { get; set; } = false;

    /// <summary>Optional forced command applied to all certificates issued under this profile.</summary>
    [MaxLength(500)]
    public string? ForceCommand { get; set; }

    /// <summary>JSON array of source-address CIDR restrictions applied to issued certificates.</summary>
    public string SourceAddressRestrictions { get; set; } = "[]";

    /// <summary>JSON array of default SSH extensions applied when none are specified.</summary>
    public string DefaultExtensions { get; set; } = "[\"permit-pty\"]";

    /// <summary>UTC timestamp when this profile was created.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
