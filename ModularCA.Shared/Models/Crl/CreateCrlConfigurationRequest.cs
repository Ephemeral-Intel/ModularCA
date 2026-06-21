using System.ComponentModel.DataAnnotations;

namespace ModularCA.Shared.Models.Crl
{
    /// <summary>
    /// Request body for creating a new CRL distribution configuration.
    /// </summary>
    public class CreateCrlConfigurationRequest
    {
        [Required, MaxLength(255)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string Description { get; set; } = string.Empty;

        [Required, MaxLength(50)]
        public string UpdateInterval { get; set; } = string.Empty;

        public TimeSpan OverlapPeriod { get; set; }
        public bool IsDelta { get; set; }

        [MaxLength(50)]
        public string DeltaInterval { get; set; } = string.Empty;

        public Guid CaCertificateId { get; set; }
    }
}
