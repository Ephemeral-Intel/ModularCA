using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace ModularCA.API.Middleware;

/// <summary>
/// Translates <see cref="DbUpdateConcurrencyException"/>
/// into an HTTP 409 <c>application/problem+json</c> response so optimistic
/// concurrency failures on <c>[Timestamp] RowVersion</c> columns surface as a
/// clean "resource was modified — refresh and retry" signal instead of a
/// generic 500. Mirrors the <see cref="AuditFailClosedMiddleware"/> pattern:
/// catches the single exception type it owns, re-throws everything else, and
/// runs immediately after the audit fail-closed layer in the pipeline.
/// </summary>
public sealed class ConcurrencyConflictMiddleware(
    RequestDelegate next,
    ILogger<ConcurrencyConflictMiddleware> logger)
{
    /// <summary>
    /// Invokes the middleware pipeline and converts any propagated
    /// <see cref="DbUpdateConcurrencyException"/> into an RFC 7807
    /// problem-details response with status 409. Other exceptions are
    /// re-thrown unchanged so the outer exception handling layer can decide
    /// what to do with them.
    /// </summary>
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            // Extract the first affected entity type (if any) for log context.
            var entityType = "unknown";
            try
            {
                var firstEntry = ex.Entries.Count > 0 ? ex.Entries[0] : null;
                if (firstEntry is not null)
                {
                    entityType = firstEntry.Entity.GetType().Name;
                }
            }
            catch
            {
                // Defensive: if the Entries collection is malformed we still want
                // to return 409 rather than escalate to 500.
            }

            var correlationId =
                context.Items.TryGetValue("CorrelationId", out var cid) && cid is string s
                    ? s
                    : context.TraceIdentifier;

            logger.LogWarning(ex,
                "Concurrency conflict on {Method} {Path} for entity {EntityType} (correlationId={CorrelationId}): {Message}",
                context.Request.Method,
                context.Request.Path,
                entityType,
                correlationId,
                ex.Message);

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status409Conflict;
            context.Response.ContentType = "application/problem+json";

            var body = JsonSerializer.Serialize(new
            {
                type = "https://tools.ietf.org/html/rfc7231#section-6.5.8",
                title = "Conflict",
                status = 409,
                detail = "The resource was modified by another request. Refresh and retry.",
                correlationId
            });

            await context.Response.WriteAsync(body);
        }
    }
}
