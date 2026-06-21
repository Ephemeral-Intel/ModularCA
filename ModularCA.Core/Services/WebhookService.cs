using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using ModularCA.Shared.Models.Config;

namespace ModularCA.Core.Services;

/// <summary>
/// Dispatches event notifications to configured webhook endpoints via HTTP POST.
/// </summary>
public interface IWebhookService
{
    /// <summary>
    /// Posts an event payload to all matching webhook endpoints.
    /// </summary>
    /// <param name="eventType">The event type identifier (e.g. "CertificateIssued").</param>
    /// <param name="payload">The event data to include in the webhook body.</param>
    Task PostEventAsync(string eventType, object payload);
}

/// <summary>
/// Default implementation of <see cref="IWebhookService"/> that delivers webhook
/// payloads with optional HMAC-SHA256 signatures and exponential-backoff retries.
/// </summary>
public class WebhookService : IWebhookService
{
    private readonly SystemConfig _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<WebhookService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    /// <summary>
    /// Initializes a new instance of the <see cref="WebhookService"/> class.
    /// </summary>
    /// <param name="config">The system configuration containing webhook settings.</param>
    /// <param name="httpClientFactory">Factory for creating named HTTP clients.</param>
    /// <param name="logger">Logger instance for recording delivery outcomes.</param>
    public WebhookService(SystemConfig config, IHttpClientFactory httpClientFactory, ILogger<WebhookService> logger)
    {
        _config = config;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task PostEventAsync(string eventType, object payload)
    {
        var webhookConfig = _config.Webhook;
        if (!webhookConfig.Enabled || webhookConfig.Endpoints.Count == 0)
            return;

        var envelope = new
        {
            @event = eventType,
            timestamp = DateTime.UtcNow.ToString("o"),
            data = payload
        };

        var json = JsonSerializer.Serialize(envelope, JsonOptions);

        var tasks = webhookConfig.Endpoints
            .Where(ep => EndpointMatchesEvent(ep, eventType))
            .Select(ep => DeliverAsync(ep, json, webhookConfig.MaxRetries, webhookConfig.RetryDelaySeconds));

        await Task.WhenAll(tasks);
    }

    /// <summary>
    /// Determines whether an endpoint is subscribed to the given event type.
    /// An empty Events list means the endpoint receives all events.
    /// </summary>
    private static bool EndpointMatchesEvent(WebhookEndpoint endpoint, string eventType)
    {
        return endpoint.Events.Count == 0
            || endpoint.Events.Contains(eventType, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Delivers the JSON payload to a single endpoint with retry and exponential backoff.
    /// </summary>
    private async Task DeliverAsync(WebhookEndpoint endpoint, string json, int maxRetries, int baseDelaySeconds)
    {
        var (isSafe, reason) = await IsUrlSafeForSsrfAsync(endpoint.Url);
        if (!isSafe)
        {
            _logger.LogError(
                "Webhook delivery to {Url} blocked by SSRF validation: {Reason}",
                endpoint.Url, reason);
            return;
        }

        var client = _httpClientFactory.CreateClient("Webhook");

        for (int attempt = 0; attempt <= maxRetries; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint.Url);
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");

                if (!string.IsNullOrEmpty(endpoint.Secret))
                {
                    var signature = ComputeHmacSha256(json, endpoint.Secret);
                    request.Headers.Add("X-Webhook-Signature", signature);
                }

                var response = await client.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogDebug("Webhook delivered to {Url} (attempt {Attempt})", endpoint.Url, attempt + 1);
                    return;
                }

                _logger.LogWarning(
                    "Webhook delivery to {Url} returned {StatusCode} (attempt {Attempt}/{MaxAttempts})",
                    endpoint.Url, (int)response.StatusCode, attempt + 1, maxRetries + 1);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Webhook delivery to {Url} failed (attempt {Attempt}/{MaxAttempts})",
                    endpoint.Url, attempt + 1, maxRetries + 1);
            }

            if (attempt < maxRetries)
            {
                var delay = baseDelaySeconds * (int)Math.Pow(2, attempt);
                await Task.Delay(TimeSpan.FromSeconds(delay));
            }
        }

        _logger.LogError("Webhook delivery to {Url} exhausted all {MaxAttempts} attempts", endpoint.Url, maxRetries + 1);
    }

    /// <summary>
    /// Validates that a webhook URL is safe from SSRF attacks by checking scheme,
    /// hostname, and resolved IP addresses against private/loopback ranges.
    /// </summary>
    /// <param name="url">The webhook endpoint URL to validate.</param>
    /// <returns>True if the URL is safe to call; false if it targets a private or loopback address.</returns>
    public static async Task<(bool IsSafe, string Reason)> IsUrlSafeForSsrfAsync(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return (false, "URL is not a valid absolute URI");

        if (!string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase))
            return (false, $"Scheme '{uri.Scheme}' is not allowed; only HTTPS is permitted");

        var host = uri.Host;
        if (string.IsNullOrWhiteSpace(host))
            return (false, "URL has no hostname");

        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase))
            return (false, "localhost is not allowed as a webhook target");

        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(host);
        }
        catch (SocketException)
        {
            return (false, $"DNS resolution failed for host '{host}'");
        }

        if (addresses.Length == 0)
            return (false, $"DNS resolution returned no addresses for host '{host}'");

        foreach (var ip in addresses)
        {
            if (IsPrivateOrLoopback(ip))
                return (false, $"Resolved address {ip} is a private or loopback address");
        }

        return (true, string.Empty);
    }

    /// <summary>
    /// Checks whether an IP address belongs to a private, loopback, or link-local range.
    /// Covers: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
    /// 169.254.0.0/16, ::1, fc00::/7, and fe80::/10.
    /// </summary>
    private static bool IsPrivateOrLoopback(IPAddress address)
    {
        if (IPAddress.IsLoopback(address))
            return true;

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            // ::1 is covered by IsLoopback above.
            // fc00::/7 — unique-local addresses (fc00:: through fdff::)
            var bytes = address.GetAddressBytes();
            if ((bytes[0] & 0xFE) == 0xFC)
                return true;
            // fe80::/10 — link-local
            if (bytes[0] == 0xFE && (bytes[1] & 0xC0) == 0x80)
                return true;
            // IPv4-mapped IPv6 (::ffff:x.x.x.x) — check the embedded IPv4
            if (address.IsIPv4MappedToIPv6)
                return IsPrivateOrLoopback(address.MapToIPv4());
            return false;
        }

        // IPv4
        var octets = address.GetAddressBytes();
        // 10.0.0.0/8
        if (octets[0] == 10) return true;
        // 172.16.0.0/12
        if (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31) return true;
        // 192.168.0.0/16
        if (octets[0] == 192 && octets[1] == 168) return true;
        // 127.0.0.0/8 (also covered by IsLoopback, belt-and-suspenders)
        if (octets[0] == 127) return true;
        // 169.254.0.0/16 — link-local
        if (octets[0] == 169 && octets[1] == 254) return true;
        // 0.0.0.0/8
        if (octets[0] == 0) return true;

        return false;
    }

    /// <summary>
    /// Computes an HMAC-SHA256 signature for the given payload using the provided secret.
    /// </summary>
    /// <param name="payload">The JSON payload to sign.</param>
    /// <param name="secret">The shared secret key.</param>
    /// <returns>A hex-encoded HMAC-SHA256 signature prefixed with "sha256=".</returns>
    private static string ComputeHmacSha256(string payload, string secret)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);
        using var hmac = new HMACSHA256(keyBytes);
        var hash = hmac.ComputeHash(payloadBytes);
        return "sha256=" + Convert.ToHexString(hash).ToLowerInvariant();
    }
}
