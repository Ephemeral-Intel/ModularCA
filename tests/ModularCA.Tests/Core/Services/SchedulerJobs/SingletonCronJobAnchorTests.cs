using ModularCA.Core.Services.SchedulerJobs;
using NCrontab;
using Xunit;

namespace ModularCA.Tests.Core.Services.SchedulerJobs;

/// <summary>
/// Tests for <see cref="SingletonCronJob.ComputeAnchorForFirstRun"/>. The helper picks the
/// most-recent past cron occurrence relative to <c>now</c>, NOT <c>now</c> itself. Anchoring
/// to <c>now</c> on the first-ever run permanently drifts subsequent
/// <c>schedule.GetNextOccurrence(LastRunUtc)</c> off the cron grid — every following tick
/// fires "X-time-after-the-last-tick" instead of "at the next 5 AM UTC" or whatever the cron
/// actually says.
/// </summary>
public class SingletonCronJobAnchorTests
{
    [Fact]
    public void Daily_Cron_Anchors_To_Most_Recent_Past_Occurrence()
    {
        var schedule = CrontabSchedule.TryParse("0 5 * * *")!; // daily at 05:00 UTC
        // Now = 2026-04-26 07:00 UTC. The most recent past occurrence is 2026-04-26 05:00.
        var now = new DateTime(2026, 4, 26, 7, 0, 0, DateTimeKind.Utc);

        var anchor = SingletonCronJob.ComputeAnchorForFirstRun(schedule, now);

        Assert.Equal(new DateTime(2026, 4, 26, 5, 0, 0, DateTimeKind.Utc), anchor);
    }

    [Fact]
    public void When_Now_Is_Before_Today_Occurrence_Anchors_To_Yesterday()
    {
        var schedule = CrontabSchedule.TryParse("0 5 * * *")!; // daily at 05:00 UTC
        // Now = 2026-04-26 03:00. Today's 05:00 hasn't happened yet, so the most recent past
        // occurrence is 2026-04-25 05:00.
        var now = new DateTime(2026, 4, 26, 3, 0, 0, DateTimeKind.Utc);

        var anchor = SingletonCronJob.ComputeAnchorForFirstRun(schedule, now);

        Assert.Equal(new DateTime(2026, 4, 25, 5, 0, 0, DateTimeKind.Utc), anchor);
    }

    [Fact]
    public void Subsequent_GetNextOccurrence_From_Anchor_Stays_On_Cron_Grid()
    {
        // Property the anchor protects: scheduling Plus(LastRunUtc) lands on the cron grid,
        // not at "X-time-after-now". This is what prevents permanent drift.
        var schedule = CrontabSchedule.TryParse("0 5 * * *")!;
        var now = new DateTime(2026, 4, 26, 7, 30, 15, DateTimeKind.Utc);

        var anchor = SingletonCronJob.ComputeAnchorForFirstRun(schedule, now);
        var nextFromAnchor = schedule.GetNextOccurrence(anchor);

        // Next occurrence is always the next 05:00 UTC — exactly on the grid.
        Assert.Equal(new DateTime(2026, 4, 27, 5, 0, 0, DateTimeKind.Utc), nextFromAnchor);
    }
}
