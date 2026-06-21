namespace ModularCA.Shared.Models.Crl
{
    public class CrlConfigurationDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public bool Enabled { get; set; }
        public string UpdateInterval { get; set; } = string.Empty;
        public TimeSpan OverlapPeriod { get; set; }
        public bool IsDelta { get; set; }
        public string DeltaInterval { get; set; } = string.Empty;
        public DateTime LastGenerated { get; set; }
        public DateTime NextUpdateUtc { get; set; }
        public Guid CaCertificateId { get; set; }
        public string? CaName { get; set; }
    }

}
