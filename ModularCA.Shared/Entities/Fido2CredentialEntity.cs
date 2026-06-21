using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Stores FIDO2/WebAuthn credentials for users who have enrolled security keys.
/// Used as a second authentication factor for admin login.
/// </summary>
[Table("Fido2Credentials")]
public class Fido2CredentialEntity
{
    /// <summary>Unique identifier for this credential record.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The user who owns this credential.</summary>
    [Required]
    public Guid UserId { get; set; }

    /// <summary>Navigation property to the owning user.</summary>
    [ForeignKey("UserId")]
    public virtual UserEntity User { get; set; } = default!;

    /// <summary>The credential ID returned by the authenticator during registration.</summary>
    [Required]
    public byte[] CredentialId { get; set; } = Array.Empty<byte>();

    /// <summary>The public key returned by the authenticator during registration.</summary>
    [Required]
    public byte[] PublicKey { get; set; } = Array.Empty<byte>();

    /// <summary>Signature counter used to detect cloned authenticators.</summary>
    public uint SignCount { get; set; }

    /// <summary>Optional friendly name for the security key (e.g. "YubiKey 5").</summary>
    [MaxLength(255)]
    public string? DeviceName { get; set; }

    /// <summary>Timestamp when this credential was registered.</summary>
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

    /// <summary>Timestamp of the last successful assertion using this credential.</summary>
    public DateTime? LastUsedAt { get; set; }
}
