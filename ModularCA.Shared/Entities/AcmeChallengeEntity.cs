using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ModularCA.Shared.Enums;

namespace ModularCA.Shared.Entities;

[Table("AcmeChallenges")]
public class AcmeChallengeEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid AuthorizationId { get; set; }

    [ForeignKey(nameof(AuthorizationId))]
    public AcmeAuthorizationEntity? Authorization { get; set; }

    [Required]
    [MaxLength(20)]
    public string Type { get; set; } = string.Empty;

    [Required]
    [MaxLength(255)]
    public string Token { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = nameof(AcmeChallengeStatus.Pending);

    public DateTime? ValidatedAt { get; set; }

    public string? ErrorJson { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Number of validation attempts made so far for this
    /// challenge. Bounded by <c>Acme.ChallengeMaxAttempts</c>; once exhausted,
    /// the cleanup reconciler transitions the challenge to <c>Invalid</c>.
    /// </summary>
    public int AttemptCount { get; set; }

    /// <summary>
    /// Earliest time the reconciler in <c>AcmeCleanupJob</c>
    /// should retry this challenge after it has been marked <c>Processing</c>.
    /// Used to implement bounded exponential backoff without a separate outbox
    /// table.
    /// </summary>
    public DateTime? NextAttemptAt { get; set; }
}
