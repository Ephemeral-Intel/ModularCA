using Org.BouncyCastle.OpenSsl;
using Org.BouncyCastle.X509;

namespace ModularCA.Shared.Utils;

/// <summary>
/// Loads X.509 certificates from a PEM-encoded trust store file.
/// </summary>
public static class TrustStoreLoader
{
    /// <summary>
    /// Reads all X.509 certificates from the PEM file at the specified path.
    /// </summary>
    public static IList<X509Certificate> LoadTrustStore(string path)
    {
        var certs = new List<X509Certificate>();

        using var reader = File.OpenText(path);
        var pemReader = new PemReader(reader);

        object? obj;
        while ((obj = pemReader.ReadObject()) != null)
        {
            if (obj is X509Certificate cert)
            {
                certs.Add(cert);
            }
        }

        return certs;
    }
}
