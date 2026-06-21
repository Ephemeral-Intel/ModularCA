using Microsoft.EntityFrameworkCore;
using ModularCA.Database;

namespace ModularCA.Tests.TestUtils;

/// <summary>
/// Builds a fresh <see cref="ModularCADbContext"/> backed by EF Core's in-memory provider for
/// each test invocation. The database name is unique per call so two concurrent tests never
/// see each other's data. Use within a <c>using</c> block — the factory does not own
/// disposal, the test does.
/// <para>
/// Suitable for entity-shape, query-builder, and most service-level tests. Tests that exercise
/// raw SQL, JSON column semantics, transaction isolation, or migration behavior must use a real
/// MySQL container (out of scope for the unit-test project — that's <c>ModularCA.IntegrationTests</c>'s
/// territory).
/// </para>
/// </summary>
internal static class InMemoryDbContextFactory
{
    public static ModularCADbContext Create()
    {
        var options = new DbContextOptionsBuilder<ModularCADbContext>()
            .UseInMemoryDatabase($"test-{Guid.NewGuid():N}")
            // Suppress the "InMemory doesn't support transactions" warning. Production code
            // uses BeginTransactionAsync; in-memory silently no-ops on it. Acceptable for tests
            // that don't depend on rollback semantics — we'd use Testcontainers MySQL otherwise.
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new ModularCADbContext(options);
    }
}
