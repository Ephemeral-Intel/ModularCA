using Microsoft.AspNetCore.Http.Features;
using ModularCA.Shared.Models.Config;

namespace ModularCA.API.Middleware;

/// <summary>
/// Enforces a tight per-listener body size cap on the
/// plain-HTTP PKI listener. The default Kestrel body cap is 10 MB (set
/// globally in <c>ConfigureKestrel</c>), which is fine for the HTTPS
/// management surface. On the plain-HTTP listener the only POSTs that should
/// ever arrive are OCSP / EST / SCEP / CMP (all of which already have their
/// own tighter per-protocol caps), so tightening the
/// connection-level cap further on that listener closes the drive-by
/// body-flood DoS window.
/// <para>
/// The middleware runs early in the pipeline and looks at
/// <c>Connection.LocalPort</c> — NOT at the forwarded scheme — so a
/// TLS-terminating reverse proxy fronting the HTTPS listener is unaffected.
/// If the plain-HTTP port is 0 (disabled), this middleware short-circuits.
/// </para>
/// </summary>
public class PlainHttpBodyLimitMiddleware
{
    /// <summary>
    /// 256 KB. Comfortable for even the largest OCSP / EST / SCEP / CMP
    /// requests the plain-HTTP listener will see.
    /// </summary>
    public const long PlainHttpBodyCap = 256 * 1024;

    private readonly RequestDelegate _next;
    private readonly int _plainHttpPort;

    /// <summary>
    /// Initializes a new <see cref="PlainHttpBodyLimitMiddleware"/>.
    /// </summary>
    /// <param name="next">The next delegate in the pipeline.</param>
    /// <param name="config">System configuration supplying the plain-HTTP listener port.</param>
    public PlainHttpBodyLimitMiddleware(RequestDelegate next, SystemConfig config)
    {
        _next = next;
        _plainHttpPort = config.Http.Port;
    }

    /// <summary>
    /// Resizes the per-request body limit when the connection arrived on the
    /// plain-HTTP listener, then invokes the next delegate.
    /// </summary>
    public async Task InvokeAsync(HttpContext context)
    {
        if (_plainHttpPort > 0 && context.Connection.LocalPort == _plainHttpPort)
        {
            var feature = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (feature != null && !feature.IsReadOnly)
            {
                feature.MaxRequestBodySize = PlainHttpBodyCap;
            }
        }
        await _next(context);
    }
}
