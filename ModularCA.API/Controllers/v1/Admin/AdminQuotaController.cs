using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ModularCA.Auth.Interfaces;
using ModularCA.Core.Services;
using ModularCA.Database;
using ModularCA.Shared.Authorization;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;

namespace ModularCA.API.Controllers.v1.Admin;

/// <summary>
/// Admin endpoints for viewing and managing certificate quota limits per CA.
/// Quotas are configured on the CA's admin group and enforce a maximum number of
/// active certificates that can be issued through that CA.
/// </summary>
[ApiController]
[Route("api/v1/admin/quotas")]
[Authorize(Policy = "SystemOperator")]
public class AdminQuotaController(
    ModularCADbContext db,
    IQuotaService quotaService,
    IAuditService audit,
    ICurrentUserService currentUser) : ControllerBase
{
    /// <summary>
    /// Returns quota usage summaries for all enabled CAs, including issued counts,
    /// remaining capacity, and warning/exceeded status.
    /// Non-system-admins see only CAs belonging to their accessible tenants.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAllQuotas()
    {
        var summary = await quotaService.GetUsageSummaryAsync();
        var tenantIds = HttpContext.Items["AccessibleTenantIds"] as HashSet<Guid>;
        if (tenantIds != null && HttpContext.Items["IsSystemAdmin"] is not true)
        {
            var accessibleCaIds = await db.CertificateAuthorities
                .Where(ca => tenantIds.Contains(ca.TenantId))
                .Select(ca => ca.Id)
                .ToListAsync();
            var accessibleCaIdSet = new HashSet<Guid>(accessibleCaIds);
            summary.CaQuotas = summary.CaQuotas.Where(q => accessibleCaIdSet.Contains(q.CaId)).ToList();
            summary.TotalIssuedCertificates = summary.CaQuotas.Sum(q => q.IssuedCount);
            summary.ExceededCount = summary.CaQuotas.Count(q => q.IsExceeded);
            summary.WarningCount = summary.CaQuotas.Count(q => !q.IsExceeded && q.MaxCertificates > 0 && q.UsagePercent >= 80);
        }
        return Ok(summary);
    }

    /// <summary>
    /// Returns detailed quota status for a single CA identified by its ID.
    /// </summary>
    /// <param name="caId">The certificate authority ID.</param>
    [HttpGet("{caId:guid}")]
    public async Task<IActionResult> GetQuota(Guid caId)
    {
        try
        {
            var status = await quotaService.CheckQuotaAsync(caId);
            return Ok(status);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Updates certificate quota limits on a CA group. Only admin-level groups can
    /// have quotas configured. Use 0 to indicate unlimited.
    /// </summary>
    /// <param name="groupId">The CA group ID to update.</param>
    /// <param name="request">The new quota limits.</param>
    [HttpPut("{groupId:guid}")]
    public async Task<IActionResult> UpdateQuota(Guid groupId, [FromBody] UpdateQuotaRequest request)
    {
        var group = await db.CaGroups.Include(g => g.Grants).FirstOrDefaultAsync(g => g.Id == groupId);
        if (group == null)
            return NotFound(new { error = "Group not found." });

        if (group.TemplateName != "Administrator" && !group.Grants.Any(gr => gr.Capability == Capabilities.CaManage))
            return BadRequest(new { error = "Quotas can only be configured on admin-level groups." });

        if (request.MaxCertificates < 0)
            return BadRequest(new { error = "MaxCertificates must be 0 (unlimited) or a positive integer." });

        if (request.MaxPendingRequests < 0)
            return BadRequest(new { error = "MaxPendingRequests must be 0 (unlimited) or a positive integer." });

        var oldMaxCerts = group.MaxCertificates;
        var oldMaxPending = group.MaxPendingRequests;

        group.MaxCertificates = request.MaxCertificates;
        group.MaxPendingRequests = request.MaxPendingRequests;
        await db.SaveChangesAsync();

        await currentUser.EnsureLoadedAsync();
        await audit.LogAsync(
            AuditActionType.QuotaUpdated,
            currentUser.User?.Id,
            currentUser.User?.Username,
            "CaGroup",
            groupId.ToString(),
            new
            {
                GroupName = group.Name,
                OldMaxCertificates = oldMaxCerts,
                NewMaxCertificates = request.MaxCertificates,
                OldMaxPendingRequests = oldMaxPending,
                NewMaxPendingRequests = request.MaxPendingRequests
            },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            group.Id,
            group.Name,
            group.MaxCertificates,
            group.MaxPendingRequests
        });
    }
}

/// <summary>
/// Request body for updating certificate quota limits on a CA group.
/// </summary>
public class UpdateQuotaRequest
{
    /// <summary>Maximum certificates that can be issued. 0 = unlimited.</summary>
    public int MaxCertificates { get; set; }

    /// <summary>Maximum pending CSRs allowed. 0 = unlimited.</summary>
    public int MaxPendingRequests { get; set; }
}
