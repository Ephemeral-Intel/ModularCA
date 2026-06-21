using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ModularCA.Core.Services;
using ModularCA.Core.Services.SchedulerJobs;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Models.Config;
using ModularCA.Tests.TestUtils;
using Xunit;

namespace ModularCA.Tests.Core.Services.SchedulerJobs;

/// <summary>
/// Verifies that <see cref="CertExpiryNotificationJob.ProcessThresholdAsync"/> recomputes its
/// per-cert <c>now</c> / <c>today</c> on every iteration. The fix we landed in a prior round
/// moved this calculation INSIDE the foreach so a long scan that crosses midnight UTC writes
/// the correct calendar key into <c>NotificationLog.NotificationDate</c> for each cert. Without
/// the per-cert recompute, certs processed after midnight would dedup against yesterday's date
/// and silently skip sending today's notification (or vice versa).
/// </summary>
public class CertExpiryNotificationMidnightTests
{
    private static (CertExpiryNotificationJob Job, IServiceProvider Sp) Build(QueueTimeProvider time)
    {
        var dbName = $"test-{Guid.NewGuid():N}";
        var services = new ServiceCollection();
        services.AddDbContext<ModularCADbContext>(opts => opts
            .UseInMemoryDatabase(dbName)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        var sp = services.BuildServiceProvider();

        var config = new SystemConfig();
        config.CertExpiryNotification.Enabled = true;
        config.Email.Enabled = true;
        config.CertExpiryNotification.WarningDaysBeforeExpiry = new List<int> { 30 };

        var runner = new SchedulerJobRunner(sp, NullLogger<SchedulerJobRunner>.Instance, config, "test", time);

        // Use a dedicated scope's DbContext for the job so it persists into the same in-memory
        // store as the verification scope reads from later.
        var jobScope = sp.CreateScope();
        var jobDb = jobScope.ServiceProvider.GetRequiredService<ModularCADbContext>();

        var job = new CertExpiryNotificationJob(
            sp, jobDb,
            new NoopNotificationService(),
            new RecordingAlertService(),
            config,
            NullLogger<CertExpiryNotificationJob>.Instance,
            runner,
            timeProvider: time);
        return (job, sp);
    }

    private static CertificateEntity Cert(string serial, DateTime notAfter, string issuerDn = "CN=Test CA") =>
        new()
        {
            CertificateId = Guid.NewGuid(),
            SerialNumber = serial,
            SubjectDN = $"CN={serial}.example.com",
            Issuer = issuerDn,
            NotAfter = notAfter,
            NotBefore = notAfter.AddYears(-1),
        };

    [Fact]
    public async Task NotificationDate_Reflects_Per_Cert_Now_Across_Midnight()
    {
        // queryNow at 23:55, cert A processed at 23:58 (today), cert B processed at 00:01
        // (next day). NotificationLog rows must capture the calendar dates each cert
        // actually saw, NOT a single "today" pre-loop value.
        var queryNow = new DateTimeOffset(2026, 4, 26, 23, 55, 0, TimeSpan.Zero);
        var certATime = new DateTimeOffset(2026, 4, 26, 23, 58, 0, TimeSpan.Zero);
        var certBTime = new DateTimeOffset(2026, 4, 27, 0, 1, 0, TimeSpan.Zero);

        var time = new QueueTimeProvider(new[] { queryNow, certATime, certBTime });
        var (job, sp) = Build(time);

        // Seed two certs that fall within the 30-day expiring window relative to queryNow.
        await using (var seedScope = sp.CreateAsyncScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<ModularCADbContext>();
            seedDb.Certificates.AddRange(
                Cert("cert-A", queryNow.UtcDateTime.AddDays(10)),
                Cert("cert-B", queryNow.UtcDateTime.AddDays(20)));
            await seedDb.SaveChangesAsync();
        }

        await job.ProcessThresholdAsync(30, CancellationToken.None);

        await using var verifyScope = sp.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ModularCADbContext>();
        var logs = await verifyDb.NotificationLogs
            .OrderBy(n => n.CreatedAtUtc)
            .ToListAsync();

        Assert.Equal(2, logs.Count);
        // Cert A logged at 23:58 → date = 2026-04-26 (today before midnight)
        Assert.Equal(new DateTime(2026, 4, 26), logs[0].NotificationDate);
        // Cert B logged at 00:01 next day → date = 2026-04-27 (after midnight crossing)
        Assert.Equal(new DateTime(2026, 4, 27), logs[1].NotificationDate);
    }

    [Fact]
    public async Task All_Certs_In_Same_Day_Get_Same_NotificationDate()
    {
        // Sanity check that the per-cert recompute doesn't accidentally fragment dates when
        // there's no midnight crossing — both certs should land on today's date.
        var fixedTime = new DateTimeOffset(2026, 4, 26, 12, 0, 0, TimeSpan.Zero);
        var time = new QueueTimeProvider(new[] { fixedTime, fixedTime, fixedTime });
        var (job, sp) = Build(time);

        await using (var seedScope = sp.CreateAsyncScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<ModularCADbContext>();
            seedDb.Certificates.AddRange(
                Cert("cert-A", fixedTime.UtcDateTime.AddDays(10)),
                Cert("cert-B", fixedTime.UtcDateTime.AddDays(20)));
            await seedDb.SaveChangesAsync();
        }

        await job.ProcessThresholdAsync(30, CancellationToken.None);

        await using var verifyScope = sp.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ModularCADbContext>();
        var logs = await verifyDb.NotificationLogs.ToListAsync();

        Assert.Equal(2, logs.Count);
        Assert.All(logs, log => Assert.Equal(new DateTime(2026, 4, 26), log.NotificationDate));
    }
}
