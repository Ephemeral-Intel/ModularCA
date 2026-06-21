using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ModularCA.Shared.Enums;

namespace ModularCA.Shared.Entities;

[Table("AcmeAuthorizations")]
public class AcmeAuthorizationEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid OrderId { get; set; }

    [ForeignKey(nameof(OrderId))]
    public AcmeOrderEntity? Order { get; set; }

    [Required]
    [MaxLength(10)]
    public string IdentifierType { get; set; } = "dns";

    [Required]
    [MaxLength(255)]
    public string IdentifierValue { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = nameof(AcmeAuthorizationStatus.Pending);

    public bool IsWildcard { get; set; }

    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(24);

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
