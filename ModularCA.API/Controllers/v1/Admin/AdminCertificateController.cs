using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using ModularCA.API.Controllers.v1.Auth;
using ModularCA.Auth.Authorization;
using ModularCA.Auth.Interfaces;
using ModularCA.Core.Services;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using Serilog;
using ModularCA.Shared.Authorization;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models;
using ModularCA.Shared.Utils;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.X509;
using System.Text.Json;

namespace ModularCA.API.Controllers.v1.Admin;
/// <summary>
/// Admin endpoints for managing certificates including listing, export, and download.
/// </summary>
[ApiController]
[Route("api/v1/admin/certificates")]
[Authorize(Policy = "CaAuditor")]
public class AdminCertificateController(
    ICertificateStore certStore,
    ICurrentUserService currentUser,
    ICertificateAccessEvaluator certificateAccessEvaluator,
    ICertificateExportService exportService,
    ModularCADbContext dbContext,
    IDistributedCache cache,
    ISecurityAlertService alertService,
    ICertHealthScoreService healthScoreService,
    IAuditService auditService,
    ICaGroupAuthorizationService groupAuth
) : ControllerBase
{
    private readonly ICertificateStore _certStore = certStore;
    private readonly ICurrentUserService _currentUser = currentUser;
    private readonly ICertificateAccessEvaluator _certificateAccessEvaluator = certificateAccessEvaluator;
    private readonly ModularCADbContext _dbContext = dbContext;
    private readonly IDistributedCache _cache = cache;
    private readonly ISecurityAlertService _alertService = alertService;
    private readonly ICertHealthScoreService _healthScoreService = healthScoreService;
    private readonly IAuditService _audit = auditService;
    private readonly ICaGroupAuthorizationService _groupAuth = groupAuth;

    /// <summary>
    /// Lists certificates with server-side filtering and pagination.
    /// Excludes CA certificates. System signing certificates are visible to authorized admins.
    /// Supports filtering by subject, serial number, issuer, status, key algorithm, and date ranges.
    /// Returns a paginated result with total count information.
    /// </summary>
    /// <param name="subject">Partial match filter on the certificate Subject DN.</param>
    /// <param name="serial">Partial match filter on the certificate serial number.</param>
    /// <param name="issuer">Partial match filter on the certificate issuer.</param>
    /// <param name="status">Status filter: "active" (not revoked and not expired), "revoked", or "expired".</param>
    /// <param name="keyAlgorithm">Filter on key algorithm by searching the KeyUsagesJson column (e.g. "RSA", "ECDSA", "Ed25519").</param>
    /// <param name="san">Partial match filter on subject alternative names JSON.</param>
    /// <param name="notAfterFrom">Minimum value for the NotAfter (expiry) date.</param>
    /// <param name="notAfterTo">Maximum value for the NotAfter (expiry) date.</param>
    /// <param name="issuedFrom">Minimum value for the NotBefore (issued) date.</param>
    /// <param name="issuedTo">Maximum value for the NotBefore (issued) date.</param>
    /// <param name="page">Page number (1-based). Defaults to 1.</param>
    /// <param name="pageSize">Number of items per page. Defaults to 25, clamped to 1-100.</param>
    /// <returns>A paginated result containing matching certificates and total count metadata.</returns>
    [HttpGet]
    [ProducesResponseType(200)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> ListCertificates(
        [FromQuery] string? subject,
        [FromQuery] string? serial,
        [FromQuery] string? issuer,
        [FromQuery] string? status,
        [FromQuery] string? keyAlgorithm,
        [FromQuery] string? san,
        [FromQuery] DateTime? notAfterFrom,
        [FromQuery] DateTime? notAfterTo,
        [FromQuery] DateTime? issuedFrom,
        [FromQuery] DateTime? issuedTo,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        // Clamp pagination parameters
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 1;
        if (pageSize > 100) pageSize = 100;

        // Push the access-control filter into the database query so
        // pagination returns exactly pageSize results (previous code applied Skip/Take first
        // and then filtered in memory, producing short or empty pages and a mismatched
        // `total`). We materialise the user's allowed CAs and explicit ACL grants once, then
        // apply them as Where predicates on the IQueryable.
        var userId = _currentUser.User.Id;

        // System-level cert.view — full visibility, no per-CA restriction.
        // Uses the authorization service which checks all four grant sources (direct group
        // grants, group role assignments, direct user grants, user role assignments).
        var hasSystemAccess = await _groupAuth.HasSystemCapabilityAsync(userId, Capabilities.CertView);

        HashSet<Guid>? allowedCaIds = null;
        HashSet<Guid>? explicitAclCertIds = null;
        if (!hasSystemAccess)
        {
            var caIdList = await _groupAuth.GetAccessibleCaIdsAsync(userId, Capabilities.CertView);
            allowedCaIds = new HashSet<Guid>(caIdList);

            var aclCertIds = await _dbContext.CertificateAccessLists
                .Where(a => a.UserId == userId && a.AccessLevel >= CertificateAccessLevel.View)
                .Select(a => a.CertificateId)
                .ToListAsync();
            explicitAclCertIds = new HashSet<Guid>(aclCertIds);
        }

        // Build IQueryable filter chain against the database
        var query = _dbContext.Certificates
            .AsNoTracking()
            .Where(c => !c.IsCA);

        if (!hasSystemAccess)
        {
            var allowedCaIdList = allowedCaIds!.ToList();
            var aclCertIdList = explicitAclCertIds!.ToList();

            // Resolve the CertificateId values for the allowed CAs so we can match
            // via the signing profile's IssuerId (which points at the CA's cert row).
            var allowedCaCertIds = await _dbContext.CertificateAuthorities
                .Where(ca => allowedCaIdList.Contains(ca.Id) && ca.CertificateId != null)
                .Select(ca => ca.CertificateId!.Value)
                .ToListAsync();

            // A certificate is visible if:
            //   (a) it was signed by a CA the user has cert.view access to
            //       (signing profile's IssuerId matches one of the allowed CA cert IDs), OR
            //   (b) the user is the requestor of the request that produced it, OR
            //   (c) the user has an explicit ACL grant at View level or higher.
            query = query.Where(c =>
                (c.SigningProfileId != null && _dbContext.SigningProfiles
                    .Any(sp => sp.Id == c.SigningProfileId && sp.IssuerId != null && allowedCaCertIds.Contains(sp.IssuerId.Value)))
                || _dbContext.CertificateRequests.Any(r => r.IssuedCertificateId == c.CertificateId && r.RequestorUserId == userId)
                || aclCertIdList.Contains(c.CertificateId));
        }

        // Subject filter
        if (!string.IsNullOrWhiteSpace(subject))
            query = query.Where(c => c.SubjectDN.Contains(subject));

        // Serial number filter
        if (!string.IsNullOrWhiteSpace(serial))
            query = query.Where(c => c.SerialNumber.Contains(serial));

        // Issuer filter
        if (!string.IsNullOrWhiteSpace(issuer))
            query = query.Where(c => c.Issuer.Contains(issuer));

        // Status filter
        if (!string.IsNullOrWhiteSpace(status))
        {
            var now = DateTime.UtcNow;
            switch (status.ToLowerInvariant())
            {
                case "active":
                    query = query.Where(c => !c.Revoked && c.NotAfter >= now);
                    break;
                case "revoked":
                    query = query.Where(c => c.Revoked);
                    break;
                case "expired":
                    query = query.Where(c => c.NotAfter < now);
                    break;
            }
        }

        // Key algorithm filter (searches the KeyUsagesJson or SubjectDN for algorithm hints)
        if (!string.IsNullOrWhiteSpace(keyAlgorithm))
            query = query.Where(c => c.KeyUsagesJson.Contains(keyAlgorithm));

        // Subject alternative name filter
        if (!string.IsNullOrWhiteSpace(san))
            query = query.Where(c => c.SubjectAlternativeNamesJson.Contains(san));

        // Date range filters on NotAfter (expiry)
        if (notAfterFrom.HasValue)
            query = query.Where(c => c.NotAfter >= notAfterFrom.Value);
        if (notAfterTo.HasValue)
            query = query.Where(c => c.NotAfter <= notAfterTo.Value);

        // Date range filters on NotBefore (issued date)
        if (issuedFrom.HasValue)
            query = query.Where(c => c.NotBefore >= issuedFrom.Value);
        if (issuedTo.HasValue)
            query = query.Where(c => c.NotBefore <= issuedTo.Value);

        // Get total count before pagination
        var total = await query.CountAsync();

        // Apply ordering and pagination
        var entities = await query
            .OrderByDescending(c => c.NotBefore)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Access control already applied by the IQueryable predicates above,
        // so we just map every page row. No more in-memory filtering after Skip/Take.
        var allowedItems = new List<CertificateInfoModel>();

        foreach (var c in entities)
        {
            // Extract key algorithm and size from the raw certificate
            var certKeyAlgo = string.Empty;
            var certKeySize = string.Empty;
            var certSigAlgo = string.Empty;
            if (c.RawCertificate != null && c.RawCertificate.Length > 0)
            {
                try
                {
                    var bcCert = new X509CertificateParser().ReadCertificate(c.RawCertificate);
                    var pubKey = bcCert.GetPublicKey();
                    if (pubKey is RsaKeyParameters rsa) { certKeyAlgo = "RSA"; certKeySize = rsa.Modulus.BitLength.ToString(); }
                    else if (pubKey is ECPublicKeyParameters ec) { certKeyAlgo = "ECDSA"; certKeySize = ec.Parameters.Curve.FieldSize.ToString(); }
                    else if (pubKey is Ed25519PublicKeyParameters) { certKeyAlgo = "Ed25519"; certKeySize = "256"; }
                    else if (pubKey is Ed448PublicKeyParameters) { certKeyAlgo = "Ed448"; certKeySize = "456"; }
                    certSigAlgo = bcCert.SigAlgName;
                }
                catch { /* parsing failed */ }
            }

            allowedItems.Add(new CertificateInfoModel
            {
                CertificateId = c.CertificateId,
                SerialNumber = c.SerialNumber,
                SubjectDN = c.SubjectDN,
                Issuer = c.Issuer,
                NotBefore = c.NotBefore,
                NotAfter = c.NotAfter,
                Thumbprints = c.Thumbprints,
                IsCA = c.IsCA,


                Revoked = c.Revoked,
                RevocationReason = c.RevocationReason ?? string.Empty,
                RevocationDate = c.RevocationDate,
                SigningProfileId = c.SigningProfileId ?? Guid.Empty,
                KeyAlgorithm = certKeyAlgo,
                KeySize = certKeySize,
                SignatureAlgorithm = certSigAlgo,
                SubjectAlternativeNames = string.IsNullOrWhiteSpace(c.SubjectAlternativeNamesJson)
                    ? new List<string>()
                    : JsonSerializer.Deserialize<List<string>>(c.SubjectAlternativeNamesJson)!,
                KeyUsages = string.IsNullOrWhiteSpace(c.KeyUsagesJson)
                    ? new List<string>()
                    : JsonSerializer.Deserialize<List<string>>(c.KeyUsagesJson)!,
                ExtendedKeyUsages = string.IsNullOrWhiteSpace(c.ExtendedKeyUsagesJson)
                    ? new List<string>()
                    : JsonSerializer.Deserialize<List<string>>(c.ExtendedKeyUsagesJson)!,
            });
        }

        var totalPages = (int)Math.Ceiling((double)total / pageSize);

        return Ok(new
        {
            total,
            totalPages,
            page,
            pageSize,
            items = allowedItems
        });
    }

    /// <summary>
    /// Retrieves detailed certificate information by serial number.
    /// </summary>
    /// <param name="serial">The serial number of the certificate to retrieve.</param>
    /// <returns>The certificate details if found and accessible, otherwise 404.</returns>
    [HttpGet("{serial}")]
    public async Task<ActionResult<CertificateInfoModel>> GetCertificateInfo(string serial)
    {

        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();
        var cert = await _certStore.GetCertificateInfoAsync(serial);
        if (cert == null)
            return NotFound();
        // check certificate access permissions
        var isAllowed = _certificateAccessEvaluator.CanViewCertificate(_currentUser.User.Id, cert.CertificateId);
        if (!isAllowed)
            return NotFound();

        return Ok(cert);
    }

    /// <summary>
    /// Downloads a certificate file by serial number in PEM or DER format based on the Accept header.
    /// </summary>
    /// <param name="serial">The serial number of the certificate to download.</param>
    /// <returns>The certificate file in the requested format.</returns>
    [HttpGet("{serial}/file")]
    public async Task<IActionResult> GetCertificate(string serial)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();
        var raw = await _certStore.GetCertificateInfoAsync(serial);
        // Hide CA certs from certificate download
        if (raw == null || raw.IsCA)
            return NotFound();

        var isAllowed = _certificateAccessEvaluator.CanViewCertificate(_currentUser.User.Id, raw.CertificateId);
        if (!isAllowed)
            return NotFound();
        var accept = Request.Headers.Accept.ToString().ToLowerInvariant();
        var certName = CertificateUtil.ParseCnFromPem(raw.Pem);

        if (accept.Contains("application/x-pem-file"))
        {
            var pemBytes = System.Text.Encoding.UTF8.GetBytes(raw.Pem);
            return File(pemBytes, "application/x-pem-file", $"{certName}.pem");
        }

        // Default: DER
        var cert = CertificateUtil.ParseFromPem(raw.Pem);
        return File(cert.GetEncoded(), "application/pkix-cert", $"{certName}.cer");
    }

    /// <summary>
    /// Exports a certificate in PEM-with-key format by serial number.
    /// PFX export is not supported on the admin backend; use the User Portal for PFX.
    /// Requires CaOperator authorization policy.
    /// Requires step-up MFA verification.
    /// </summary>
    /// <param name="serial">The serial number of the certificate to export.</param>
    /// <param name="request">Export options including format (only 'pem-key' is supported).</param>
    /// <param name="mfaToken">Step-up MFA token from the X-MFA-Token header.</param>
    /// <returns>The exported certificate file.</returns>
    [HttpPost("{serial}/export")]
    [Authorize(Policy = "CaOperator")]
    public async Task<IActionResult> ExportCertificate(string serial, [FromBody] CertExportRequest request, [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();
        if (_currentUser.User == null) return Unauthorized();
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, StepUpOps.ExportCert, serial))
            return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

        if (string.Equals(request.Format, "pem-key", StringComparison.OrdinalIgnoreCase))
        {
            var pem = await exportService.ExportPemWithKeyAsync(serial);
            if (pem == null)
                return NotFound(new { error = "Certificate not found or private key not available" });

            _ = _alertService.RaiseAlertAsync("PrivateKeyExported", AlertSeverity.Critical, $"Private key exported (PEM) for certificate {serial} by {_currentUser.User?.Username}", new { serial, Format = "pem-key" });

            // Audit log the PEM-key export
            await _audit.LogAsync(
                AuditActionType.CertificateExported,
                _currentUser.User?.Id,
                _currentUser.User?.Username,
                "Certificate", serial,
                new { Format = "pem-key" },
                HttpContext.Connection.RemoteIpAddress?.ToString());

            return File(System.Text.Encoding.UTF8.GetBytes(pem), "application/x-pem-file", $"{serial}.pem");
        }
        else
        {
            return BadRequest(new { error = "Unsupported format. Use 'pem-key'. PFX export is available via the User Portal." });
        }
    }

    /// <summary>
    /// Initiates renewal of an existing certificate by creating a new CSR request
    /// pre-filled with the same subject, SANs, cert profile, and signing profile.
    /// Requires CaOperator authorization and verifies certificate access ownership.
    /// </summary>
    /// <param name="serial">The serial number of the certificate to renew.</param>
    /// <returns>The new request ID for tracking the renewal.</returns>
    [HttpPost("{serial}/renew")]
    [Authorize(Policy = "CaOperator")]
    public async Task<IActionResult> RenewCertificate(string serial)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        // Load certificate info
        var certInfo = await _certStore.GetCertificateInfoAsync(serial);
        if (certInfo == null)
            return NotFound(new { error = "Certificate not found." });

        // Verify the caller has access to this certificate
        if (!_certificateAccessEvaluator.CanViewCertificate(_currentUser.User.Id, certInfo.CertificateId))
            return NotFound(new { error = "Certificate not found." });

        // Verify the certificate is not revoked
        if (certInfo.Revoked)
            return BadRequest(new { error = "Cannot renew a revoked certificate." });

        // Load the certificate entity to get profile IDs
        var certEntity = await _dbContext.Certificates
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (certEntity == null)
            return NotFound(new { error = "Certificate not found." });

        // Load the original CSR request that produced this certificate
        var originalRequest = await _dbContext.CertificateRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.IssuedCertificateId == certEntity.CertificateId);

        // Use subject and SANs from the certificate itself (may have overrides from the original CSR)
        var subjectDn = certEntity.SubjectDN;
        var sanJson = certEntity.SubjectAlternativeNamesJson;

        // Get profile IDs from the certificate entity; fall back to the original request if needed
        var certProfileId = certEntity.CertProfileId
            ?? originalRequest?.CertProfileId;
        var signingProfileId = certEntity.SigningProfileId
            ?? originalRequest?.SigningProfileId;

        if (certProfileId == null || signingProfileId == null)
            return BadRequest(new { error = "Cannot determine certificate or signing profile for renewal." });

        // Carry forward key parameters from the original request when available
        var keyAlgorithm = originalRequest?.KeyAlgorithm ?? string.Empty;
        var keySize = originalRequest?.KeySize ?? string.Empty;
        var signatureAlgorithm = originalRequest?.SignatureAlgorithm ?? string.Empty;

        // Create the renewal CSR request entity
        var renewalRequest = new CertRequestEntity
        {
            Subject = subjectDn,
            SubjectAlternativeNames = sanJson,
            CSR = originalRequest?.CSR ?? string.Empty,
            KeyAlgorithm = keyAlgorithm,
            KeySize = keySize,
            SignatureAlgorithm = signatureAlgorithm,
            SubmittedAt = DateTime.UtcNow,
            Status = "Pending",
            CertProfileId = certProfileId.Value,
            SigningProfileId = signingProfileId.Value,
            RequestorUserId = _currentUser.User.Id,
            RenewalOfCertificateId = certEntity.CertificateId,
            EncryptedPrivateKey = originalRequest?.EncryptedPrivateKey,
            EncryptedAesForPrivateKey = originalRequest?.EncryptedAesForPrivateKey,
            AesKeyEncryptionIv = originalRequest?.AesKeyEncryptionIv,
            EncryptionCertSerialNumber = originalRequest?.EncryptionCertSerialNumber
        };

        _dbContext.CertificateRequests.Add(renewalRequest);
        await _dbContext.SaveChangesAsync();

        await _audit.LogAsync(
            AuditActionType.CertificateRenewalInitiated,
            _currentUser.User?.Id,
            _currentUser.User?.Username,
            "Certificate", serial,
            new
            {
                NewRequestId = renewalRequest.Id,
                OriginalCertificateId = certEntity.CertificateId,
                SubjectDN = subjectDn,
                CertProfileId = certProfileId,
                SigningProfileId = signingProfileId
            },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { requestId = renewalRequest.Id, message = "Renewal request submitted" });
    }

    /// <summary>
    /// Lists all key-value tags associated with a certificate.
    /// </summary>
    /// <param name="serial">The serial number of the certificate.</param>
    /// <returns>A list of tags for the certificate.</returns>
    [HttpGet("{serial}/tags")]
    public async Task<IActionResult> GetCertificateTags(string serial)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        var cert = await _dbContext.Certificates
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert == null)
            return NotFound(new { error = "Certificate not found." });

        if (!_certificateAccessEvaluator.CanViewCertificate(_currentUser.User.Id, cert.CertificateId))
            return NotFound(new { error = "Certificate not found." });

        var tags = await _dbContext.CertificateTags
            .AsNoTracking()
            .Where(t => t.CertificateId == cert.CertificateId)
            .OrderBy(t => t.Key)
            .ThenBy(t => t.Value)
            .Select(t => new
            {
                t.Id,
                t.Key,
                t.Value,
                t.CreatedAt
            })
            .ToListAsync();

        return Ok(tags);
    }

    /// <summary>
    /// Adds a key-value tag to a certificate.
    /// The combination of certificate and tag key must be unique.
    /// </summary>
    /// <param name="serial">The serial number of the certificate.</param>
    /// <param name="request">The tag key and value to add.</param>
    /// <returns>The created tag.</returns>
    [HttpPost("{serial}/tags")]
    [Authorize(Policy = "CaOperator")]
    public async Task<IActionResult> AddCertificateTag(string serial, [FromBody] CertificateTagRequest request)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Key) || string.IsNullOrWhiteSpace(request.Value))
            return BadRequest(new { error = "Both key and value are required." });

        if (request.Key.Length > 100)
            return BadRequest(new { error = "Tag key must not exceed 100 characters." });
        if (request.Value.Length > 500)
            return BadRequest(new { error = "Tag value must not exceed 500 characters." });

        var cert = await _dbContext.Certificates
            .FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert == null)
            return NotFound(new { error = "Certificate not found." });

        // Check for duplicate key on this certificate
        var exists = await _dbContext.CertificateTags
            .AnyAsync(t => t.CertificateId == cert.CertificateId && t.Key == request.Key);
        if (exists)
            return Conflict(new { error = $"Tag with key '{request.Key}' already exists on this certificate." });

        var tag = new CertificateTagEntity
        {
            CertificateId = cert.CertificateId,
            Key = request.Key.Trim(),
            Value = request.Value.Trim()
        };

        _dbContext.CertificateTags.Add(tag);
        await _dbContext.SaveChangesAsync();

        return Created($"api/v1/admin/certificates/{serial}/tags", new
        {
            tag.Id,
            tag.Key,
            tag.Value,
            tag.CreatedAt
        });
    }

    /// <summary>
    /// Removes a tag from a certificate by tag ID.
    /// </summary>
    /// <param name="serial">The serial number of the certificate.</param>
    /// <param name="tagId">The unique identifier of the tag to remove.</param>
    /// <returns>No content on success.</returns>
    [HttpDelete("{serial}/tags/{tagId}")]
    [Authorize(Policy = "CaOperator")]
    public async Task<IActionResult> RemoveCertificateTag(string serial, Guid tagId)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        var cert = await _dbContext.Certificates
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert == null)
            return NotFound(new { error = "Certificate not found." });

        var tag = await _dbContext.CertificateTags
            .FirstOrDefaultAsync(t => t.Id == tagId && t.CertificateId == cert.CertificateId);
        if (tag == null)
            return NotFound(new { error = "Tag not found." });

        _dbContext.CertificateTags.Remove(tag);
        await _dbContext.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Searches for certificates matching a specific tag key and/or value.
    /// Both parameters are optional but at least one must be provided.
    /// </summary>
    /// <param name="key">The tag key to filter on (exact match).</param>
    /// <param name="value">The tag value to filter on (partial match).</param>
    /// <param name="page">Page number (1-based). Defaults to 1.</param>
    /// <param name="pageSize">Number of items per page. Defaults to 25, clamped to 1-100.</param>
    /// <returns>A paginated list of certificates matching the tag criteria.</returns>
    [HttpGet("tags/search")]
    public async Task<IActionResult> SearchCertificatesByTag(
        [FromQuery] string? key,
        [FromQuery] string? value,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(key) && string.IsNullOrWhiteSpace(value))
            return BadRequest(new { error = "At least one of 'key' or 'value' must be provided." });

        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 1;
        if (pageSize > 100) pageSize = 100;

        var tagQuery = _dbContext.CertificateTags.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(key))
            tagQuery = tagQuery.Where(t => t.Key == key);
        if (!string.IsNullOrWhiteSpace(value))
            tagQuery = tagQuery.Where(t => t.Value.Contains(value));

        var certIdsQuery = tagQuery.Select(t => t.CertificateId).Distinct();

        var total = await certIdsQuery.CountAsync();

        var certIds = await certIdsQuery
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var certs = await _dbContext.Certificates
            .AsNoTracking()
            .Where(c => certIds.Contains(c.CertificateId))
            .ToListAsync();

        var userId = _currentUser.User.Id;
        var results = new List<object>();

        foreach (var c in certs)
        {
            if (!_certificateAccessEvaluator.CanViewCertificate(userId, c.CertificateId))
                continue;

            var tags = await _dbContext.CertificateTags
                .AsNoTracking()
                .Where(t => t.CertificateId == c.CertificateId)
                .Select(t => new { t.Id, t.Key, t.Value, t.CreatedAt })
                .ToListAsync();

            results.Add(new
            {
                c.CertificateId,
                c.SerialNumber,
                c.SubjectDN,
                c.Issuer,
                c.NotBefore,
                c.NotAfter,
                c.IsCA,
                c.Revoked,
                tags
            });
        }

        var totalPages = (int)Math.Ceiling((double)total / pageSize);

        return Ok(new
        {
            total,
            totalPages,
            page,
            pageSize,
            items = results
        });
    }

    /// <summary>
    /// Performs impact analysis on a certificate, returning the certificate details,
    /// all certificates signed by it (if it is a CA), all tags, dependent services
    /// (from tags with key "service"), and whether revoking it would affect other active certificates.
    /// </summary>
    /// <param name="serial">The serial number of the certificate to analyze.</param>
    /// <returns>An impact analysis report for the certificate.</returns>
    [HttpGet("{serial}/impact")]
    public async Task<IActionResult> GetCertificateImpact(string serial)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        var cert = await _dbContext.Certificates
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert == null)
            return NotFound(new { error = "Certificate not found." });

        if (!_certificateAccessEvaluator.CanViewCertificate(_currentUser.User.Id, cert.CertificateId))
            return NotFound(new { error = "Certificate not found." });

        // Get all tags on this certificate
        var tags = await _dbContext.CertificateTags
            .AsNoTracking()
            .Where(t => t.CertificateId == cert.CertificateId)
            .Select(t => new { t.Id, t.Key, t.Value, t.CreatedAt })
            .ToListAsync();

        // Get dependent services from tags with key "service"
        var dependentServices = tags
            .Where(t => string.Equals(t.Key, "service", StringComparison.OrdinalIgnoreCase))
            .Select(t => t.Value)
            .ToList();

        // Find certificates signed by this cert (if it's a CA)
        var signedCertificates = new List<object>();
        var activeSignedCount = 0;

        if (cert.IsCA)
        {
            // Certs issued by this CA share the same Issuer (SubjectDN of the CA cert)
            var issuedCerts = await _dbContext.Certificates
                .AsNoTracking()
                .Where(c => c.Issuer == cert.SubjectDN && c.CertificateId != cert.CertificateId)
                .OrderByDescending(c => c.NotBefore)
                .ToListAsync();

            var now = DateTime.UtcNow;
            foreach (var ic in issuedCerts)
            {
                var isActive = !ic.Revoked && ic.NotAfter >= now;
                if (isActive) activeSignedCount++;

                signedCertificates.Add(new
                {
                    ic.CertificateId,
                    ic.SerialNumber,
                    ic.SubjectDN,
                    ic.NotBefore,
                    ic.NotAfter,
                    ic.IsCA,
                    ic.Revoked,
                    IsActive = isActive
                });
            }
        }

        var wouldAffectActiveCerts = activeSignedCount > 0;

        var certInfo = new
        {
            cert.CertificateId,
            cert.SerialNumber,
            cert.SubjectDN,
            cert.Issuer,
            cert.NotBefore,
            cert.NotAfter,
            cert.IsCA,
            cert.Revoked,
            cert.RevocationReason,
            cert.RevocationDate
        };

        return Ok(new
        {
            certificate = certInfo,
            tags,
            dependentServices,
            signedCertificates,
            impact = new
            {
                totalSignedCertificates = signedCertificates.Count,
                activeSignedCertificates = activeSignedCount,
                wouldAffectActiveCerts,
                affectedServices = dependentServices
            }
        });
    }

    /// <summary>
    /// Returns parsed X.509v3 extensions for a certificate identified by serial number.
    /// Includes Basic Constraints, Key Usage, Extended Key Usage, SANs, AIA (OCSP + CA Issuer URLs),
    /// CRL Distribution Points, Subject Key Identifier, Authority Key Identifier, and Certificate Policies.
    /// </summary>
    /// <param name="serial">The serial number of the certificate.</param>
    /// <returns>A structured object containing all parsed certificate extensions.</returns>
    [HttpGet("{serial}/extensions")]
    public async Task<IActionResult> GetCertificateExtensions(string serial)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        var cert = await _dbContext.Certificates
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert == null)
            return NotFound(new { error = "Certificate not found." });

        if (!_certificateAccessEvaluator.CanViewCertificate(_currentUser.User.Id, cert.CertificateId))
            return NotFound(new { error = "Certificate not found." });

        if (string.IsNullOrWhiteSpace(cert.Pem))
            return NotFound(new { error = "Certificate PEM data not available." });

        try
        {
            var extensions = CertificateUtil.ParseCertificateExtensions(cert.Pem);
            return Ok(extensions);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to parse certificate extensions for serial {Serial}", serial);
            return BadRequest(new { error = "Failed to parse certificate extensions. The certificate data may be malformed." });
        }
    }

    /// <summary>
    /// Returns a health score (0-100) for a single certificate identified by serial number.
    /// The score accounts for key strength, signature algorithm, validity period,
    /// revocation status, active vulnerabilities, CT submission, and wildcard usage.
    /// </summary>
    /// <param name="serial">The serial number of the certificate to evaluate.</param>
    /// <returns>A health score object containing the numeric score, letter grade, and contributing factors.</returns>
    [HttpGet("{serial}/health")]
    public async Task<IActionResult> GetCertificateHealth(string serial)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        var cert = await _dbContext.Certificates
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert == null)
            return NotFound(new { error = "Certificate not found." });

        if (!_certificateAccessEvaluator.CanViewCertificate(_currentUser.User.Id, cert.CertificateId))
            return NotFound(new { error = "Certificate not found." });

        var score = await _healthScoreService.CalculateScoreAsync(cert.CertificateId);
        return Ok(score);
    }

    /// <summary>
    /// Returns an aggregate health summary across all non-CA certificates.
    /// Includes the grade distribution (count of A/B/C/D/F) and the average score.
    /// </summary>
    /// <returns>An object with grade distribution counts and the average health score.</returns>
    [HttpGet("health/summary")]
    public async Task<IActionResult> GetHealthSummary()
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        var certIds = await _dbContext.Certificates
            .AsNoTracking()
            .Where(c => !c.IsCA)
            .Select(c => c.CertificateId)
            .ToListAsync();

        if (certIds.Count == 0)
            return Ok(new
            {
                total = 0,
                averageScore = 0,
                distribution = new { A = 0, B = 0, C = 0, D = 0, F = 0 }
            });

        var scores = await _healthScoreService.CalculateBulkScoresAsync(certIds);

        var avg = scores.Count > 0 ? (int)Math.Round(scores.Average(s => s.Score)) : 0;

        var distribution = new
        {
            A = scores.Count(s => s.Grade == "A"),
            B = scores.Count(s => s.Grade == "B"),
            C = scores.Count(s => s.Grade == "C"),
            D = scores.Count(s => s.Grade == "D"),
            F = scores.Count(s => s.Grade == "F")
        };

        return Ok(new
        {
            total = scores.Count,
            averageScore = avg,
            distribution
        });
    }

}

public class CertExportRequest
{
    public string Format { get; set; } = "pfx";
    public string? Password { get; set; }
    public bool? IncludeChain { get; set; }
}

/// <summary>
/// Request body for adding a key-value tag to a certificate.
/// </summary>
public class CertificateTagRequest
{
    /// <summary>
    /// Tag key describing the category (e.g., "service", "environment", "team", "owner", "application").
    /// </summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>
    /// Tag value (e.g., "nginx", "production", "devops").
    /// </summary>
    public string Value { get; set; } = string.Empty;
}
