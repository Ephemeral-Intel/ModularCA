using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ModularCA.Core.Services;
using ModularCA.Shared.Models.Config;
using Xunit;

namespace ModularCA.Tests.Core.Services;

/// <summary>
/// Tests for <see cref="SchedulerJobRunner.ResolveJobTimeout"/>. A regression that picks the
/// wrong timeout means jobs either hang past their cron (job-bigger-than-poll-interval bugs) or
/// get cancelled prematurely (truncated CRL writes, partial backups). The runner cancels a
/// job's body after this many seconds — getting the lookup right matters.
/// </summary>
public class SchedulerJobRunnerTimeoutTests
{
    private static SchedulerJobRunner MakeRunner(SystemConfig config)
    {
        // Empty service provider is fine — ResolveJobTimeout doesn't resolve anything from it.
        var sp = new ServiceCollection().BuildServiceProvider();
        return new SchedulerJobRunner(sp, NullLogger<SchedulerJobRunner>.Instance, config, "test-instance");
    }

    [Fact]
    public void Uses_Per_Job_Override_When_Present()
    {
        var config = new SystemConfig();
        config.Scheduler.JobTimeouts["BackupCreation"] = 600;
        config.Scheduler.DefaultJobTimeoutSeconds = 120;

        var runner = MakeRunner(config);

        Assert.Equal(TimeSpan.FromSeconds(600), runner.ResolveJobTimeout("BackupCreation"));
    }

    [Fact]
    public void Falls_Back_To_DefaultJobTimeoutSeconds_When_No_Override()
    {
        var config = new SystemConfig();
        config.Scheduler.DefaultJobTimeoutSeconds = 240;

        var runner = MakeRunner(config);

        Assert.Equal(TimeSpan.FromSeconds(240), runner.ResolveJobTimeout("UnconfiguredJob"));
    }

    [Fact]
    public void Falls_Back_To_120_Seconds_When_Default_Is_Zero_Or_Negative()
    {
        var config = new SystemConfig();
        config.Scheduler.DefaultJobTimeoutSeconds = 0;
        // No JobTimeouts entries either — caller hit the bottom of the fallback chain.

        var runner = MakeRunner(config);

        Assert.Equal(TimeSpan.FromSeconds(120), runner.ResolveJobTimeout("UnconfiguredJob"));
    }

    [Fact]
    public void Per_Row_JobName_With_Colon_Maps_To_Bare_Prefix_Timeout()
    {
        // Per-row jobs use names like "CrlExport:{guid}". The timeout config is keyed on the
        // bare prefix so all rows of a class share one timeout class, otherwise operators
        // would need to set 200 timeouts to cover 200 CAs.
        var config = new SystemConfig();
        config.Scheduler.JobTimeouts["CrlExport"] = 480;

        var runner = MakeRunner(config);

        Assert.Equal(TimeSpan.FromSeconds(480),
            runner.ResolveJobTimeout("CrlExport:11111111-2222-3333-4444-555555555555"));
    }
}
