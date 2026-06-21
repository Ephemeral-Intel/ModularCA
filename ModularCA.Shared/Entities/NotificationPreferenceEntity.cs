using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("NotificationPreferences")]
public class NotificationPreferenceEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string EventType { get; set; } = string.Empty;

    public bool Enabled { get; set; } = true;

    [MaxLength(500)]
    public string? Recipients { get; set; }

    public int? DaysBeforeExpiry { get; set; }

    [MaxLength(255)]
    public string? Description { get; set; }
}
