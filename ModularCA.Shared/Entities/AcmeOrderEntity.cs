using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using ModularCA.Shared.Enums;

namespace ModularCA.Shared.Entities;

[Table("AcmeOrders")]
public class AcmeOrderEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid AccountId { get; set; }

    [ForeignKey(nameof(AccountId))]
    public AcmeAccountEntity? Account { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = nameof(AcmeOrderStatus.Pending);

    [Required]
    public string IdentifiersJson { get; set; } = "[]";

    public DateTime? NotBefore { get; set; }
    public DateTime? NotAfter { get; set; }

    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(24);

    public Guid? CertificateId { get; set; }

    [ForeignKey(nameof(CertificateId))]
    public CertificateEntity? Certificate { get; set; }

    public Guid? FinalizedCsrId { get; set; }

    [ForeignKey(nameof(FinalizedCsrId))]
    public CertRequestEntity? FinalizedCsr { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// CA label under which this order was created
    /// (e.g. <c>intermediate-b</c>). Plumbed from the ACME directory route
    /// <c>/acme/{caLabel}/new-order</c> and consumed by <c>FinalizeAsync</c>
    /// so <c>ICaResolverService</c> resolves the same CA context the client
    /// originally selected instead of the protocol default.
    /// </summary>
    [MaxLength(255)]
    public string? CaLabel { get; set; }
}
