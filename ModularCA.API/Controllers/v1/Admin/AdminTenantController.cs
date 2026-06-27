using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using ModularCA.API.Controllers.v1.Auth;
using ModularCA.Auth.Authorization;
using ModularCA.Auth.Interfaces;
using ModularCA.Core.Services;
using ModularCA.Database;
using ModularCA.Shared.Authorization;
using ModularCA.Shared.Entities;
using ModularCA.Bootstrap;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using Serilog;
using System.Text.RegularExpressions;

namespace ModularCA.API.Controllers.v1.Admin;

/// <summary>
/// Admin endpoints for managing tenants. Tenants provide organizational isolation by
/// grouping certificate authorities and their associated groups under a single entity.
/// All endpoints require the SystemAdmin policy.
/// </summary>
[ApiController]
[Route("api/v1/admin/tenants")]
[Authorize(Policy = "SystemAdmin")]
public partial class AdminTenantController(
    ModularCADbContext db,
    ICurrentUserService currentUser,
    IAuditService audit,
    IDistributedCache cache,
    ICaGroupAuthorizationService groupAuth,
    ITenantPolicyChangeService tenantPolicyChangeService) : ControllerBase
{
    private readonly ModularCADbContext _db = db;
    private readonly ICurrentUserService _currentUser = currentUser;
    private readonly IAuditService _audit = audit;
    private readonly IDistributedCache _cache = cache;
    private readonly ICaGroupAuthorizationService _groupAuth = groupAuth;
    private readonly ITenantPolicyChangeService _tenantPolicyChangeService = tenantPolicyChangeService;

    /// <summary>
    /// Lists all tenants with summary counts for CAs, users, and certificates.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var tenants = await _db.Tenants
            .AsNoTracking()
            .OrderBy(t => t.Name)
            .ToListAsync();

        var tenantIds = tenants.Select(t => t.Id).ToList();

        // CA counts per tenant
        var caCounts = await _db.CertificateAuthorities
            .Where(ca => tenantIds.Contains(ca.TenantId))
            .GroupBy(ca => ca.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count);

        // Distinct user counts per tenant (via group memberships)
        var userCounts = await _db.CaGroupMembers
            .Where(gm => tenantIds.Contains(gm.Group.TenantId))
            .GroupBy(gm => gm.Group.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Select(gm => gm.UserId).Distinct().Count() })
            .ToDictionaryAsync(x => x.TenantId, x => x.Count);

        return Ok(tenants.Select(t => new
        {
            t.Id,
            t.Name,
            t.Slug,
            t.Description,
            t.IsEnabled,
            t.CreatedAt,
            t.MaxCertificateAuthorities,
            t.MaxCertificatesTotal,
            t.MaxUsers,
            t.RequireKeyCeremony,
            t.CeremonyRequiredApprovals,
            CaCount = caCounts.GetValueOrDefault(t.Id, 0),
            UserCount = userCounts.GetValueOrDefault(t.Id, 0)
        }));
    }

    /// <summary>
    /// Returns detailed information about a tenant including CA count, user count, and certificate count.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var tenant = await _db.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == id);

        if (tenant == null)
            return NotFound(new { error = $"Tenant with ID {id} not found" });

        var caCount = await _db.CertificateAuthorities
            .CountAsync(ca => ca.TenantId == id);

        var userCount = await _db.CaGroupMembers
            .Where(gm => gm.Group.TenantId == id)
            .Select(gm => gm.UserId)
            .Distinct()
            .CountAsync();

        var certCount = await _db.Certificates
            .Where(c => c.CertificateAuthority != null && c.CertificateAuthority.TenantId == id)
            .CountAsync();

        return Ok(new
        {
            tenant.Id,
            tenant.Name,
            tenant.Slug,
            tenant.Description,
            tenant.IsEnabled,
            tenant.CreatedAt,
            tenant.MaxCertificateAuthorities,
            tenant.MaxCertificatesTotal,
            tenant.MaxUsers,
            tenant.RequireKeyCeremony,
            tenant.CeremonyRequiredApprovals,
            CaCount = caCount,
            UserCount = userCount,
            CertificateCount = certCount
        });
    }

    /// <summary>
    /// Creates a new tenant. The slug is auto-generated from the name if not provided.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTenantRequest request)
    {
        await _currentUser.EnsureLoadedAsync();

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Tenant name is required" });

        var slug = string.IsNullOrWhiteSpace(request.Slug)
            ? GenerateSlug(request.Name)
            : GenerateSlug(request.Slug);

        var nameExists = await _db.Tenants.AnyAsync(t => t.Name == request.Name.Trim());
        if (nameExists)
            return Conflict(new { error = $"A tenant with name '{request.Name.Trim()}' already exists" });

        var slugExists = await _db.Tenants.AnyAsync(t => t.Slug == slug);
        if (slugExists)
            return Conflict(new { error = $"A tenant with slug '{slug}' already exists" });

        var tenant = new TenantEntity
        {
            Name = request.Name.Trim(),
            Slug = slug,
            Description = request.Description,
            IsEnabled = true,
            MaxCertificateAuthorities = request.MaxCertificateAuthorities ?? 0,
            MaxCertificatesTotal = request.MaxCertificatesTotal ?? 0,
            MaxUsers = request.MaxUsers ?? 0
        };

        _db.Tenants.Add(tenant);
        await _db.SaveChangesAsync();

        // === Auto-generate tenant-level permission groups ===
        var tenantRoles = new[]
        {
            ("Administrator", "admin", "Admin", Capabilities.AdministratorTemplate),
            ("Operator", "operator", "Operator", Capabilities.OperatorTemplate),
            ("Auditor", "auditor", "Auditor", Capabilities.AuditorTemplate),
            ("Requester", "user", "User", Capabilities.RequesterTemplate)
        };

        foreach (var (templateName, suffix, displaySuffix, _) in tenantRoles)
        {
            var groupName = $"org-{tenant.Slug}-{suffix}";
            if (!await _db.CaGroups.AnyAsync(g => g.Name == groupName))
            {
                var newGroup = new CaGroupEntity
                {
                    Name = groupName,
                    DisplayName = $"Org {tenant.Name} {displaySuffix}",
                    CertificateAuthorityId = null, // Tenant-wide, not CA-specific
                    TemplateName = templateName,
                    IsSystemGroup = false,
                    IsAutoGenerated = true,
                    TenantId = tenant.Id,
                    RequiredQuorum = 1,
                };
                _db.CaGroups.Add(newGroup);
                await _db.SaveChangesAsync();

                BootstrapProfileSeeder.AssignBuiltInRoleToGroup(_db, newGroup, templateName);
            }
        }

        await _audit.LogAsync(AuditActionType.TenantCreated, _currentUser.User?.Id, _currentUser.User?.Username,
            "Tenant", tenant.Id.ToString(),
            new { tenant.Name, tenant.Slug },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return CreatedAtAction(nameof(GetById), new { id = tenant.Id }, new
        {
            tenant.Id,
            tenant.Name,
            tenant.Slug,
            tenant.Description,
            tenant.IsEnabled,
            tenant.CreatedAt,
            tenant.MaxCertificateAuthorities,
            tenant.MaxCertificatesTotal,
            tenant.MaxUsers,
            tenant.RequireKeyCeremony,
            tenant.CeremonyRequiredApprovals
        });
    }

    /// <summary>
    /// Updates a tenant's name, description, or quota settings.
    /// Disabling RequireKeyCeremony (true to false) requires step-up MFA verification
    /// to prevent accidental or malicious removal of ceremony protections.
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateTenantRequest request,
        [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();

        var tenant = await _db.Tenants.FindAsync(id);
        if (tenant == null)
            return NotFound(new { error = $"Tenant with ID {id} not found" });

        // Toggling a tenant's enabled state (e.g. re-enabling a disabled tenant) is a
        // high-impact action — require step-up MFA. Quota-only edits (no IsEnabled in the
        // request) are unaffected.
        if (request.IsEnabled.HasValue && request.IsEnabled.Value != tenant.IsEnabled)
        {
            var op = request.IsEnabled.Value ? StepUpOps.EnableTenant : StepUpOps.DisableTenant;
            if (!await MfaStepUpController.ValidateStepUpTokenAsync(_cache, User, mfaToken, op))
                return StatusCode(403, new
                {
                    error = "MFA re-verification required to change a tenant's enabled state. Call /api/v1/auth/mfa/verify-stepup first.",
                    requiresStepUp = true
                });
        }

        // Compute proposed security-policy values: null if the request is not carrying a
        // change (missing or equal to current). The policy-change service treats null as
        // "not changing" on both the IsDowngrade check and the ceremony snapshot.
        bool? proposedRequireKeyCeremony =
            request.RequireKeyCeremony.HasValue && request.RequireKeyCeremony.Value != tenant.RequireKeyCeremony
                ? request.RequireKeyCeremony
                : null;
        int? proposedCeremonyRequiredApprovals = null;
        if (request.CeremonyRequiredApprovals.HasValue)
        {
            var normalized = Math.Max(1, request.CeremonyRequiredApprovals.Value);
            if (normalized != tenant.CeremonyRequiredApprovals)
                proposedCeremonyRequiredApprovals = normalized;
        }

        // Determine whether the security-policy change is a downgrade. If yes, a non-
        // system-super caller must route it through a TenantPolicyChange ceremony;
        // upgrades (and unchanged values) fall through to the direct-write path.
        var isDowngrade = _tenantPolicyChangeService.IsDowngrade(
            tenant.RequireKeyCeremony,
            tenant.CeremonyRequiredApprovals,
            proposedRequireKeyCeremony,
            proposedCeremonyRequiredApprovals);

        bool callerIsSystemSuper = false;
        if (_currentUser.User != null)
            callerIsSystemSuper = await _groupAuth.IsSystemAdminAsync(_currentUser.User.Id);

        var gateDowngradeThroughCeremony = isDowngrade && !callerIsSystemSuper;

        // KC-07: Disabling ceremony requirement requires step-up MFA. Only enforced on
        // the direct-write path (system-super or non-downgrade); ceremony path has its
        // own multi-party quorum check and does not require step-up MFA at initiation.
        if (!gateDowngradeThroughCeremony
            && request.RequireKeyCeremony.HasValue
            && tenant.RequireKeyCeremony
            && !request.RequireKeyCeremony.Value)
        {
            if (!await MfaStepUpController.ValidateStepUpTokenAsync(
                    _cache, User, mfaToken, StepUpOps.DisableCeremonyRequirement))
                return StatusCode(403, new
                {
                    error = "MFA re-verification required to disable key ceremony requirement. Call /api/v1/auth/mfa/verify-stepup first.",
                    requiresStepUp = true
                });
        }

        if (request.Name != null)
        {
            var nameExists = await _db.Tenants.AnyAsync(t => t.Name == request.Name.Trim() && t.Id != id);
            if (nameExists)
                return Conflict(new { error = $"A tenant with name '{request.Name.Trim()}' already exists" });
            tenant.Name = request.Name.Trim();
        }

        if (request.Slug != null)
        {
            var slug = GenerateSlug(request.Slug);
            var slugExists = await _db.Tenants.AnyAsync(t => t.Slug == slug && t.Id != id);
            if (slugExists)
                return Conflict(new { error = $"A tenant with slug '{slug}' already exists" });
            tenant.Slug = slug;
        }

        if (request.Description != null)
            tenant.Description = request.Description;
        if (request.MaxCertificateAuthorities.HasValue)
            tenant.MaxCertificateAuthorities = request.MaxCertificateAuthorities.Value;
        if (request.MaxCertificatesTotal.HasValue)
            tenant.MaxCertificatesTotal = request.MaxCertificatesTotal.Value;
        if (request.MaxUsers.HasValue)
            tenant.MaxUsers = request.MaxUsers.Value;
        if (request.IsEnabled.HasValue)
            tenant.IsEnabled = request.IsEnabled.Value;

        var ceremonyWasRequired = tenant.RequireKeyCeremony;

        // Security-policy fields: only applied inline when the change is NOT a
        // downgrade being gated through a ceremony. On the gated path we persist
        // every other field inline and defer the downgrade until the ceremony
        // executes, while still inline-applying security-policy upgrades.
        if (gateDowngradeThroughCeremony)
        {
            // Apply upgrade-only security-policy changes inline (non-downgrade side).
            // Because the combined change is a downgrade, at least one of the two
            // gated fields is going down; the other, if moving in the safer
            // direction, still persists immediately.
            if (request.RequireKeyCeremony.HasValue
                && request.RequireKeyCeremony.Value
                && !tenant.RequireKeyCeremony)
            {
                tenant.RequireKeyCeremony = true;
            }
            if (request.CeremonyRequiredApprovals.HasValue)
            {
                var normalized = Math.Max(1, request.CeremonyRequiredApprovals.Value);
                if (normalized > tenant.CeremonyRequiredApprovals)
                    tenant.CeremonyRequiredApprovals = normalized;
            }
        }
        else
        {
            if (request.RequireKeyCeremony.HasValue)
                tenant.RequireKeyCeremony = request.RequireKeyCeremony.Value;
            if (request.CeremonyRequiredApprovals.HasValue)
                tenant.CeremonyRequiredApprovals = Math.Max(1, request.CeremonyRequiredApprovals.Value);
        }

        await _db.SaveChangesAsync();

        // Audit specifically when ceremony requirement is disabled inline
        if (ceremonyWasRequired && !tenant.RequireKeyCeremony)
        {
            await _audit.LogAsync(AuditActionType.TenantUpdated, _currentUser.User?.Id, _currentUser.User?.Username,
                "Tenant", tenant.Id.ToString(),
                new { tenant.Name, tenant.Slug, CeremonyRequirementDisabled = true, DisabledBy = _currentUser.User?.Username },
                HttpContext.Connection.RemoteIpAddress?.ToString());
        }
        else
        {
            await _audit.LogAsync(AuditActionType.TenantUpdated, _currentUser.User?.Id, _currentUser.User?.Username,
                "Tenant", tenant.Id.ToString(),
                new { tenant.Name, tenant.Slug },
                HttpContext.Connection.RemoteIpAddress?.ToString());
        }

        // If we gated a downgrade behind a ceremony, open it now and return 202
        // alongside the (already-persisted) non-gated field updates.
        if (gateDowngradeThroughCeremony)
        {
            if (_currentUser.User == null)
                return Unauthorized();

            Guid ceremonyId;
            try
            {
                ceremonyId = await _tenantPolicyChangeService.InitiateChangeAsync(
                    tenant.Id,
                    proposedRequireKeyCeremony,
                    proposedCeremonyRequiredApprovals,
                    _currentUser.User.Id,
                    _currentUser.User.Username);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("already pending", StringComparison.OrdinalIgnoreCase))
            {
                return Conflict(new
                {
                    error = "A tenant policy-change ceremony is already pending for this tenant. Resolve or cancel it before opening a new one."
                });
            }

            Log.Warning(
                "Tenant policy downgrade requires ceremony: tenant={TenantId} initiator={Initiator} ceremonyId={CeremonyId}",
                tenant.Id,
                _currentUser.User.Username,
                ceremonyId);

            return Accepted(new
            {
                ceremonyId,
                message = "Policy change requires ceremony approval. Approve via /api/v1/admin/ceremonies/{id}/approve.",
                tenant = new
                {
                    tenant.Id,
                    tenant.Name,
                    tenant.Slug,
                    tenant.Description,
                    tenant.IsEnabled,
                    tenant.CreatedAt,
                    tenant.MaxCertificateAuthorities,
                    tenant.MaxCertificatesTotal,
                    tenant.MaxUsers,
                    tenant.RequireKeyCeremony,
                    tenant.CeremonyRequiredApprovals
                }
            });
        }

        return Ok(new
        {
            tenant.Id,
            tenant.Name,
            tenant.Slug,
            tenant.Description,
            tenant.IsEnabled,
            tenant.CreatedAt,
            tenant.MaxCertificateAuthorities,
            tenant.MaxCertificatesTotal,
            tenant.MaxUsers,
            tenant.RequireKeyCeremony,
            tenant.CeremonyRequiredApprovals
        });
    }

    /// <summary>
    /// Disables a tenant (soft delete). The tenant and its CAs remain in the database
    /// but are marked as disabled. Does not delete any data. Requires step-up MFA.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Disable(
        Guid id,
        [FromHeader(Name = "X-MFA-Token")] string? mfaToken = null)
    {
        await _currentUser.EnsureLoadedAsync();

        var tenant = await _db.Tenants.FindAsync(id);
        if (tenant == null)
            return NotFound(new { error = $"Tenant with ID {id} not found" });

        if (!tenant.IsEnabled)
            return BadRequest(new { error = "Tenant is already disabled" });

        // Disabling a tenant is a high-impact action — require step-up MFA re-verification.
        if (!await MfaStepUpController.ValidateStepUpTokenAsync(
                _cache, User, mfaToken, StepUpOps.DisableTenant))
            return StatusCode(403, new
            {
                error = "MFA re-verification required to disable a tenant. Call /api/v1/auth/mfa/verify-stepup first.",
                requiresStepUp = true
            });

        tenant.IsEnabled = false;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(AuditActionType.TenantDisabled, _currentUser.User?.Id, _currentUser.User?.Username,
            "Tenant", tenant.Id.ToString(),
            new { tenant.Name, tenant.Slug },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { message = $"Tenant '{tenant.Name}' has been disabled" });
    }

    /// <summary>
    /// Generates a URL-safe slug from the given input string by lowercasing,
    /// replacing spaces and non-alphanumeric characters with hyphens, and trimming.
    /// </summary>
    private static string GenerateSlug(string input)
    {
        var slug = input.Trim().ToLowerInvariant();
        slug = SlugCleanupRegex().Replace(slug, "-");
        slug = SlugCollapseRegex().Replace(slug, "-");
        return slug.Trim('-');
    }

    [GeneratedRegex(@"[^a-z0-9\-]")]
    private static partial Regex SlugCleanupRegex();

    [GeneratedRegex(@"-{2,}")]
    private static partial Regex SlugCollapseRegex();
}

/// <summary>
/// Request body for creating a new tenant.
/// </summary>
public class CreateTenantRequest
{
    /// <summary>Human-readable tenant name. Must be unique.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional URL-safe slug. Auto-generated from name if not provided.</summary>
    public string? Slug { get; set; }

    /// <summary>Optional description of the tenant.</summary>
    public string? Description { get; set; }

    /// <summary>Maximum CAs allowed. 0 = unlimited.</summary>
    public int? MaxCertificateAuthorities { get; set; }

    /// <summary>Maximum total certificates. 0 = unlimited.</summary>
    public int? MaxCertificatesTotal { get; set; }

    /// <summary>Maximum users. 0 = unlimited.</summary>
    public int? MaxUsers { get; set; }
}

/// <summary>
/// Request body for updating a tenant. All fields are optional; only provided fields are updated.
/// </summary>
public class UpdateTenantRequest
{
    /// <summary>New tenant name.</summary>
    public string? Name { get; set; }

    /// <summary>New URL-safe slug.</summary>
    public string? Slug { get; set; }

    /// <summary>New description.</summary>
    public string? Description { get; set; }

    /// <summary>New maximum CAs allowed. 0 = unlimited.</summary>
    public int? MaxCertificateAuthorities { get; set; }

    /// <summary>New maximum total certificates. 0 = unlimited.</summary>
    public int? MaxCertificatesTotal { get; set; }

    /// <summary>New maximum users. 0 = unlimited.</summary>
    public int? MaxUsers { get; set; }

    /// <summary>Enable or disable the tenant. Used to re-enable a previously disabled tenant.</summary>
    public bool? IsEnabled { get; set; }

    /// <summary>Whether CA creation in this tenant requires a key ceremony approval workflow.</summary>
    public bool? RequireKeyCeremony { get; set; }

    /// <summary>
    /// Number of approvals required for key ceremonies in this tenant. Values are clamped
    /// to a minimum of 1 at write time (<c>Math.Max(1, value)</c>). The initiator is never
    /// counted toward this total, so a value of 1 still requires one approver other than
    /// the person who started the ceremony.
    /// </summary>
    public int? CeremonyRequiredApprovals { get; set; }
}
