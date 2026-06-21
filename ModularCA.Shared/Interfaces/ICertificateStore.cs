using ModularCA.Shared.Models;

namespace ModularCA.Shared.Interfaces;

/// <summary>
/// Persistent storage for issued certificates and their metadata.
/// </summary>
public interface ICertificateStore
{
    /// <summary>
    /// Saves a certificate and its metadata, optionally including an encrypted private key.
    /// </summary>
    Task SaveCertificateAsync(byte[] certificateBytes, CertificateInfoModel info, byte[]? encryptedPrivateKey = null);
    /// <summary>
    /// Retrieves certificate info by serial number.
    /// </summary>
    Task<CertificateInfoModel?> GetCertificateInfoAsync(string serialNumber);

    /// <summary>
    /// Lists all stored certificates.
    /// </summary>
    Task<IEnumerable<CertificateInfoModel>> ListAsync();

    /// <summary>
    /// Returns all certificates with full metadata.
    /// </summary>
    Task<List<CertificateInfoModel>> GetAllCertificatesAsync();

    /// <summary>
    /// Retrieves a certificate by its GUID.
    /// </summary>
    Task<CertificateInfoModel?> GetCertificateByIdAsync(Guid id);

    /// <summary>
    /// Retrieves a certificate by its serial number.
    /// </summary>
    Task<CertificateInfoModel?> GetCertificateBySerialNumberAsync(string serialNumber);

    /// <summary>
    /// Gets the raw DER-encoded certificate bytes by serial number.
    /// </summary>
    Task<byte[]?> GetRawCertificateAsync(string serialNumber);

}
