using ModularCA.Shared.Utils;
using Org.BouncyCastle.X509;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Provides access to trusted CA certificates for chain validation.
/// </summary>
public interface ITrustStoreProvider
{
    /// <summary>
    /// Returns the list of currently trusted certificates.
    /// </summary>
    IReadOnlyList<X509Certificate> GetTrustedCertificates();

    /// <summary>
    /// Loads trusted certificates from a PEM file, replacing any previously loaded certificates.
    /// </summary>
    void LoadFromFile(string path);
}

/// <summary>
/// In-memory implementation of the trust store backed by a list of X.509 certificates.
/// </summary>
public class InMemoryTrustStore : ITrustStoreProvider
{
    private readonly List<X509Certificate> _trustedCerts = new();

    /// <summary>
    /// Returns the list of currently trusted certificates.
    /// </summary>
    public IReadOnlyList<X509Certificate> GetTrustedCertificates() => _trustedCerts.AsReadOnly();

    /// <summary>
    /// Loads trusted certificates from a PEM file, replacing any previously loaded certificates.
    /// </summary>
    public void LoadFromFile(string path)
    {
        _trustedCerts.Clear();
        var loaded = TrustStoreLoader.LoadTrustStore(path);
        _trustedCerts.AddRange(loaded);
    }
}
