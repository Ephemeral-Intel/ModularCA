using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using ModularCA.Core.Services;
using ModularCA.Core.Services.SchedulerJobs;
using ModularCA.Database;
using ModularCA.Shared.Models.Config;
using ModularCA.Tests.TestUtils;
using Xunit;

namespace ModularCA.Tests.Core.Services.SchedulerJobs;

/// <summary>
/// Tests for <see cref="PerRowScheduledJob{TRow}"/>'s tick gating: past-due rows fire, future-due
/// rows skip, cancellation halts iteration, and the per-row <c>jobName</c> format is
/// <c>{Name}:{rowId}</c> (verified via <see cref="ModularCADbContext.SchedulerJobStates"/> after
/// a successful run). These are the invariants the per-row jobs in production rely on; a
/// regression would either over-fire (CRL/LDAP rows churning) or silently never fire.
/// </summary>
public class PerRowScheduledJobTickTests
{
    /// <summary>Minimal row entity that the test job's RowsAsync returns.</summary>
    private sealed class TestRow
    {
        public Guid Id { get; init; }
        public DateTime NextRunUtc { get; init; }
    }

    /// <summary>Concrete subclass of <see cref="PerRowScheduledJob{TRow}"/> for assertions.</summary>
    private sealed class TestJob : PerRowScheduledJob<TestRow>
    {
        public TestJob(
            IServiceProvider sp, ILogger logger, SystemConfig config,
            SchedulerJobRunner runner, TimeProvider timeProvider,
            IReadOnlyList<TestRow> rows)
            : base(sp, logger, config, runner, timeProvider)
        {
            Rows = rows;
        }

        public IReadOnlyList<TestRow> Rows { get; }
        public List<Guid> ExecutedRowIds { get; } = new();
        public override string Name => "TestJob";

        protected override Task<IReadOnlyList<TestRow>> RowsAsync(ModularCADbContext db, CancellationToken ct)
            => Task.FromResult(Rows);

        protected override Guid IdOf(TestRow row) => row.Id;
        protected override DateTime NextRunUtcOf(TestRow row) => row.NextRunUtc;

        protected override Task ExecuteRowAsync(TestRow row, CancellationToken ct)
        {
            ExecutedRowIds.Add(row.Id);
            return Task.CompletedTask;
        }
    }

    /// <summary>Builds a job + service provider wired up against EF in-memory.</summary>
    private static (TestJob Job, IServiceProvider Sp) Build(
        IReadOnlyList<TestRow> rows, DateTimeOffset now)
    {
        var dbName = $"test-{Guid.NewGuid():N}";
        var services = new ServiceCollection();
        services.AddDbContext<ModularCADbContext>(opts => opts
            .UseInMemoryDatabase(dbName)
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        var sp = services.BuildServiceProvider();

        var time = new FixedTimeProvider(now);
        var config = new SystemConfig();
        var runner = new SchedulerJobRunner(sp, NullLogger<SchedulerJobRunner>.Instance, config, "test", time);
        var job = new TestJob(sp, NullLogger.Instance, config, runner, time, rows);
        return (job, sp);
    }

    [Fact]
    public async Task Past_Due_Row_Fires_ExecuteRowAsync()
    {
        var now = new DateTimeOffset(2026, 4, 26, 12, 0, 0, TimeSpan.Zero);
        var row = new TestRow { Id = Guid.NewGuid(), NextRunUtc = now.UtcDateTime.AddMinutes(-5) };
        var (job, _) = Build(new[] { row }, now);

        await job.TickAsync(CancellationToken.None);

        Assert.Single(job.ExecutedRowIds);
        Assert.Equal(row.Id, job.ExecutedRowIds[0]);
    }

    [Fact]
    public async Task Future_Due_Row_Is_Skipped()
    {
        var now = new DateTimeOffset(2026, 4, 26, 12, 0, 0, TimeSpan.Zero);
        var row = new TestRow { Id = Guid.NewGuid(), NextRunUtc = now.UtcDateTime.AddMinutes(5) };
        var (job, _) = Build(new[] { row }, now);

        await job.TickAsync(CancellationToken.None);

        Assert.Empty(job.ExecutedRowIds);
    }

    [Fact]
    public async Task Mixed_Tick_Fires_Only_Past_Due_Rows_In_Order()
    {
        var now = new DateTimeOffset(2026, 4, 26, 12, 0, 0, TimeSpan.Zero);
        var rowPast1 = new TestRow { Id = Guid.NewGuid(), NextRunUtc = now.UtcDateTime.AddMinutes(-10) };
        var rowFuture = new TestRow { Id = Guid.NewGuid(), NextRunUtc = now.UtcDateTime.AddMinutes(5) };
        var rowPast2 = new TestRow { Id = Guid.NewGuid(), NextRunUtc = now.UtcDateTime.AddMinutes(-1) };
        var (job, _) = Build(new[] { rowPast1, rowFuture, rowPast2 }, now);

        await job.TickAsync(CancellationToken.None);

        // Future row skipped; past rows fire in iteration order (the order Rows returns).
        Assert.Equal(new[] { rowPast1.Id, rowPast2.Id }, job.ExecutedRowIds);
    }

    [Fact]
    public async Task Pre_Cancelled_Token_Skips_All_Iterations()
    {
        var now = new DateTimeOffset(2026, 4, 26, 12, 0, 0, TimeSpan.Zero);
        var row = new TestRow { Id = Guid.NewGuid(), NextRunUtc = now.UtcDateTime.AddMinutes(-1) };
        var (job, _) = Build(new[] { row }, now);

        using var cts = new CancellationTokenSource();
        cts.Cancel();
        await job.TickAsync(cts.Token);

        Assert.Empty(job.ExecutedRowIds);
    }

    [Fact]
    public async Task Per_Row_JobName_Format_Is_Name_Colon_RowId()
    {
        // After a successful row run, the SchedulerJobRunner persists a SchedulerJobStates row
        // with JobName = "{Name}:{IdOf(row)}". Verify by reading the row back.
        var now = new DateTimeOffset(2026, 4, 26, 12, 0, 0, TimeSpan.Zero);
        var row = new TestRow { Id = Guid.NewGuid(), NextRunUtc = now.UtcDateTime.AddMinutes(-1) };
        var (job, sp) = Build(new[] { row }, now);

        await job.TickAsync(CancellationToken.None);

        // Resolve a fresh DbContext via the SP — same in-memory store as the runner used to
        // persist the state row.
        await using var scope = sp.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ModularCADbContext>();
        var stateRow = await db.SchedulerJobStates
            .FirstOrDefaultAsync(s => s.JobName == $"TestJob:{row.Id}");
        Assert.NotNull(stateRow);
        Assert.Equal("success", stateRow!.LastResult);
    }
}
