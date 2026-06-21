using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using ModularCA.Shared.Models.Config;

namespace ModularCA.API.Filters;

/// <summary>
/// Action filter attribute that validates API key authentication via the X-API-Key header.
/// Used by integration endpoints for infrastructure-as-code tools (Terraform, Ansible).
/// Rejects requests when the integration API is disabled or the key does not match.
/// Implements IFilterFactory to resolve SystemConfig from DI at runtime.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class ApiKeyAuthAttribute : Attribute, IFilterFactory
{
    /// <inheritdoc />
    public bool IsReusable => true;

    /// <summary>
    /// Creates the inner action filter, resolving the SystemConfig from DI.
    /// </summary>
    public IFilterMetadata CreateInstance(IServiceProvider serviceProvider)
    {
        var config = serviceProvider.GetRequiredService<SystemConfig>();
        return new ApiKeyAuthFilter(config);
    }
}

/// <summary>
/// Inner filter that performs constant-time API key comparison against the configured value.
/// Returns 503 when the integration API is disabled or unconfigured, and 401 when the key
/// is missing or invalid. Uses constant-time comparison to prevent timing side-channel attacks.
/// </summary>
internal class ApiKeyAuthFilter(SystemConfig config) : IAsyncActionFilter
{
    private const string ApiKeyHeaderName = "X-API-Key";

    /// <summary>
    /// Validates the X-API-Key header against the configured integration API key.
    /// </summary>
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (!config.IntegrationApi.Enabled)
        {
            context.Result = new ObjectResult(new { error = "Integration API is disabled." })
            {
                StatusCode = 503
            };
            return;
        }

        if (string.IsNullOrWhiteSpace(config.IntegrationApi.ApiKey))
        {
            context.Result = new ObjectResult(new { error = "Integration API key is not configured." })
            {
                StatusCode = 503
            };
            return;
        }

        if (!context.HttpContext.Request.Headers.TryGetValue(ApiKeyHeaderName, out var apiKeyHeader)
            || string.IsNullOrWhiteSpace(apiKeyHeader))
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Missing X-API-Key header." });
            return;
        }

        var expected = config.IntegrationApi.ApiKey;
        var provided = apiKeyHeader.ToString();

        if (!CryptographicEquals(expected, provided))
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Invalid API key." });
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
