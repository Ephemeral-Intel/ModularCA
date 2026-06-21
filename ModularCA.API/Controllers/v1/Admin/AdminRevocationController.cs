using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.EntityFrameworkCore;
using ModularCA.API.Controllers.v1.Auth;
using ModularCA.Auth.Interfaces;
using ModularCA.Database;
using ModularCA.Shared.Enums;
using ModularCA.Core.Services;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Revocation;

namespace ModularCA.API.Controllers.v1.Admin;

/// <summary>
/// Admin endpoints for revoking certificates and placing/removing certificate holds.
/// All endpoints require step-up MFA verification. KC-06: CA certificate revocation is
/// ceremony-gated when the tenant's <c>RequireKeyCeremony</c> flag is set.
/// </summary>
[ApiController]
[Route("api/v1/admin/certificates")]
[Authorize(Policy = "CaOperator")]
public class AdminRevocationController(
    ICertificateRevocationService revocationService,
    ICurrentUserService currentUser,
    IAuditService auditService,
    IDistributedCache cache,
    ISecurityAlertService alertService,
    ModularCADbContext dbContext,
    IKeyCeremonyService ceremonySvc
) : ControllerBase
{
    private readonly ICertificateRevocationService _revocationService = revocationService;
    private readonly ICurrentUserService _currentUser = currentUser;
    private readonly IAuditService _audit = auditService;
    private readonly IDistributedCache _cache = cache;
    private readonly ISecurityAlertService _alertService = alertService;
    private readonly ModularCADbContext _dbContext = dbContext;
    private readonly IKeyCeremonyService _ceremonySvc = ceremonySvc;

    /// <summary>
    /// Revokes a certificate by its ID. Requires step-up MFA verification.
    /// KC-06: when the certificate is a CA cert and the tenant requires key ceremonies,
    /// a <c>RevokeCa</c> ceremony is created instead of performing immediate revocation.
    /// Audit findings #32: emits the success-path action type with <c>success=false</c> when
    /// the underlying revocation service throws, so SIEM can correlate failed attempts.
    /// </summary>
    [HttpPost("{certId:guid}/revoke")]
    public async Task<IActionResult> RevokeByCertId([FromBody] RevokeCertificateRequestByCertId request, [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();
        if (_currentUser.User == null) return Unauthorized();

        // KC-06: CA cert revocation uses RevokeCa step-up op; leaf certs use RevokeCert.
        var cert = await _dbContext.Certificates.AsNoTracking()
            .FirstOrDefaultAsync(c => c.CertificateId == request.CertificateId);
        if (cert == null) return NotFound(new { error = "Certificate not found." });

        var stepUpOp = cert.IsCA ? StepUpOps.RevokeCa : StepUpOps.RevokeCert;
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, stepUpOp, request.CertificateId.ToString()))
            return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

        var fence = await EnforceTenantFenceForCertAsync(request.CertificateId, null);
        if (fence != null) return fence;

        // KC-06: if the cert is a CA cert, check if the tenant requires a ceremony.
        if (cert.IsCA)
        {
            var ceremonyResult = await TryCreateRevokeCaCeremonyAsync(cert, request.Reason);
            if (ceremonyResult != null) return ceremonyResult;
        }

        Shared.Interfaces.RevocationResult result;
        try
        {
            result = await _revocationService.RevokeCertificateAsync(
                request.CertificateId, null, request.Reason, request.InvalidityDate);
        }
        catch (Exception ex)
        {
            // Audit findings #32: failed revocation attempts must be auditable. CA-cert
            // revocation uses a different action type than leaf-cert revocation so the
            // failure record matches the success-path emission on the corresponding cert
            // class (see CertificateRevocationService.cs for the success-path mapping).
            await TryAuditRevocationFailureAsync(cert, request.CertificateId, null, request.Reason, ex);
            throw;
        }
        var caInfoById = await ResolveCaFromCertIdAsync(request.CertificateId);
        await _audit.LogAsync(AuditActionType.CertificateRevoked, _currentUser.User?.Id, _currentUser.User?.Username,
            "Certificate", request.CertificateId.ToString(), new { request.Reason },
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            certificateAuthorityId: caInfoById?.CaId, tenantId: caInfoById?.TenantId);
        _ = _alertService.RaiseAlertAsync("CertificateRevoked", AlertSeverity.Critical, $"Certificate {request.CertificateId} revoked by {_currentUser.User?.Username}", new { request.CertificateId, request.Reason });
        return Ok(new
        {
            message = "Certificate revoked.",
            certificateId = result.CertificateId,
            serialNumber = result.SerialNumber,
            newStatus = result.NewStatus,
            reason = result.Reason?.ToString(),
            crlNumber = result.CrlNumber,
            effectiveAt = result.EffectiveAt,
        });
    }

    /// <summary>
    /// Revokes a certificate by its serial number. Requires step-up MFA verification.
    /// KC-06: when the certificate is a CA cert and the tenant requires key ceremonies,
    /// a <c>RevokeCa</c> ceremony is created instead of performing immediate revocation.
    /// Audit findings #32: emits <see cref="AuditActionType.CertificateRevoked"/> with
    /// <c>success=false</c> when the revocation service throws so SIEM can correlate
    /// failed revocation attempts.
    /// </summary>
    [HttpPost("serial/{serial}/revoke")]
    public async Task<IActionResult> RevokeByCertSerial([FromBody] RevokeCertificateRequestByCertSerial request, [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();
        if (_currentUser.User == null) return Unauthorized();

        // KC-06: CA cert revocation uses RevokeCa step-up op; leaf certs use RevokeCert.
        var cert = await _dbContext.Certificates.AsNoTracking()
            .FirstOrDefaultAsync(c => c.SerialNumber == request.SerialNumber);
        if (cert == null) return NotFound(new { error = "Certificate not found." });

        var stepUpOp = cert.IsCA ? StepUpOps.RevokeCa : StepUpOps.RevokeCert;
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, stepUpOp, request.SerialNumber))
            return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

        var fence = await EnforceTenantFenceForCertAsync(null, request.SerialNumber);
        if (fence != null) return fence;

        // KC-06: if the cert is a CA cert, check if the tenant requires a ceremony.
        if (cert.IsCA)
        {
            var ceremonyResult = await TryCreateRevokeCaCeremonyAsync(cert, request.Reason);
            if (ceremonyResult != null) return ceremonyResult;
        }

        Shared.Interfaces.RevocationResult result;
        try
        {
            result = await _revocationService.RevokeCertificateAsync(
                null, request.SerialNumber, request.Reason, request.InvalidityDate);
        }
        catch (Exception ex)
        {
            await TryAuditRevocationFailureAsync(cert, null, request.SerialNumber, request.Reason, ex);
            throw;
        }
        var caInfoBySn = await ResolveCaFromSerialAsync(request.SerialNumber);
        await _audit.LogAsync(AuditActionType.CertificateRevoked, _currentUser.User?.Id, _currentUser.User?.Username,
            "Certificate", request.SerialNumber, new { request.Reason },
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            certificateAuthorityId: caInfoBySn?.CaId, tenantId: caInfoBySn?.TenantId);
        _ = _alertService.RaiseAlertAsync("CertificateRevoked", AlertSeverity.Critical, $"Certificate {request.SerialNumber} revoked by {_currentUser.User?.Username}", new { request.SerialNumber, request.Reason });
        return Ok(new
        {
            message = "Certificate revoked.",
            certificateId = result.CertificateId,
            serialNumber = result.SerialNumber,
            newStatus = result.NewStatus,
            reason = result.Reason?.ToString(),
            crlNumber = result.CrlNumber,
            effectiveAt = result.EffectiveAt,
        });
    }

    /// <summary>
    /// Places a certificate on hold by its ID. Requires step-up MFA verification.
    /// Audit findings #32: emits <see cref="AuditActionType.CertificateHeld"/> with
    /// <c>success=false</c> when the hold service call throws.
    /// </summary>
    [HttpPost("{certId:guid}/hold")]
    public async Task<IActionResult> HoldByCertId([FromBody] HoldCertificateRequestByCertId request, [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();
        if (_currentUser.User == null) return Unauthorized();
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, StepUpOps.HoldCert, request.CertificateId.ToString()))
            return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

        var fence = await EnforceTenantFenceForCertAsync(request.CertificateId, null);
        if (fence != null) return fence;

        Shared.Interfaces.RevocationResult holdResult;
        try
        {
            holdResult = await _revocationService.HoldCertificateAsync(request.CertificateId, null);
        }
        catch (Exception ex)
        {
            await TryAuditHoldFailureAsync(AuditActionType.CertificateHeld, request.CertificateId, null, ex);
            throw;
        }
        var caInfoHoldId = await ResolveCaFromCertIdAsync(request.CertificateId);
        await _audit.LogAsync(AuditActionType.CertificateHeld, _currentUser.User?.Id, _currentUser.User?.Username,
            "Certificate", request.CertificateId.ToString(),
            sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString(),
            certificateAuthorityId: caInfoHoldId?.CaId, tenantId: caInfoHoldId?.TenantId);
        _ = _alertService.RaiseAlertAsync("CertificateHold", AlertSeverity.Critical, $"Certificate {request.CertificateId} placed on hold by {_currentUser.User?.Username}", new { request.CertificateId });
        return Ok(new
        {
            message = "Certificate placed on hold.",
            certificateId = holdResult.CertificateId,
            serialNumber = holdResult.SerialNumber,
            newStatus = holdResult.NewStatus,
            crlNumber = holdResult.CrlNumber,
            effectiveAt = holdResult.EffectiveAt,
        });
    }

    /// <summary>
    /// Places a certificate on hold by its serial number. Requires step-up MFA verification.
    /// Audit findings #32: emits <see cref="AuditActionType.CertificateHeld"/> with
    /// <c>success=false</c> when the hold service call throws.
    /// </summary>
    [HttpPost("serial/{serial}/hold")]
    public async Task<IActionResult> HoldByCertSerial([FromBody] HoldCertificateRequestByCertSerial request, [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();
        if (_currentUser.User == null) return Unauthorized();
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, StepUpOps.HoldCert, request.SerialNumber))
            return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

        var fence = await EnforceTenantFenceForCertAsync(null, request.SerialNumber);
        if (fence != null) return fence;

        Shared.Interfaces.RevocationResult holdSnResult;
        try
        {
            holdSnResult = await _revocationService.HoldCertificateAsync(null, request.SerialNumber);
        }
        catch (Exception ex)
        {
            await TryAuditHoldFailureAsync(AuditActionType.CertificateHeld, null, request.SerialNumber, ex);
            throw;
        }
        var caInfoHoldSn = await ResolveCaFromSerialAsync(request.SerialNumber);
        await _audit.LogAsync(AuditActionType.CertificateHeld, _currentUser.User?.Id, _currentUser.User?.Username,
            "Certificate", request.SerialNumber,
            sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString(),
            certificateAuthorityId: caInfoHoldSn?.CaId, tenantId: caInfoHoldSn?.TenantId);
        _ = _alertService.RaiseAlertAsync("CertificateHold", AlertSeverity.Critical, $"Certificate {request.SerialNumber} placed on hold by {_currentUser.User?.Username}", new { request.SerialNumber });
        return Ok(new
        {
            message = "Certificate placed on hold.",
            certificateId = holdSnResult.CertificateId,
            serialNumber = holdSnResult.SerialNumber,
            newStatus = holdSnResult.NewStatus,
            crlNumber = holdSnResult.CrlNumber,
            effectiveAt = holdSnResult.EffectiveAt,
        });
    }

    /// <summary>
    /// Removes a certificate from hold by its ID. Requires step-up MFA verification.
    /// Audit findings #32: emits <see cref="AuditActionType.CertificateUnheld"/> with
    /// <c>success=false</c> when the unhold service call throws.
    /// </summary>
    [HttpPost("{certId:guid}/unhold")]
    public async Task<IActionResult> UnholdByCertId([FromBody] HoldCertificateRequestByCertId request, [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();
        if (_currentUser.User == null) return Unauthorized();
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, StepUpOps.UnholdCert, request.CertificateId.ToString()))
            return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

        var fence = await EnforceTenantFenceForCertAsync(request.CertificateId, null);
        if (fence != null) return fence;

        Shared.Interfaces.RevocationResult unholdResult;
        try
        {
            unholdResult = await _revocationService.UnholdCertificateAsync(request.CertificateId, null);
        }
        catch (Exception ex)
        {
            await TryAuditHoldFailureAsync(AuditActionType.CertificateUnheld, request.CertificateId, null, ex);
            throw;
        }
        var caInfoUnholdId = await ResolveCaFromCertIdAsync(request.CertificateId);
        await _audit.LogAsync(AuditActionType.CertificateUnheld, _currentUser.User?.Id, _currentUser.User?.Username,
            "Certificate", request.CertificateId.ToString(),
            sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString(),
            certificateAuthorityId: caInfoUnholdId?.CaId, tenantId: caInfoUnholdId?.TenantId);
        return Ok(new
        {
            message = "Certificate reinstated from hold.",
            certificateId = unholdResult.CertificateId,
            serialNumber = unholdResult.SerialNumber,
            newStatus = unholdResult.NewStatus,
            crlNumber = unholdResult.CrlNumber,
            effectiveAt = unholdResult.EffectiveAt,
        });
    }

    /// <summary>
    /// Removes a certificate from hold by its serial number. Requires step-up MFA verification.
    /// Audit findings #32: emits <see cref="AuditActionType.CertificateUnheld"/> with
    /// <c>success=false</c> when the unhold service call throws.
    /// </summary>
    [HttpPost("serial/{serial}/unhold")]
    public async Task<IActionResult> UnholdByCertSerial([FromBody] HoldCertificateRequestByCertSerial request, [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();
        if (_currentUser.User == null) return Unauthorized();
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, StepUpOps.UnholdCert, request.SerialNumber))
            return StatusCode(403, new { error = "MFA re-verification required. Call /api/v1/auth/mfa/verify-stepup first.", requiresStepUp = true });

        var fence = await EnforceTenantFenceForCertAsync(null, request.SerialNumber);
        if (fence != null) return fence;

        Shared.Interfaces.RevocationResult unholdSnResult;
        try
        {
            unholdSnResult = await _revocationService.UnholdCertificateAsync(null, request.SerialNumber);
        }
        catch (Exception ex)
        {
            await TryAuditHoldFailureAsync(AuditActionType.CertificateUnheld, null, request.SerialNumber, ex);
            throw;
        }
        var caInfoUnholdSn = await ResolveCaFromSerialAsync(request.SerialNumber);
        await _audit.LogAsync(AuditActionType.CertificateUnheld, _currentUser.User?.Id, _currentUser.User?.Username,
            "Certificate", request.SerialNumber,
            sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString(),
            certificateAuthorityId: caInfoUnholdSn?.CaId, tenantId: caInfoUnholdSn?.TenantId);
        return Ok(new
        {
            message = "Certificate reinstated from hold.",
            certificateId = unholdSnResult.CertificateId,
            serialNumber = unholdSnResult.SerialNumber,
            newStatus = unholdSnResult.NewStatus,
            crlNumber = unholdSnResult.CrlNumber,
            effectiveAt = unholdSnResult.EffectiveAt,
        });
    }

    /// <summary>
    /// KC-06: checks whether a CA certificate revocation requires a key ceremony. If the CA's
    /// tenant has <c>RequireKeyCeremony</c> set, creates a <c>RevokeCa</c> ceremony and returns
    /// an <see cref="IActionResult"/> with the ceremony details. Returns null if no ceremony is
    /// required, allowing the caller to proceed with direct revocation.
    /// </summary>
    private async Task<IActionResult?> TryCreateRevokeCaCeremonyAsync(
        Shared.Entities.CertificateEntity cert, RevocationReason reason)
    {
        // Find the CA entity that owns this certificate.
        var ca = await _dbContext.CertificateAuthorities
            .Include(c => c.Tenant)
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CertificateId == cert.CertificateId);

        if (ca?.Tenant == null)
            return null; // No CA linkage — allow direct revocation.

        if (!ca.Tenant.RequireKeyCeremony)
            return null; // Tenant does not require ceremonies.

        // Create a RevokeCa ceremony.
        var parametersJson = JsonSerializer.Serialize(new
        {
            CertificateId = cert.CertificateId,
            SerialNumber = cert.SerialNumber,
            Reason = reason.ToString(),
            TenantId = ca.TenantId,
        });

        var ceremony = await _ceremonySvc.InitiateAsync(
            "RevokeCa",
            $"Revoke CA certificate {cert.SerialNumber} ({ca.Name})",
            ca.Id.ToString(),
            _currentUser.User!.Id,
            _currentUser.User.Username ?? string.Empty,
            parametersJson);

        await _audit.LogAsync(
            AuditActionType.KeyCeremonyInitiated,
            _currentUser.User.Id, _currentUser.User.Username,
            "KeyCeremony", ceremony.Id.ToString(),
            new { ceremony.OperationType, CertificateId = cert.CertificateId, cert.SerialNumber },
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            certificateAuthorityId: ca.Id, tenantId: ca.TenantId);

        _ = _alertService.RaiseAlertAsync(
            "KeyCeremonyInitiated", AlertSeverity.Critical,
            $"CA revocation ceremony created for {ca.Name} by {_currentUser.User.Username}",
            new { CeremonyId = ceremony.Id, CertificateId = cert.CertificateId, cert.SerialNumber });

        return Ok(new
        {
            message = "CA certificate revocation requires a key ceremony. A ceremony has been created.",
            requiresCeremony = true,
            ceremonyId = ceremony.Id,
            ceremony.Status,
            ceremony.RequiredApprovals,
            ceremony.CurrentApprovals,
            certificateId = cert.CertificateId,
            serialNumber = cert.SerialNumber,
            caName = ca.Name,
        });
    }

    /// <summary>
    /// Enforces tenant isolation for certificate operations. Resolves the certificate's CA
    /// tenant via the signing profile linkage and checks that the caller has access to that
    /// tenant. System admins bypass the check. Returns null on allow, NotFound on deny.
    /// </summary>
    private async Task<IActionResult?> EnforceTenantFenceForCertAsync(Guid? certId, string? serial)
    {
        if (HttpContext.Items["IsSystemAdmin"] is true) return null;

        Shared.Entities.CertificateEntity? cert = null;
        if (certId.HasValue)
            cert = await _dbContext.Certificates.AsNoTracking().FirstOrDefaultAsync(c => c.CertificateId == certId.Value);
        else if (!string.IsNullOrWhiteSpace(serial))
            cert = await _dbContext.Certificates.AsNoTracking().FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert == null)
            return NotFound();

        if (cert.SigningProfileId == null) return NotFound();
        var config = await _dbContext.CaProtocolConfigs
            .Include(pc => pc.Ca)
            .AsNoTracking()
            .FirstOrDefaultAsync(pc => pc.SigningProfileId == cert.SigningProfileId);
        if (config?.Ca == null) return NotFound();

        var tenantIds = HttpContext.Items["AccessibleTenantIds"] as HashSet<Guid>;
        if (tenantIds == null || !tenantIds.Contains(config.Ca.TenantId))
            return NotFound();
        return null;
    }

    /// <summary>
    /// Resolves the CA ID and tenant ID from a certificate ID via its signing profile linkage.
    /// </summary>
    private async Task<(Guid CaId, Guid TenantId)?> ResolveCaFromCertIdAsync(Guid certId)
    {
        var cert = await _dbContext.Certificates.AsNoTracking().FirstOrDefaultAsync(c => c.CertificateId == certId);
        if (cert?.SigningProfileId == null) return null;
        var config = await _dbContext.CaProtocolConfigs
            .Include(pc => pc.Ca)
            .AsNoTracking()
            .FirstOrDefaultAsync(pc => pc.SigningProfileId == cert.SigningProfileId);
        if (config?.Ca == null) return null;
        return (config.Ca.Id, config.Ca.TenantId);
    }

    /// <summary>
    /// Resolves the CA ID and tenant ID from a certificate serial number via its signing profile linkage.
    /// </summary>
    private async Task<(Guid CaId, Guid TenantId)?> ResolveCaFromSerialAsync(string serial)
    {
        var cert = await _dbContext.Certificates.AsNoTracking().FirstOrDefaultAsync(c => c.SerialNumber == serial);
        if (cert?.SigningProfileId == null) return null;
        var config = await _dbContext.CaProtocolConfigs
            .Include(pc => pc.Ca)
            .AsNoTracking()
            .FirstOrDefaultAsync(pc => pc.SigningProfileId == cert.SigningProfileId);
        if (config?.Ca == null) return null;
        return (config.Ca.Id, config.Ca.TenantId);
    }

    /// <summary>
    /// Audit findings #32: helper that emits a <see cref="AuditActionType.CertificateRevoked"/>
    /// audit record with <c>success=false</c> when the revocation service throws. The emission
    /// is wrapped in its own try/catch so an audit-store failure does not shadow the original
    /// service error the caller is about to rethrow.
    /// </summary>
    private async Task TryAuditRevocationFailureAsync(
        Shared.Entities.CertificateEntity cert,
        Guid? certificateId,
        string? serial,
        RevocationReason reason,
        Exception ex)
    {
        try
        {
            var caInfo = certificateId.HasValue
                ? await ResolveCaFromCertIdAsync(certificateId.Value)
                : (serial != null ? await ResolveCaFromSerialAsync(serial) : null);

            var targetId = certificateId?.ToString() ?? serial ?? cert.CertificateId.ToString();

            await _audit.LogAsync(
                AuditActionType.CertificateRevoked,
                _currentUser.User?.Id, _currentUser.User?.Username,
                "Certificate", targetId,
                new { Reason = reason, IsCA = cert.IsCA, cert.SerialNumber },
                HttpContext.Connection.RemoteIpAddress?.ToString(),
                success: false,
                errorMessage: ex.Message,
                certificateAuthorityId: caInfo?.CaId,
                tenantId: caInfo?.TenantId);
        }
        catch
        {
            // Swallow — original error is what the user needs.
        }
    }

    /// <summary>
    /// Audit findings #32: helper that emits a hold/unhold failure audit record. Picks the
    /// matching action type (<see cref="AuditActionType.CertificateHeld"/> or
    /// <see cref="AuditActionType.CertificateUnheld"/>) so SIEM can align failures with the
    /// success-path emissions on the same endpoints.
    /// </summary>
    private async Task TryAuditHoldFailureAsync(
        string actionType,
        Guid? certificateId,
        string? serial,
        Exception ex)
    {
        try
        {
            var caInfo = certificateId.HasValue
                ? await ResolveCaFromCertIdAsync(certificateId.Value)
                : (serial != null ? await ResolveCaFromSerialAsync(serial) : null);

            var targetId = certificateId?.ToString() ?? serial ?? string.Empty;

            await _audit.LogAsync(
                actionType,
                _currentUser.User?.Id, _currentUser.User?.Username,
                "Certificate", targetId,
                sourceIp: HttpContext.Connection.RemoteIpAddress?.ToString(),
                success: false,
                errorMessage: ex.Message,
                certificateAuthorityId: caInfo?.CaId,
                tenantId: caInfo?.TenantId);
        }
        catch
        {
            // Swallow — original error is what the user needs.
        }
    }
}
