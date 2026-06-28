using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// A single per-user UI preference, stored as a namespaced key plus an opaque JSON value owned by
/// the client feature that wrote it. Primary use is table column layouts (widths, hidden columns)
/// that should follow the user across browsers; the localStorage copy is the fast path and this is
/// the cross-device source of truth. Keys are app-defined, e.g. <c>table:certificates</c>.
/// </summary>
[Table("UserPreferences")]
public class UserPreferenceEntity
{
    /// <summary>Surrogate primary key.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The user this preference belongs to. Unique together with <see cref="Key"/>.</summary>
    [Required]
    public Guid UserId { get; set; }

    /// <summary>App-defined preference key, e.g. <c>table:certificates</c>.</summary>
    [Required]
    [MaxLength(200)]
    public string Key { get; set; } = string.Empty;

    /// <summary>Opaque JSON value owned by the client feature that wrote it.</summary>
    [Required]
    public string ValueJson { get; set; } = "{}";

    /// <summary>Last write timestamp (UTC).</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
