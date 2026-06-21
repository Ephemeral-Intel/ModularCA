namespace ModularCA.Shared.Models;

public class CertificateExportOptions
{
    public string Format { get; set; } = "pem"; // "pem", "pfx", "der"
    public bool IncludePrivateKey { get; set; } = false;
    public string? FriendlyName { get; set; } = null;
    public string? Password { get; set; } = null;
    public IEnumerable<Org.BouncyCastle.X509.X509Certificate>? Chain { get; set; } = null;
}
