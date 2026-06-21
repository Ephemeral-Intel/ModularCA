using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("CrlConfigurations")]
public class CrlConfigurationEntity
{
    [Key]
    public Guid TaskId { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = "default";

    public bool Enabled { get; set; } = true;

    public string? IssuerDN { get; set; } = string.Empty;

    public Guid CaCertificateId { get; set; }
    [ForeignKey("CaCertificateId")]

    public CertificateEntity? CaCertificate { get; set; }

    public bool IsDelta { get; set; } = false;

    [MaxLength(255)]
    public string Description { get; set; } = string.Empty;

    [Required]
    public string UpdateInterval { get; set; } = string.Empty;

    public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Default of <see cref="DateTime.MinValue"/> means a freshly-created CRL configuration is
    /// already past-due and will be picked up by the scheduler on its next poll (within 30s).
    /// Otherwise the bootstrap-issued CA's CRL would not generate for an hour after first start,
    /// leaving CDP consumers with no CRL to fetch — RFC 5280 §3.3 expects one to be available
    /// immediately. After the first run, <see cref="ExecuteCrlPassAsync"/> advances this to the
    /// next cron occurrence.
    /// </summary>
    public DateTime NextUpdateUtc { get; set; } = DateTime.MinValue;

    [Required]
    public TimeSpan OverlapPeriod { get; set; } // e.g. 1 hour of validity overlap

    public string DeltaInterval { get; set; } = string.Empty;

    public DateTime LastGenerated { get; set; }

    /// <summary>
    /// Per-CA monotonic CRL number counter. Every CRL generation atomically
    /// increments this under a <c>SELECT ... FOR UPDATE</c> lock so concurrent generators can't
    /// assign the same number twice, and admin deletes of old CRL rows don't reset the sequence.
    /// </summary>
    public long LastCrlNumber { get; set; } = 0;

    /// <summary>
    /// When true the generated CRL sets <c>onlyContainsUserCerts=true</c> on
    /// its <c>IssuingDistributionPoint</c> extension. Mutually exclusive with
    /// <see cref="OnlyContainsCACerts"/>.
    /// </summary>
    public bool OnlyContainsUserCerts { get; set; } = false;

    /// <summary>
    /// When true the generated CRL sets <c>onlyContainsCACerts=true</c> on
    /// its <c>IssuingDistributionPoint</c> extension. Mutually exclusive with
    /// <see cref="OnlyContainsUserCerts"/>.
    /// </summary>
    public bool OnlyContainsCACerts { get; set; } = false;
}
