using Microsoft.EntityFrameworkCore;
using MySqlConnector;

namespace ModularCA.Database;

/// <summary>
/// Helpers for inspecting MySQL-specific exception details surfaced through EF Core's
/// generic <see cref="DbUpdateException"/>. EF Core wraps the provider exception in
/// <c>InnerException</c>; this util walks the chain and returns provider-specific
/// information in a way callers don't have to repeat.
/// </summary>
public static class MySqlErrorUtil
{
    /// <summary>
    /// Returns true when the inner-exception chain of <paramref name="ex"/> contains
    /// a MySQL <c>ER_DUP_ENTRY</c> (error number 1062) — the canonical "row already
    /// exists" / unique-index violation signal. Use as a <c>when</c> filter on a
    /// <c>catch (DbUpdateException ex)</c> handler so non-uniqueness failures
    /// (transient connection drops, FK violations, schema mismatches) bubble up
    /// instead of being silently treated as "already exists".
    /// </summary>
    public static bool IsUniqueViolation(DbUpdateException ex)
    {
        for (var inner = ex.InnerException; inner != null; inner = inner.InnerException)
        {
            if (inner is MySqlException mysqlEx && mysqlEx.Number == 1062)
                return true;
        }
        return false;
    }
}
