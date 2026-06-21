using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Represents a user's membership in a CA authorization group.
/// </summary>
public class CaGroupMemberEntity
{
    /// <summary>Primary key.</summary>
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The group this membership belongs to.</summary>
    public Guid GroupId { get; set; }

    /// <summary>The user who is a member of the group.</summary>
    public Guid UserId { get; set; }

    /// <summary>Timestamp when the user was added to the group.</summary>
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    /// <summary>The user who added this member, if known.</summary>
    public Guid? AddedByUserId { get; set; }

    // Navigation

    /// <summary>The group this membership belongs to.</summary>
    public virtual CaGroupEntity Group { get; set; } = null!;

    /// <summary>The user who is a member.</summary>
    public virtual UserEntity User { get; set; } = null!;
}
