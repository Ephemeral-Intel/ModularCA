using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("Crls")]
public class CrlEntity
{
    [Key]
    public Guid? Id { get; set; }
    public string IssuerName { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Monotonic per-issuer CRL
    /// number (RFC 5280 §5.2.3). Uniqueness of <c>(IssuerName, CrlNumber)</c> is enforced at the
    /// database level via a unique index.
    /// </summary>
    public long CrlNumber { get; set; }

    public bool IsDelta { get; set; }
    public string? PemData { get; set; } = string.Empty;
    public byte[] RawData { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// For delta CRLs this is the CRL
    /// number of the full base CRL the delta is relative to, stored as a decimal value. For
    /// full CRLs it is null. Dropping the ASN.1 <c>OctetString.ToString()</c> path also means
    /// downstream reports can join on this column.
    /// </summary>
    public long? BaseCrlNumber { get; set; }

    public Guid TaskId { get; set; }

    [ForeignKey(nameof(TaskId))]

    public CrlConfigurationEntity? Task { get; set; }

    public DateTime ThisUpdate { get; set; }
    public DateTime NextUpdate { get; set; }
}
