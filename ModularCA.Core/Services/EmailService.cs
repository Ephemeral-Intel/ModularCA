using System.Net.Http.Json;
using System.Text.Json.Serialization;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using MimeKit;
using ModularCA.Shared.Models.Config;

namespace ModularCA.Core.Services;

/// <summary>
/// Sends emails via SMTP or webhook for notifications, alerts, and administrative messages.
/// </summary>
public interface IEmailService
{
    Task SendAsync(string to, string subject, string body, bool isHtml = false);
    Task SendAsync(IEnumerable<string> recipients, string subject, string body, bool isHtml = false);
    Task SendToAdminsAsync(string subject, string body);
}

public class EmailService : IEmailService
{
    private readonly SystemConfig _config;
    private readonly ILogger<EmailService> _logger;
    private static readonly HttpClient _httpClient = new();

    public EmailService(SystemConfig config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task SendAsync(string to, string subject, string body, bool isHtml = false)
    {
        return SendAsync(new[] { to }, subject, body, isHtml);
    }

    public async Task SendAsync(IEnumerable<string> recipients, string subject, string body, bool isHtml = false)
    {
        if (!_config.Email.Enabled || string.IsNullOrWhiteSpace(_config.Email.SmtpHost))
            return;

        try
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(_config.Email.FromName, _config.Email.FromAddress));

            foreach (var recipient in recipients)
            {
                var trimmed = recipient.Trim();
                if (!string.IsNullOrWhiteSpace(trimmed))
                    message.To.Add(MailboxAddress.Parse(trimmed));
            }

            if (message.To.Count == 0) return;

            message.Subject = subject;
            message.Body = new TextPart(isHtml ? "html" : "plain") { Text = body };

            using var client = new SmtpClient();

            var tlsOption = _config.Email.UseTls
                ? SecureSocketOptions.StartTls
                : SecureSocketOptions.Auto;

            await client.ConnectAsync(_config.Email.SmtpHost, _config.Email.SmtpPort, tlsOption);

            await AuthenticateAsync(client);

            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _logger.LogInformation("Email sent: '{Subject}' to {Recipients}", subject, string.Join(", ", recipients));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email: '{Subject}'", subject);
        }
    }

    private async Task AuthenticateAsync(SmtpClient client)
    {
        var authMethod = _config.Email.AuthMethod?.Trim();

        switch (authMethod?.ToLowerInvariant())
        {
            case "oauth2token":
                if (string.IsNullOrWhiteSpace(_config.Email.OAuth2AccessToken))
                    throw new InvalidOperationException("OAuth2Token auth requires OAuth2AccessToken to be set.");
                var tokenMechanism = new SaslMechanismOAuth2(_config.Email.Username, _config.Email.OAuth2AccessToken);
                await client.AuthenticateAsync(tokenMechanism);
                _logger.LogDebug("SMTP authenticated via OAuth2 static token for {Username}", _config.Email.Username);
                break;

            case "oauth2clientcredentials":
                var accessToken = await AcquireOAuth2TokenAsync();
                var ccMechanism = new SaslMechanismOAuth2(_config.Email.Username, accessToken);
                await client.AuthenticateAsync(ccMechanism);
                _logger.LogDebug("SMTP authenticated via OAuth2 client credentials for {Username}", _config.Email.Username);
                break;

            case "password":
            default:
                if (!string.IsNullOrWhiteSpace(_config.Email.Username))
                    await client.AuthenticateAsync(_config.Email.Username, _config.Email.Password);
                break;
        }
    }

    private async Task<string> AcquireOAuth2TokenAsync()
    {
        if (string.IsNullOrWhiteSpace(_config.Email.OAuth2TokenUrl))
            throw new InvalidOperationException("OAuth2ClientCredentials auth requires OAuth2TokenUrl to be set.");
        if (string.IsNullOrWhiteSpace(_config.Email.OAuth2ClientId))
            throw new InvalidOperationException("OAuth2ClientCredentials auth requires OAuth2ClientId to be set.");
        if (string.IsNullOrWhiteSpace(_config.Email.OAuth2ClientSecret))
            throw new InvalidOperationException("OAuth2ClientCredentials auth requires OAuth2ClientSecret to be set.");

        var scopes = !string.IsNullOrWhiteSpace(_config.Email.OAuth2Scopes)
            ? _config.Email.OAuth2Scopes
            : "https://outlook.office365.com/.default";

        var tokenRequest = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = _config.Email.OAuth2ClientId,
            ["client_secret"] = _config.Email.OAuth2ClientSecret,
            ["scope"] = scopes,
        });

        var response = await _httpClient.PostAsync(_config.Email.OAuth2TokenUrl, tokenRequest);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException(
                $"OAuth2 token request failed ({response.StatusCode}): {errorBody}");
        }

        var tokenResponse = await response.Content.ReadFromJsonAsync<OAuth2TokenResponse>();
        if (string.IsNullOrWhiteSpace(tokenResponse?.AccessToken))
            throw new InvalidOperationException("OAuth2 token response did not contain an access_token.");

        _logger.LogDebug("OAuth2 access token acquired from {TokenUrl}", _config.Email.OAuth2TokenUrl);
        return tokenResponse.AccessToken;
    }

    public Task SendToAdminsAsync(string subject, string body)
    {
        if (string.IsNullOrWhiteSpace(_config.Email.AdminRecipients))
            return Task.CompletedTask;

        var recipients = _config.Email.AdminRecipients
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return SendAsync(recipients, subject, body);
    }

    private class OAuth2TokenResponse
    {
        [JsonPropertyName("access_token")]
        public string? AccessToken { get; set; }

        [JsonPropertyName("expires_in")]
        public int? ExpiresIn { get; set; }

        [JsonPropertyName("token_type")]
        public string? TokenType { get; set; }
    }
}
