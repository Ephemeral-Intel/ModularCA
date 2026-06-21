using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Persistent per-request SCEP transaction state.
/// <para>
/// Without this table <c>HandleGetCertInitialAsync</c> had to pick "the most recent
/// non-CA cert" for the signing profile, which leaked other enrollees' certs across
/// subjects and profiles (RFC 8894 §4.5 calls this out explicitly as information
/// disclosure). The row is inserted during PKCSReq processing with a hash of the
/// requester's public key, and GetCertInitial / transaction replay protection
/// both key off the unique <c>(CaId, TransactionId)</c> composite.
/// </para>
/// </summary>
[Table("ScepTransactions")]
public class ScepTransactionEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The CA this transaction was bound to at PKCSReq time.</summary>
    public Guid? CaId { get; set; }

    /// <summary>Raw SCEP transactionId string from the client's signed attributes.</summary>
    [Required]
    [MaxLength(255)]
    public string TransactionId { get; set; } = string.Empty;

    /// <summary>Subject DN from the CSR at enrollment time.</summary>
    [MaxLength(512)]
    public string? Subject { get; set; }

    /// <summary>
    /// SHA-256 of the requester's SubjectPublicKeyInfo DER — used by GetCertInitial
    /// to verify the polling client proved possession of the same private key that
    /// signed the original PKCSReq.
    /// </summary>
    [Required]
    [MaxLength(64)]
    public string RequesterPublicKeyHash { get; set; } = string.Empty;

    /// <summary>Certificate issued in response to this transaction, when the enrollment succeeded.</summary>
    public Guid? IssuedCertificateId { get; set; }

    /// <summary>Status — "Pending", "Issued", "Failed".</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Pending";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Row TTL — older than this is swept by the scheduler.</summary>
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddMinutes(10);
}
