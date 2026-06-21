using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Utils;

namespace ModularCA.API.Controllers.v1.Public;

[ApiController]
[Route("api/v1/public/ca")]
[AllowAnonymous]
public class PublicCaCertController(
    ICertificateStore certStore,
    ModularCADbContext db,
    ICaServiceUrlService caServiceUrls) : ControllerBase
{
    /// <summary>
    /// Lists all enabled certificate authorities with basic info for the public portal.
    /// No authentication required — only returns non-sensitive public certificate metadata.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> ListCAs()
    {
        var cas = await db.CertificateAuthorities
            .Include(ca => ca.Certificate)
            .Where(ca => ca.IsEnabled && ca.Certificate != null
                && !(ca.Certificate.SubjectDN != null && ca.Certificate.SubjectDN.Contains("System Signing CA")))
            .AsNoTracking()
            .ToListAsync();

        var protocolConfigs = await db.CaProtocolConfigs.AsNoTracking().ToListAsync();

        var result = new List<object>();
        foreach (var ca in cas)
        {
            var label = ca.Label ?? "default";
            var resolved = await caServiceUrls.ResolveForCaAsync(ca.CertificateId!.Value);

            // Build per-CA protocol endpoint URLs, filtered by public visibility
            var protocols = protocolConfigs
                .Where(pc => pc.CaId == ca.Id && pc.IsEnabled && pc.IsPublicVisible)
                .Select(pc => new
                {
                    pc.Protocol,
                    Url = pc.Protocol switch
                    {
                        "EST" => $"/est/{label}/cacerts",
                        "SCEP" => $"/scep/{label}?operation=GetCACert",
                        "CMP" => $"/cmp/{label}",
                        "ACME" => $"/acme/{label}/directory",
                        "OCSP" => $"/ocsp/ca/{label}",
                        _ => (string?)null
                    }
                })
                .Where(p => p.Url != null)
                .ToList();

            result.Add(new
            {
                ca.Name,
                ca.Label,
                ca.Type,
                IsRoot = ca.Type == "Root",
                ca.Certificate!.SerialNumber,
                ca.Certificate.SubjectDN,
                ca.Certificate.Issuer,
                ca.Certificate.NotBefore,
                ca.Certificate.NotAfter,
                CdpUrls = resolved.CdpUrls,
                OcspUrls = resolved.OcspUrls,
                CaIssuerUrls = resolved.CaIssuerUrls,
                Protocols = protocols,
            });
        }

        return Ok(result);
    }

    /// <summary>
    /// Public CA certificate download — returns the CA certificate in DER or PEM format
    /// via standard HTTP content negotiation. Send <c>Accept: application/x-pem-file</c> for PEM.
    /// Defaults to DER (<c>application/pkix-cert</c>) per RFC 5280 AIA conventions.
    /// </summary>
    [HttpGet("{serial}")]
    public async Task<IActionResult> GetCaCert(string serial)
    {
        var cert = await certStore.GetCertificateInfoAsync(serial);
        if (cert == null || !cert.IsCA)
            return NotFound();

        // Filename sanitization routes through the shared DownloadFilenameUtil.
        var cn = DownloadFilenameUtil.ExtractCn(cert.SubjectDN) ?? serial;
        var safeName = DownloadFilenameUtil.SafeDownloadFilename(cn, fallback: "ca-cert");

        var accept = Request.Headers.Accept.ToString().ToLowerInvariant();
        if (accept.Contains("application/x-pem-file"))
        {
            if (string.IsNullOrEmpty(cert.Pem))
                return NotFound();
            var pemBytes = System.Text.Encoding.UTF8.GetBytes(cert.Pem);
            return File(pemBytes, "application/x-pem-file", $"{safeName}.pem");
        }

        // Default: DER (RFC 5280 standard for AIA distribution)
        var rawCert = await certStore.GetRawCertificateAsync(serial);
        if (rawCert == null || rawCert.Length == 0)
            return NotFound();
        return File(rawCert, "application/pkix-cert", $"{safeName}.cer");
    }
}
