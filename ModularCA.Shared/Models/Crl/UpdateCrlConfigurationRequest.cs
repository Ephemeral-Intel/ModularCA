namespace ModularCA.Shared.Models.Crl
{
    public class UpdateCrlConfigurationRequest
    {
        public Guid TaskId { get; set; }
        public string Description { get; set; } = string.Empty;
        public string UpdateInterval { get; set; } = string.Empty;
        public TimeSpan OverlapPeriod { get; set; }
        public bool IsDelta { get; set; }
        public string DeltaInterval { get; set; } = string.Empty;
    }

}
