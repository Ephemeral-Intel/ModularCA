using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Stores TOTP (RFC 6238) shared secrets for users who have enrolled authenticator apps.
/// </summary>
[Table("TotpSecrets")]
public class TotpSecretEntity
{
    /// <summary>Unique identifier for this TOTP secret record.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The user who owns this TOTP secret.</summary>
    [Required]
    public Guid UserId { get; set; }

    /// <summary>Navigation property to the owning user.</summary>
    [ForeignKey("UserId")]
    public virtual UserEntity User { get; set; } = default!;

    /// <summary>Data Protection encrypted TOTP secret.</summary>
    public string EncryptedSecretKey { get; set; } = string.Empty;

    /// <summary>Optional friendly name for the authenticator device (e.g. "Google Authenticator").</summary>
    [MaxLength(255)]
    public string? DeviceName { get; set; }

    /// <summary>Whether the secret has been verified with a successful TOTP code after enrollment.</summary>
    public bool IsVerified { get; set; } = false;

    /// <summary>Timestamp when this TOTP secret was registered.</summary>
    public DateTime RegisteredAt { get; set; } = DateTime.UtcNow;

    /// <summary>Timestamp of the last successful TOTP verification using this secret.</summary>
    public DateTime? LastUsedAt { get; set; }

    /// <summary>Last TOTP time step that was successfully verified. Used to prevent replay attacks.</summary>
    public long LastUsedTimeStep { get; set; } = 0;
}
