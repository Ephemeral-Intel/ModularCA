using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Pre-shared HMAC key for ACME External Account Binding (RFC 8555 section 7.3.4).
/// Admins create these keys and distribute them to clients who must
/// include the EAB MAC in their newAccount request.
/// </summary>
[Table("AcmeEabKeys")]
public class AcmeEabKeyEntity
{
    /// <summary>
    /// Unique identifier for this EAB key record.
    /// </summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The key identifier distributed to ACME clients for use in the EAB binding.
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string KeyId { get; set; } = string.Empty;

    /// <summary>
    /// Base64url-encoded HMAC key used to sign the external account binding JWS.
    /// </summary>
    [Required]
    public string HmacKey { get; set; } = string.Empty;

    /// <summary>
    /// Optional human-readable description for administrative identification.
    /// </summary>
    [MaxLength(255)]
    public string? Description { get; set; }

    /// <summary>
    /// Whether this EAB key has already been consumed by an account registration.
    /// </summary>
    public bool IsUsed { get; set; } = false;

    /// <summary>
    /// Timestamp when the key was consumed during account creation.
    /// </summary>
    public DateTime? UsedAt { get; set; }

    /// <summary>
    /// The ACME account that consumed this EAB key.
    /// </summary>
    public Guid? UsedByAccountId { get; set; }

    /// <summary>
    /// Timestamp when the EAB key was created.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Optional expiration date after which the key can no longer be used.
    /// </summary>
    public DateTime? ExpiresAt { get; set; }
}
