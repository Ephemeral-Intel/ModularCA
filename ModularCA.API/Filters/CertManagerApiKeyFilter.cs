using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using ModularCA.Shared.Models.Config;

namespace ModularCA.API.Filters;

/// <summary>
/// Action filter that authenticates requests to cert-manager integration endpoints
/// by validating the <c>X-API-Key</c> header against the configured API key in
/// <see cref="CertManagerConfig"/>. Returns 401 if the key is missing or invalid,
/// and 503 if the cert-manager integration is disabled.
/// </summary>
public class CertManagerApiKeyFilter : IAsyncActionFilter
{
    private readonly SystemConfig _config;

    /// <summary>
    /// Initializes a new instance of <see cref="CertManagerApiKeyFilter"/>.
    /// </summary>
    /// <param name="config">The system configuration containing cert-manager settings.</param>
    public CertManagerApiKeyFilter(SystemConfig config)
    {
        _config = config;
    }

    /// <summary>
    /// Validates the API key from the <c>X-API-Key</c> header before executing the action.
    /// </summary>
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (!_config.CertManager.Enabled)
        {
            context.Result = new ObjectResult(new { error = "cert-manager integration is disabled" })
            {
                StatusCode = 503
            };
            return;
        }

        if (string.IsNullOrWhiteSpace(_config.CertManager.ApiKey))
        {
            context.Result = new ObjectResult(new { error = "cert-manager API key is not configured" })
            {
                StatusCode = 503
            };
            return;
        }

        if (!context.HttpContext.Request.Headers.TryGetValue("X-API-Key", out var apiKeyHeader)
            || string.IsNullOrWhiteSpace(apiKeyHeader))
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Missing X-API-Key header" });
            return;
        }

        // Constant-time comparison to avoid timing attacks
        var expected = _config.CertManager.ApiKey;
        var provided = apiKeyHeader.ToString();

        if (!CryptographicEquals(expected, provided))
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Invalid API key" });
            return;
        }

        await next();
    }

    /// <summary>
    /// Performs a constant-time string comparison to prevent timing side-channel attacks.
    /// </summary>
    private static bool CryptographicEquals(string a, string b)
    {
        if (a.Length != b.Length)
            return false;

        int result = 0;
        for (int i = 0; i < a.Length; i++)
            result |= a[i] ^ b[i];

        return result == 0;
    }
}
