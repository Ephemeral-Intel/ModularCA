using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Join table linking cert profiles to signing profiles (many-to-many).
/// Controls which cert profiles are authorized for use with which signing profiles.
/// </summary>
[Table("AllowedCertProfileSigningProfiles")]
public class AllowedCertProfileSigningProfileEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid CertProfileId { get; set; }

    [ForeignKey("CertProfileId")]
    public virtual CertProfileEntity CertProfile { get; set; } = default!;

    [Required]
    public Guid SigningProfileId { get; set; }

    [ForeignKey("SigningProfileId")]
    public virtual SigningProfileEntity SigningProfile { get; set; } = default!;
}
