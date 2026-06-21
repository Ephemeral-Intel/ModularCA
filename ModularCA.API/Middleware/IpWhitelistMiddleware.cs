using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Config;
using ModularCA.Shared.Utils;
using System.Net;

namespace ModularCA.API.Middleware;

/// <summary>
/// IP whitelist enforcement. Delegates all rule lookup and CIDR matching to
/// <see cref="IWhitelistService"/>'s in-memory snapshot, so there is no
/// per-request database hit and no path-bucket derivation logic duplicated
/// in the middleware. Pre-bootstrap (when the service has not yet warmed
/// from the database), applies a hardcoded RFC1918 / loopback fallback
/// sourced from <see cref="WhitelistDefaults.InternalOnlyCidrs"/> to the
/// <c>/setup/*</c> and <c>/api/v1/setup/*</c> paths so the setup wizard is
/// internal-only before the database exists; every other path passes through
/// during pre-bootstrap because there is nothing to meaningfully gate yet.
/// Preserves the <c>config.IpWhitelist.Enabled</c> master kill switch and
/// the YAML-sourced <c>ExemptPaths</c> list (path exclusion, not IP allow
/// list — a separate concept that stays in config.yaml). Blocked requests
/// return an HTTP 403 with a plain-text body and set
/// <c>HttpContext.Items["IpWhitelistBlocked"] = true</c> so
/// <see cref="RequestAuditMiddleware"/> can record the denial in the audit
/// log.
/// </summary>
public class IpWhitelistMiddleware
{
    private readonly RequestDelegate _next;
    private readonly SystemConfig _config;
    private readonly IWhitelistService _whitelistService;
    private readonly bool _enabled;

    /// <summary>
    /// Constructs the middleware. The master kill switch is captured once
    /// at startup from <c>config.IpWhitelist.Enabled</c>; flipping it at
    /// runtime requires a restart (same behavior as before).
    /// </summary>
    /// <param name="next">The next delegate in the pipeline.</param>
    /// <param name="config">System configuration for the kill switch and exempt paths.</param>
    /// <param name="whitelistService">Centralized whitelist evaluator backed by the in-memory snapshot of the <c>Whitelists</c> table.</param>
    public IpWhitelistMiddleware(RequestDelegate next, SystemConfig config, IWhitelistService whitelistService)
    {
        _next = next;
        _config = config;
        _whitelistService = whitelistService;
        _enabled = config.IpWhitelist.Enabled;
    }

    /// <summary>
    /// Evaluates the incoming request against the whitelist snapshot (or
    /// the pre-bootstrap fallback if the service has not yet warmed) and
    /// either passes the request to the next middleware or returns 403.
    /// </summary>
    public async Task InvokeAsync(HttpContext context)
    {
        // Master kill switch — whitelist enforcement fully disabled.
        if (!_enabled)
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? "";

        // YAML exempt paths — path exclusion layer, bypasses IP checks entirely.
        foreach (var exempt in _config.IpWhitelist.ExemptPaths)
        {
            if (path.StartsWith(exempt, StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }
        }

        var remoteIp = context.Connection.RemoteIpAddress;
        if (remoteIp != null && remoteIp.IsIPv4MappedToIPv6)
        {
            remoteIp = remoteIp.MapToIPv4();
        }

        // Pre-bootstrap fallback: the whitelist service has not yet read
        // the Whitelists table (either the DB / table does not exist yet,
        // or migrations have not been applied). In this mode we only gate
        // the setup wizard paths against the hardcoded RFC1918 / loopback
        // fallback, and let everything else through because there are no
        // real CAs or protocol endpoints to protect yet.
        if (!_whitelistService.IsWarm)
        {
            var isSetupPath = path.StartsWith("/setup/", StringComparison.OrdinalIgnoreCase)
                           || path.StartsWith("/api/v1/setup/", StringComparison.OrdinalIgnoreCase)
                           || path.Equals("/setup", StringComparison.OrdinalIgnoreCase)
                           || path.Equals("/api/v1/setup", StringComparison.OrdinalIgnoreCase);
            var isAdminPath = path.StartsWith("/admin/", StringComparison.OrdinalIgnoreCase)
                           || path.StartsWith("/api/v1/admin/", StringComparison.OrdinalIgnoreCase)
                           || path.Equals("/admin", StringComparison.OrdinalIgnoreCase)
                           || path.Equals("/api/v1/admin", StringComparison.OrdinalIgnoreCase);
            if (isSetupPath || isAdminPath)
            {
                if (remoteIp == null)
                {
                    context.Items["IpWhitelistBlocked"] = true;
                    context.Response.StatusCode = 403;
                    context.Response.ContentType = "text/plain";
                    await context.Response.WriteAsync("IP address could not be determined");
                    return;
                }

                var fallbackNetworks = CidrMatcher.ParseNetworks(WhitelistDefaults.InternalOnlyCidrs);
                if (!CidrMatcher.IsAllowed(remoteIp, fallbackNetworks))
                {
                    var surface = isSetupPath ? "setup" : "admin";
                    context.Items["IpWhitelistBlocked"] = true;
                    context.Response.StatusCode = 403;
                    context.Response.ContentType = "text/plain";
                    await context.Response.WriteAsync($"Access denied: {remoteIp} is not in the allowed IP ranges for {surface} (pre-bootstrap RFC1918 fallback)");
                    return;
                }

                // Gated path from an internal network — allow through.
                await _next(context);
                return;
            }

            // Non-setup, non-admin path during pre-bootstrap — pass through.
            await _next(context);
            return;
        }

        // Normal service-backed evaluation against the in-memory snapshot.
        var decision = _whitelistService.Evaluate(path, remoteIp);

        switch (decision)
        {
            case WhitelistDecision.Allow:
            case WhitelistDecision.NotCovered:
                await _next(context);
                return;

            case WhitelistDecision.Deny:
                if (remoteIp == null)
                {
                    context.Items["IpWhitelistBlocked"] = true;
                    context.Response.StatusCode = 403;
                    context.Response.ContentType = "text/plain";
                    await context.Response.WriteAsync("IP address could not be determined");
                    return;
                }
                context.Items["IpWhitelistBlocked"] = true;
                context.Response.StatusCode = 403;
                context.Response.ContentType = "text/plain";
                await context.Response.WriteAsync($"Access denied: {remoteIp} is not in the allowed IP ranges for {path}");
                return;

            default:
                await _next(context);
                return;
        }
    }
}
