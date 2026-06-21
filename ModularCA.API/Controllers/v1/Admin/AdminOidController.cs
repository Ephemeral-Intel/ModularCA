using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ModularCA.Database;

namespace ModularCA.API.Controllers.v1.Admin;

/// <summary>
/// Admin endpoints for managing OID options (standard and extended key usage OIDs).
/// Restricted to SystemOperator because the OID catalog is global and shared across all tenants.
/// </summary>
[ApiController]
[Route("api/v1/admin/oid-options")]
[Authorize(Policy = "SystemOperator")]
public class AdminOidController(ModularCADbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var oids = await db.OIDOptions
            .Select(o => new { o.OID, o.FriendlyName, o.KeyUsage })
            .ToListAsync();
        return Ok(oids);
    }
}
