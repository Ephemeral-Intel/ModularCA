using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ModularCA.Shared.Models.Config;

namespace ModularCA.API.Controllers.v1.Public;

/// <summary>
/// Public (unauthenticated) endpoint that exposes non-sensitive deployment
/// identity — the operator-configured public domain and the canonical HTTPS
/// base URL — so the public SPA can display URLs users should copy into
/// external tooling (certbot, acme.sh, etc.) without confusing them with the
/// proxy-rewritable host the browser happens to see.
/// </summary>
[ApiController]
[Route("api/v1/public/info")]
[AllowAnonymous]
public class PublicInfoController(SystemConfig config) : ControllerBase
{
    private readonly SystemConfig _config = config;

    /// <summary>
    /// Returns <c>{ publicDomain, publicHttpsBaseUrl }</c>. Falls back to the
    /// request's scheme/host when <c>Https.PublicDomain</c> is unset (setup
    /// mode) so the SPA has something reasonable to render either way.
    /// </summary>
    [HttpGet]
    public IActionResult GetInfo()
    {
        var publicDomain = _config.Https.PublicDomain?.Trim() ?? string.Empty;
        var baseUrl = !string.IsNullOrWhiteSpace(publicDomain)
            ? _config.Https.GetPublicHttpsBaseUrl()
            : $"{Request.Scheme}://{Request.Host}";

        return Ok(new
        {
            publicDomain,
            publicHttpsBaseUrl = baseUrl,
        });
    }
}
