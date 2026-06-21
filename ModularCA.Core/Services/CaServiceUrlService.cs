using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models;

namespace ModularCA.Core.Services;

/// <summary>
/// Database-backed service for managing per-CA public base URLs and computing the resulting
/// CDP, OCSP, and AIA URLs at cert-build time. The data model only stores the base URL — the
/// three endpoint URLs are always derived as <c>{base}/crl/{label}</c>, <c>{base}/ocsp</c>, and
/// <c>{base}/ca/{label}</c> by appending the standard short-URL paths from
/// <c>PublicShortUrlController</c>.
/// </summary>
public class CaServiceUrlService(ModularCADbContext db) : ICaServiceUrlService
{
    private readonly ModularCADbContext _db = db;

    /// <inheritdoc />
    public async Task<CaServiceUrlEntity?> GetByCaCertificateIdAsync(Guid caCertificateId)
    {
        return await _db.CaServiceUrls
            .FirstOrDefaultAsync(s => s.CaCertificateId == caCertificateId);
    }

    /// <inheritdoc />
    public async Task<List<CaServiceUrlEntity>> GetAllAsync()
    {
        return await _db.CaServiceUrls
            .Include(s => s.CaCertificate)
            .ToListAsync();
    }

    /// <inheritdoc />
    public async Task<CaServiceUrlEntity> CreateOrUpdateAsync(
        Guid caCertificateId,
        string? publicBaseUrl)
    {
        var existing = await _db.CaServiceUrls
            .FirstOrDefaultAsync(s => s.CaCertificateId == caCertificateId);

        var normalizedBase = string.IsNullOrWhiteSpace(publicBaseUrl)
            ? null
            : publicBaseUrl.TrimEnd('/');

        if (existing != null)
        {
            existing.PublicBaseUrl = normalizedBase;
            existing.UpdatedAt = DateTime.UtcNow;
            _db.CaServiceUrls.Update(existing);
        }
        else
        {
            existing = new CaServiceUrlEntity
            {
                CaCertificateId = caCertificateId,
                PublicBaseUrl = normalizedBase,
            };
            _db.CaServiceUrls.Add(existing);
        }

        await _db.SaveChangesAsync();
        return existing;
    }

    /// <inheritdoc />
    public async Task<ResolvedCaServiceUrls> ResolveForCaAsync(Guid caCertificateId)
    {
        var entity = await _db.CaServiceUrls
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.CaCertificateId == caCertificateId);
        if (entity == null || string.IsNullOrWhiteSpace(entity.PublicBaseUrl))
            return new ResolvedCaServiceUrls(new List<string>(), new List<string>(), new List<string>());

        var baseUrl = entity.PublicBaseUrl.TrimEnd('/');

        // The CA's label is the preferred path segment for /crl/ and /ca/ since
        // PublicShortUrlController.ResolveCaCertAsync accepts both label and serial. Label is
        // human-readable and stable across reissue. Fall back to the certificate serial only if
        // the label is missing for some reason (shouldn't happen for a properly bootstrapped CA).
        var caLabel = await _db.CertificateAuthorities
            .AsNoTracking()
            .Where(ca => ca.CertificateId == caCertificateId)
            .Select(ca => ca.Label)
            .FirstOrDefaultAsync();
        var caSerial = await _db.Certificates
            .AsNoTracking()
            .Where(c => c.CertificateId == caCertificateId)
            .Select(c => c.SerialNumber)
            .FirstOrDefaultAsync();

        var identifier = !string.IsNullOrEmpty(caLabel) ? caLabel : caSerial;
        if (string.IsNullOrEmpty(identifier))
            return new ResolvedCaServiceUrls(new List<string>(), new List<string>(), new List<string>());

        return new ResolvedCaServiceUrls(
            CdpUrls: new List<string> { $"{baseUrl}/crl/{identifier}" },
            OcspUrls: new List<string> { $"{baseUrl}/ocsp" },
            CaIssuerUrls: new List<string> { $"{baseUrl}/ca/{identifier}" });
    }

    /// <inheritdoc />
    public async Task<bool> DeleteAsync(Guid caCertificateId)
    {
        var existing = await _db.CaServiceUrls
            .FirstOrDefaultAsync(s => s.CaCertificateId == caCertificateId);

        if (existing == null)
            return false;

        _db.CaServiceUrls.Remove(existing);
        await _db.SaveChangesAsync();
        return true;
    }
}
