namespace ModularCA.Shared.Models.Acme;

/// <summary>
/// ACME directory response containing all endpoint URLs per RFC 8555 section 7.1.1.
/// </summary>
public class AcmeDirectoryResponse
{
    public string NewNonce { get; set; } = string.Empty;
    public string NewAccount { get; set; } = string.Empty;
    public string NewOrder { get; set; } = string.Empty;
    public string RevokeCert { get; set; } = string.Empty;
    public string KeyChange { get; set; } = string.Empty;

    /// <summary>
    /// Optional metadata about the ACME server, including whether external account binding is required.
    /// </summary>
    public AcmeDirectoryMeta? Meta { get; set; }
}

/// <summary>
/// Metadata object for the ACME directory response per RFC 8555 section 7.1.1.
/// </summary>
public class AcmeDirectoryMeta
{
    /// <summary>
    /// Indicates that the server requires external account binding for new account registrations.
    /// </summary>
    public bool? ExternalAccountRequired { get; set; }
}
