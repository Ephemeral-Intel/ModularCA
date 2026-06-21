using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ModularCA.API.Filters;
using ModularCA.Database;
using ModularCA.Shared.Authorization;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Enums;
using ModularCA.Auth.Interfaces;
using ModularCA.Shared.Interfaces;

namespace ModularCA.API.Controllers.v1.Admin;

/// <summary>
/// Admin endpoints for managing roles (named bundles of capabilities) and their capability bindings.
/// </summary>
[ApiController]
[Route("api/v1/admin/roles")]
[Authorize(Policy = "SystemAdmin")]
public class AdminRoleController(
    ModularCADbContext db,
    ICurrentUserService currentUser,
    IAuditService audit) : ControllerBase
{
    private readonly ModularCADbContext _db = db;
    private readonly ICurrentUserService _currentUser = currentUser;
    private readonly IAuditService _audit = audit;

    /// <summary>
    /// Lists all roles with their capability counts.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(200)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> GetAll()
    {
        var roles = await _db.Roles
            .Include(r => r.Capabilities)
            .AsNoTracking()
            .OrderBy(r => r.Name)
            .ToListAsync();

        return Ok(roles.Select(r => new
        {
            r.Id,
            r.Name,
            r.Description,
            r.IsBuiltIn,
            r.TenantId,
            CapabilityCount = r.Capabilities.Count,
            r.CreatedAt
        }));
    }

    /// <summary>
    /// Returns a role by ID with its full list of capability bindings.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var role = await _db.Roles
            .Include(r => r.Capabilities)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id);

        if (role == null)
            return NotFound(new { error = $"Role with ID {id} not found" });

        return Ok(new
        {
            role.Id,
            role.Name,
            role.Description,
            role.IsBuiltIn,
            role.TenantId,
            role.CreatedAt,
            Capabilities = role.Capabilities.Select(c => new
            {
                c.Id,
                c.Capability,
                c.ResourceType,
                c.ResourceId
            })
        });
    }

    /// <summary>
    /// Creates a custom (non-built-in) role. Requires step-up MFA because a freshly minted role
    /// becomes available for assignment immediately and can carry arbitrary capability bundles.
    /// </summary>
    [HttpPost]
    [RequireStepUp(StepUpOps.CreateRole)]
    public async Task<IActionResult> Create([FromBody] CreateRoleRequest request)
    {
        await _currentUser.EnsureLoadedAsync();

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Role name is required" });

        var exists = await _db.Roles.AnyAsync(r => r.Name == request.Name.Trim());
        if (exists)
            return Conflict(new { error = $"A role with name '{request.Name.Trim()}' already exists" });

        var role = new RoleEntity
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            IsBuiltIn = false,
            TenantId = request.TenantId,
            CreatedByUserId = _currentUser.User?.Id
        };

        _db.Roles.Add(role);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(AuditActionType.ConfigUpdated, _currentUser.User?.Id, _currentUser.User?.Username,
            "Role", role.Id.ToString(),
            new { Action = "Created", role.Name, role.Description, role.TenantId },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return CreatedAtAction(nameof(GetById), new { id = role.Id }, new
        {
            role.Id,
            role.Name,
            role.Description,
            role.IsBuiltIn,
            role.TenantId,
            role.CreatedAt
        });
    }

    /// <summary>
    /// Updates a role's name and description. Built-in roles cannot be renamed. Requires
    /// step-up MFA because every assignment that references this role inherits the change.
    /// </summary>
    [HttpPut("{id:guid}")]
    [RequireStepUp(StepUpOps.UpdateRole, "id")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRoleRequest request)
    {
        await _currentUser.EnsureLoadedAsync();

        var role = await _db.Roles.FindAsync(id);
        if (role == null)
            return NotFound(new { error = $"Role with ID {id} not found" });

        if (role.IsBuiltIn)
            return BadRequest(new { error = "Built-in roles cannot be renamed or modified" });

        if (request.Name != null)
        {
            var trimmed = request.Name.Trim();
            var duplicate = await _db.Roles.AnyAsync(r => r.Name == trimmed && r.Id != id);
            if (duplicate)
                return Conflict(new { error = $"A role with name '{trimmed}' already exists" });
            role.Name = trimmed;
        }

        if (request.Description != null)
            role.Description = request.Description;

        await _db.SaveChangesAsync();

        await _audit.LogAsync(AuditActionType.ConfigUpdated, _currentUser.User?.Id, _currentUser.User?.Username,
            "Role", role.Id.ToString(),
            new { Action = "Updated", request.Name, request.Description },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { message = $"Role {role.Name} updated" });
    }

    /// <summary>
    /// Adds a capability binding to a role. The capability must be a recognized value from <see cref="Capabilities.All"/>.
    /// Requires step-up MFA because adding a capability to a role IS a role update — every existing
    /// assignment of this role inherits the new capability.
    /// </summary>
    [HttpPost("{id:guid}/capabilities")]
    [RequireStepUp(StepUpOps.UpdateRole, "id")]
    public async Task<IActionResult> AddCapability(Guid id, [FromBody] AddRoleCapabilityRequest request)
    {
        await _currentUser.EnsureLoadedAsync();

        var role = await _db.Roles.FindAsync(id);
        if (role == null)
            return NotFound(new { error = $"Role with ID {id} not found" });

        if (string.IsNullOrWhiteSpace(request.Capability))
            return BadRequest(new { error = "Capability is required" });

        if (!Capabilities.All.Contains(request.Capability))
            return BadRequest(new { error = $"Unknown capability '{request.Capability}'. Must be one of: {string.Join(", ", Capabilities.All)}" });

        var duplicate = await _db.RoleCapabilities.AnyAsync(c =>
            c.RoleId == id &&
            c.Capability == request.Capability &&
            c.ResourceType == request.ResourceType &&
            c.ResourceId == request.ResourceId);
        if (duplicate)
            return Conflict(new { error = "This capability binding already exists on the role" });

        var capability = new RoleCapabilityEntity
        {
            RoleId = id,
            Capability = request.Capability,
            ResourceType = request.ResourceType,
            ResourceId = request.ResourceId
        };

        _db.RoleCapabilities.Add(capability);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(AuditActionType.ConfigUpdated, _currentUser.User?.Id, _currentUser.User?.Username,
            "RoleCapability", capability.Id.ToString(),
            new { Action = "CapabilityAdded", RoleName = role.Name, request.Capability, request.ResourceType, request.ResourceId },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            capability.Id,
            capability.Capability,
            capability.ResourceType,
            capability.ResourceId
        });
    }

    /// <summary>
    /// Removes a capability binding from a role. Built-in roles cannot have capabilities removed.
    /// Requires step-up MFA because revoking a capability from a role can lock assigned principals
    /// out of resources mid-session.
    /// </summary>
    [HttpDelete("{id:guid}/capabilities/{capabilityId:guid}")]
    [RequireStepUp(StepUpOps.UpdateRole, "id")]
    public async Task<IActionResult> RemoveCapability(Guid id, Guid capabilityId)
    {
        await _currentUser.EnsureLoadedAsync();

        var role = await _db.Roles.FindAsync(id);
        if (role == null)
            return NotFound(new { error = $"Role with ID {id} not found" });

        if (role.IsBuiltIn)
            return BadRequest(new { error = "Cannot remove capabilities from built-in roles" });

        var capability = await _db.RoleCapabilities
            .FirstOrDefaultAsync(c => c.Id == capabilityId && c.RoleId == id);
        if (capability == null)
            return NotFound(new { error = "Capability binding not found on this role" });

        _db.RoleCapabilities.Remove(capability);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(AuditActionType.ConfigUpdated, _currentUser.User?.Id, _currentUser.User?.Username,
            "RoleCapability", capabilityId.ToString(),
            new { Action = "CapabilityRemoved", RoleName = role.Name, capability.Capability },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { message = "Capability removed from role" });
    }

    /// <summary>
    /// Deletes a custom role and cascade-deletes its assignments. Built-in roles cannot be deleted.
    /// Requires step-up MFA because deletion cascades through every assignment, potentially
    /// dropping authorization for many users and groups at once.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [RequireStepUp(StepUpOps.DeleteRole, "id")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _currentUser.EnsureLoadedAsync();

        var role = await _db.Roles
            .Include(r => r.Capabilities)
            .Include(r => r.Assignments)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (role == null)
            return NotFound(new { error = $"Role with ID {id} not found" });

        if (role.IsBuiltIn)
            return BadRequest(new { error = "Built-in roles cannot be deleted" });

        _db.RoleCapabilities.RemoveRange(role.Capabilities);
        _db.RoleAssignments.RemoveRange(role.Assignments);
        _db.Roles.Remove(role);
        await _db.SaveChangesAsync();

        await _audit.LogAsync(AuditActionType.ConfigUpdated, _currentUser.User?.Id, _currentUser.User?.Username,
            "Role", id.ToString(),
            new { Action = "Deleted", role.Name },
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { message = $"Role {role.Name} deleted" });
    }
}

/// <summary>
/// Request body for creating a new role.
/// </summary>
public class CreateRoleRequest
{
    /// <summary>Unique name for the role.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Optional description of what the role grants.</summary>
    public string? Description { get; set; }

    /// <summary>Optional tenant scope. Null for system-wide roles.</summary>
    public Guid? TenantId { get; set; }
}

/// <summary>
/// Request body for updating an existing role.
/// </summary>
public class UpdateRoleRequest
{
    /// <summary>New name for the role.</summary>
    public string? Name { get; set; }

    /// <summary>New description for the role.</summary>
    public string? Description { get; set; }
}

/// <summary>
/// Request body for adding a capability binding to a role.
/// </summary>
public class AddRoleCapabilityRequest
{
    /// <summary>The capability string (e.g. "cert.request", "profile.manage").</summary>
    public string Capability { get; set; } = string.Empty;

    /// <summary>Optional resource type for scoped capabilities (e.g. "CertProfile").</summary>
    public string? ResourceType { get; set; }

    /// <summary>Optional resource ID for scoped capabilities.</summary>
    public Guid? ResourceId { get; set; }
}
