using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace ModularCA.Core.Services;

/// <summary>
/// EF Core <see cref="DbCommandInterceptor"/> that observes every command's elapsed
/// duration into the <see cref="MetricsService.DbQueryDuration"/> histogram, labelled
/// by operation (reader, non_query, scalar) and outcome (ok, error).
/// </summary>
/// <remarks>
/// The observability review flagged the absence of DB query
/// duration metrics. The interceptor is registered on both <c>ModularCADbContext</c>
/// and <c>AuditDbContext</c> via <c>options.AddInterceptors(new DbCommandDurationInterceptor())</c>
/// in <c>StartModularCA.cs</c>. No per-query SQL text is captured — only the
/// elapsed time and outcome — so there is no risk of logging credentialed material.
/// </remarks>
public sealed class DbCommandDurationInterceptor : DbCommandInterceptor
{
    /// <inheritdoc />
    public override ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        Observe("reader", "ok", eventData.Duration.TotalSeconds);
        return base.ReaderExecutedAsync(command, eventData, result, cancellationToken);
    }

    /// <inheritdoc />
    public override ValueTask<int> NonQueryExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        Observe("non_query", "ok", eventData.Duration.TotalSeconds);
        return base.NonQueryExecutedAsync(command, eventData, result, cancellationToken);
    }

    /// <inheritdoc />
    public override ValueTask<object?> ScalarExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        object? result,
        CancellationToken cancellationToken = default)
    {
        Observe("scalar", "ok", eventData.Duration.TotalSeconds);
        return base.ScalarExecutedAsync(command, eventData, result, cancellationToken);
    }

    /// <inheritdoc />
    public override Task CommandFailedAsync(
        DbCommand command,
        CommandErrorEventData eventData,
        CancellationToken cancellationToken = default)
    {
        Observe("unknown", "error", eventData.Duration.TotalSeconds);
        return base.CommandFailedAsync(command, eventData, cancellationToken);
    }

    /// <inheritdoc />
    public override void CommandFailed(DbCommand command, CommandErrorEventData eventData)
    {
        Observe("unknown", "error", eventData.Duration.TotalSeconds);
        base.CommandFailed(command, eventData);
    }

    /// <inheritdoc />
    public override DbDataReader ReaderExecuted(DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
    {
        Observe("reader", "ok", eventData.Duration.TotalSeconds);
        return base.ReaderExecuted(command, eventData, result);
    }

    /// <inheritdoc />
    public override int NonQueryExecuted(DbCommand command, CommandExecutedEventData eventData, int result)
    {
        Observe("non_query", "ok", eventData.Duration.TotalSeconds);
        return base.NonQueryExecuted(command, eventData, result);
    }

    /// <inheritdoc />
    public override object? ScalarExecuted(DbCommand command, CommandExecutedEventData eventData, object? result)
    {
        Observe("scalar", "ok", eventData.Duration.TotalSeconds);
        return base.ScalarExecuted(command, eventData, result);
    }

    private static void Observe(string operation, string status, double seconds)
    {
        try
        {
            MetricsService.DbQueryDuration.WithLabels(operation, status).Observe(seconds);
        }
        catch
        {
            // Never let a metrics registration race crash a DB call.
        }
    }
}
