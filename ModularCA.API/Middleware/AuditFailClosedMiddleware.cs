using System.Text.Json;
using ModularCA.Core.Services;

namespace ModularCA.API.Middleware;

/// <summary>
/// Translates <see cref="AuditWriteFailedException"/>
/// into an HTTP 503 response when <c>Audit.FailMode=FailClosed</c> is in effect.
/// Runs outermost in the pipeline (after security headers and HTTPS enforcement)
/// so that any controller or downstream middleware that triggers a fail-closed
/// audit write surfaces the outage as a 503 instead of a generic 500. Operators
/// who enable FailClosed get a clean "audit subsystem unavailable" signal that
/// correlates with the <c>modularca_audit_writes_failed_total</c> counter.
/// </summary>
public sealed class AuditFailClosedMiddleware(RequestDelegate next, ILogger<AuditFailClosedMiddleware> logger)
{
    /// <summary>
    /// Invokes the middleware pipeline and converts any propagated
    /// <see cref="AuditWriteFailedException"/> into a 503 response with a small
    /// JSON body identifying the audit subsystem as the source of the failure.
    /// </summary>
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AuditWriteFailedException ex)
        {
            logger.LogError(ex,
                "Audit fail-closed: request {Method} {Path} aborted because audit write for {ActionType} failed",
                context.Request.Method, context.Request.Path, ex.ActionType);

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.Headers["Retry-After"] = "30";
            context.Response.ContentType = "application/json";

            var body = JsonSerializer.Serialize(new
            {
                error = "audit_unavailable",
                message = "The audit subsystem is unavailable and Audit.FailMode=FailClosed is in effect. The requested operation was rejected to preserve audit completeness.",
                retryAfterSeconds = 30
            });

            await context.Response.WriteAsync(body);
        }
    }
}
