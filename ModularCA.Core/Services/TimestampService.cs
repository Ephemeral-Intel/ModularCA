using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ModularCA.Database;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Utils;
using Org.BouncyCastle.Crypto;
using Org.BouncyCastle.Math;
using Org.BouncyCastle.Security;
using Org.BouncyCastle.Tsp;
using Org.BouncyCastle.Utilities;
using Org.BouncyCastle.X509;
using System.Security.Cryptography;

namespace ModularCA.Core.Services;

/// <summary>
/// RFC 3161-compliant timestamping service that signs timestamp requests using a dedicated TSA certificate.
/// </summary>
public class TimestampService : ITimestampService
{
    private readonly ModularCADbContext _db;
    private readonly IKeystoreCertificates _keystore;
    private readonly ILogger<TimestampService> _logger;

    private static readonly HashSet<string> AcceptedAlgorithms = new()
    {
        TspAlgorithms.Sha256,
        TspAlgorithms.Sha384,
        TspAlgorithms.Sha512,
        TspAlgorithms.Sha1,
    };

    private static readonly string TsaPolicyOid = "1.2.3.4.1";

    public TimestampService(ModularCADbContext db, IKeystoreCertificates keystore, ILogger<TimestampService> logger)
    {
        _db = db;
        _keystore = keystore;
        _logger = logger;
    }

    public async Task<byte[]> ProcessTimestampRequestAsync(byte[] tsqBytes, string? caLabel = null)
    {
        TimeStampRequest tsRequest;
        try
        {
            tsRequest = new TimeStampRequest(tsqBytes);
        }
        catch (Exception)
        {
            return BuildRejection("Invalid timestamp request encoding");
        }

        var hashAlgOid = tsRequest.MessageImprintAlgOid;
        if (!AcceptedAlgorithms.Contains(hashAlgOid))
        {
            return BuildRejection($"Hash algorithm {hashAlgOid} not supported");
        }

        var (tsaCert, tsaPrivKey) = await ResolveTsaSignerAsync(caLabel);
        if (tsaCert == null || tsaPrivKey == null)
        {
            return BuildRejection("No TSA signer available");
        }

        try
        {
            // Generate 128-bit random serial number (CA/BF BR §7.1 requires ≥64 bits from CSPRNG)
            var serialBytes = new byte[16];
            RandomNumberGenerator.Fill(serialBytes);
            serialBytes[0] &= 0x7F; // Ensure positive (MSB = 0)
            var serialNumber = new BigInteger(1, serialBytes);

            var digestOid = CertificateUtil.GetDigestOidFromSigAlg(tsaCert.SigAlgName);
            var tokenGen = new TimeStampTokenGenerator(
                tsaPrivKey,
                tsaCert,
                digestOid,
                TsaPolicyOid);

            var respGen = new TimeStampResponseGenerator(tokenGen, TspAlgorithms.Allowed);
            var tsResponse = respGen.Generate(tsRequest, serialNumber, DateTime.UtcNow);

            _logger.LogInformation("TSA: timestamp token generated (serial={Serial}, hashAlg={HashAlg})",
                serialNumber.ToString(16), hashAlgOid);

            return tsResponse.GetEncoded();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TSA: failed to generate timestamp token");
            return BuildRejection("Internal TSA error");
        }
    }

    private async Task<(X509Certificate? cert, AsymmetricKeyParameter? privKey)> ResolveTsaSignerAsync(string? caLabel)
    {
        var caEntity = caLabel != null
            ? await _db.CertificateAuthorities.FirstOrDefaultAsync(ca => ca.Label == caLabel && ca.IsEnabled)
            : await _db.CertificateAuthorities.FirstOrDefaultAsync(ca => ca.IsDefault && ca.IsEnabled);

        if (caEntity == null) return (null, null);

        // Use dedicated TSA signer cert if available (has critical id-kp-timeStamping EKU per RFC 3161)
        if (caEntity.TsaCertificateId != null)
        {
            var tsaCertEntity = await _db.Certificates.FindAsync(caEntity.TsaCertificateId);
            if (tsaCertEntity != null)
            {
                var tsaCert = CertificateUtil.ParseFromPem(tsaCertEntity.Pem);
                var tsaKeyHandle = _keystore.GetPrivateKeyFor(tsaCert);
                if (tsaKeyHandle != null)
                {
                    if (!tsaKeyHandle.CanExport)
                    {
                        // TODO: Phase 2 PKCS#11 — TimeStampTokenGenerator needs raw key;
                        // wrap with custom CMS builder when HSM support is added
                        _logger.LogWarning("TSA: HSM-backed TSA keys not yet supported for timestamping");
                        return (null, null);
                    }
                    // Zero the DER transport buffer immediately after BC decodes it.
                    // The returned tsaPrivKey still holds the scalar via BC internals; the caller
                    // retains it only for the duration of TimeStampTokenGenerator use.
                    var tsaDer = tsaKeyHandle.ExportPrivateKeyDer();
                    AsymmetricKeyParameter tsaPrivKey;
                    try
                    {
                        tsaPrivKey = PrivateKeyFactory.CreateKey(tsaDer);
                    }
                    finally
                    {
                        if (tsaDer != null)
                            System.Security.Cryptography.CryptographicOperations.ZeroMemory(tsaDer);
                    }
                    return (tsaCert, tsaPrivKey);
                }
                _logger.LogWarning("TSA: dedicated TSA cert found but private key not available in keystore");
            }
        }

        _logger.LogWarning("TSA: no dedicated TSA signer certificate configured. " +
            "Re-run bootstrap to generate one, or issue a cert with critical id-kp-timeStamping EKU.");
        return (null, null);
    }

    private static byte[] BuildRejection(string statusString)
    {
        try
        {
            var respGen = new TimeStampResponseGenerator(null, TspAlgorithms.Allowed);
            var resp = respGen.GenerateFailResponse(
                Org.BouncyCastle.Asn1.Cmp.PkiStatus.Rejection,
                Org.BouncyCastle.Asn1.Cmp.PkiFailureInfo.SystemFailure,
                statusString);
            return resp.GetEncoded();
        }
        catch
        {
            return Array.Empty<byte>();
        }
    }

}
