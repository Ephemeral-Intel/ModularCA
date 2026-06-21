using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Persisted record of a user's prior password
/// hashes so <see cref="Services.PasswordPolicyService"/> can reject reuse of the
/// most recent <c>HistoryCount</c> passwords on change. Rows are rotated
/// automatically — on every successful password change the oldest entries beyond
/// the configured <c>HistoryCount</c> are deleted, so the table never grows
/// unbounded. No soft-delete: these are purely rotating history rows.
/// </summary>
[Table("PasswordHistory")]
public class PasswordHistoryEntity
{
    /// <summary>Primary key.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// The user this history row belongs to. Cascade-deletes with the parent user so
    /// removing a user also clears their password history.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Navigation property back to the owning user.
    /// </summary>
    [ForeignKey(nameof(UserId))]
    public virtual UserEntity? User { get; set; }

    /// <summary>
    /// The hashed password using whatever algorithm <see cref="Auth.Utils.PasswordUtil.HashPassword"/>
    /// produced at the time of rotation. Verification uses <c>VerifyPassword</c> so
    /// legacy-prefixed hashes can still be matched against for reuse detection.
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>
    /// Timestamp (UTC) when the password was rotated INTO active use — i.e. the
    /// moment the user's <c>PasswordHash</c> column was set to this value. Ordering
    /// by this column DESC yields the most-recent-N history for reuse checks.
    /// </summary>
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}
