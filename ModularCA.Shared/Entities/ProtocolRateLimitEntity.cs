using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Per-protocol rate-limit policy, applied per-IP by <c>ProtocolRateLimitMiddleware</c>.
/// One row per protocol name (EST, SCEP, CMP, ACME, OCSP, TSA, CRL, CA, Integration,
/// HEALTH, etc.). When no row exists for a protocol the middleware falls back to
/// its built-in defaults. Admin-managed via <c>/api/v1/admin/rate-limit-policy</c>.
/// </summary>
[Table("ProtocolRateLimits")]
public class ProtocolRateLimitEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Protocol name — must match one of the keys in
    /// <c>ProtocolRateLimitMiddleware.ProtocolPrefixes</c> (case-insensitive).
    /// Unique across the table.
    /// </summary>
    [Required, MaxLength(32)]
    public string Protocol { get; set; } = string.Empty;

    /// <summary>Maximum number of requests allowed per <see cref="WindowMinutes"/> window, per source IP.</summary>
    public int MaxRequests { get; set; } = 100;

    /// <summary>Sliding window length in minutes for <see cref="MaxRequests"/>.</summary>
    public int WindowMinutes { get; set; } = 1;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
