namespace ModularCA.Shared.Models.Scheduler
{
    public class CrlExportScheduleOptions
    {

        public Guid TaskId { get; set; }
        public Guid CaCertificateId { get; set; }
        public Guid CrlId { get; set; } = Guid.Empty;

    }
}
