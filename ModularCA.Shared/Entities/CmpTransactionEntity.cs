using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Persistent CMP transaction / nonce state.
/// <para>
/// Used to reject replayed ir/cr/kur messages (duplicate <c>(CaId, TransactionId)</c>),
/// to enforce <c>messageTime</c> freshness, and to correlate <c>certConf</c> messages
/// back to a previously-issued ip/cp. Rows are appended on every CMP request that
/// passes initial protection validation and swept after 1 hour by the scheduler.
/// </para>
/// </summary>
[Table("CmpTransactions")]
public class CmpTransactionEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The CA this transaction was bound to.</summary>
    public Guid? CaId { get; set; }

    /// <summary>
    /// The client-generated CMP transactionId — 128 bytes max per RFC 4210 §5.1.1 in practice.
    /// The DER-encoded OCTET STRING is stored hex-encoded so we can index it portably.
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string TransactionId { get; set; } = string.Empty;

    /// <summary>Sender nonce from the client, hex-encoded.</summary>
    [MaxLength(128)]
    public string? SenderNonce { get; set; }

    /// <summary>Response nonce we generated, hex-encoded — echoed back as recipNonce on next message.</summary>
    [MaxLength(128)]
    public string? ResponseNonce { get; set; }

    /// <summary>Client's <c>messageTime</c> field.</summary>
    public DateTime? MessageTime { get; set; }

    /// <summary>"Pending" | "Issued" | "Confirmed" | "Rejected".</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Pending";

    /// <summary>Reference value used if request was PBMAC-protected (hex of senderKID).</summary>
    [MaxLength(256)]
    public string? PbmReferenceValue { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
