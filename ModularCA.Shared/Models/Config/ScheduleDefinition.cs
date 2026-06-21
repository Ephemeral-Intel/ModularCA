using Microsoft.Extensions.Hosting;


namespace ModularCA.Shared.Models.Config
{
    /// <summary>
    /// Background worker service that runs a periodic loop until cancellation is requested.
    /// </summary>
    public class Worker : BackgroundService
    {
        /*
                private readonly ILogger<Worker> _logger;

                public Worker(ILogger<Worker> logger)
                {
                    _logger = logger;
                }
        */

        public Worker() { }
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                /*
                                if (_logger.IsEnabled(LogLevel.Information))
                                {
                                    _logger.LogInformation("Worker running at: {time}", DateTimeOffset.Now);
                                }
                */

                await Task.Delay(1000, stoppingToken);
            }
        }
    }
}
