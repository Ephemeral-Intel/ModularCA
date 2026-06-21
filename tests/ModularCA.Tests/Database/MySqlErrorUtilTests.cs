using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Tests.TestUtils;
using Xunit;

namespace ModularCA.Tests.Database;

/// <summary>
/// Tests for <see cref="MySqlErrorUtil.IsUniqueViolation"/>. The helper backs the
/// <c>catch (DbUpdateException ex) when (MySqlErrorUtil.IsUniqueViolation(ex))</c> filter
/// in <c>CertExpiryNotificationJob</c> and <c>CmpService.PersistOrCheckTransactionAsync</c>.
/// A bug here would either swallow non-uniqueness errors as "already exists" (data loss) or
/// fail to recognize legitimate uniqueness collisions (false-positive failures).
/// </summary>
public class MySqlErrorUtilTests
{
    [Fact]
    public void Probe_Factory_Produces_MySqlException_With_Correct_Number()
    {
        // Verifies the test helper itself before we trust IsUniqueViolation downstream.
        var ex = MySqlExceptionFactory.With(1062);
        Assert.Equal(1062, ex.Number);
    }

    [Fact]
    public void Returns_True_When_Inner_Is_MySqlException_With_Number_1062()
    {
        var inner = MySqlExceptionFactory.With(1062);
        var dbEx = new DbUpdateException("dup", inner);

        Assert.True(MySqlErrorUtil.IsUniqueViolation(dbEx));
    }

    [Fact]
    public void Returns_False_When_Inner_Is_MySqlException_With_Different_Number()
    {
        // 1213 = ER_LOCK_DEADLOCK; legitimate transient failure that should NOT be silently
        // swallowed as a uniqueness collision.
        var inner = MySqlExceptionFactory.With(1213);
        var dbEx = new DbUpdateException("deadlock", inner);

        Assert.False(MySqlErrorUtil.IsUniqueViolation(dbEx));
    }

    [Fact]
    public void Returns_False_When_Chain_Has_No_MySqlException()
    {
        var inner = new InvalidOperationException("not a MySQL error");
        var dbEx = new DbUpdateException("unrelated", inner);

        Assert.False(MySqlErrorUtil.IsUniqueViolation(dbEx));
    }

    [Fact]
    public void Walks_Inner_Chain_To_Find_MySqlException()
    {
        // Some EF code paths wrap MySqlException one or two levels deep. The helper must
        // traverse the chain rather than only checking the immediate InnerException.
        var deepest = MySqlExceptionFactory.With(1062);
        var middle = new InvalidOperationException("wrapper", deepest);
        var dbEx = new DbUpdateException("update failed", middle);

        Assert.True(MySqlErrorUtil.IsUniqueViolation(dbEx));
    }
}
