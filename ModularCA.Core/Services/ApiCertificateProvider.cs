using System.Security.Cryptography.X509Certificates;

namespace ModularCA.Core.Services;

/// <summary>
/// Thread-safe holder for the management UI / API server's Web TLS certificate,
/// allowing runtime replacement (e.g., during scheduled renewal). The class name is
/// retained as <c>ApiCertificateProvider</c> for binary compatibility with existing
/// DI registrations across the codebase.
/// </summary>
public class ApiCertificateProvider
{
    private X509Certificate2? _certificate;
    private readonly object _lock = new();

    public X509Certificate2? GetCertificate()
    {
        lock (_lock) { return _certificate; }
    }

    public void SetCertificate(X509Certificate2 cert)
    {
        lock (_lock) { _certificate = cert; }
    }
}
