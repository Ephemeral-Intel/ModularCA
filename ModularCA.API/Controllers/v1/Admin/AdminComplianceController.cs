using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ModularCA.Auth.Interfaces;
using ModularCA.Core.Services;

namespace ModularCA.API.Controllers.v1.Admin;

/// <summary>
/// Admin endpoints for generating compliance reports and exporting certificate inventory data.
/// Requires the SystemAuditor authorization policy.
/// </summary>
[ApiController]
[Route("api/v1/admin/compliance")]
[Authorize(Policy = "SystemAuditor")]
public class AdminComplianceController : ControllerBase
{
    private readonly IComplianceReportService _reportService;
    private readonly ICurrentUserService _currentUser;

    /// <summary>
    /// Initializes a new instance of the <see cref="AdminComplianceController"/> class.
    /// </summary>
    /// <param name="reportService">Service for generating compliance reports.</param>
    /// <param name="currentUser">Service for resolving the authenticated user.</param>
    public AdminComplianceController(
        IComplianceReportService reportService,
        ICurrentUserService currentUser)
    {
        _reportService = reportService;
        _currentUser = currentUser;
    }

    /// <summary>
    /// Generates a compliance report as JSON covering certificate inventory, algorithm distribution,
    /// vulnerability summary, policy violations, expiry forecast, revocation and issuance history,
    /// and CA hierarchy. Accepts an optional CA filter and date range for history sections.
    /// </summary>
    /// <param name="request">Report parameters including date range and optional CA filter.</param>
    /// <returns>A JSON compliance report.</returns>
    [HttpPost("report")]
    public async Task<IActionResult> GenerateReport([FromBody] ComplianceReportRequest request)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        if (request.FromDate > request.ToDate)
            return BadRequest(new { error = "fromDate must be before or equal to toDate." });

        var report = await _reportService.GenerateReportAsync(request);
        return Ok(report);
    }

    /// <summary>
    /// Generates a compliance report and exports it as a CSV file download.
    /// Each row represents a single certificate with serial, subject, issuer, algorithm,
    /// key size, validity dates, status, health score, and vulnerability count.
    /// </summary>
    /// <param name="request">Report parameters including date range and optional CA filter.</param>
    /// <returns>A CSV file download containing the certificate inventory.</returns>
    [HttpPost("export/csv")]
    public async Task<IActionResult> ExportCsv([FromBody] ComplianceReportRequest request)
    {
        await _currentUser.EnsureLoadedAsync();
        if (!_currentUser.IsAuthenticated || _currentUser.User == null)
            return Unauthorized();

        if (request.FromDate > request.ToDate)
            return BadRequest(new { error = "fromDate must be before or equal to toDate." });

        var report = await _reportService.GenerateReportAsync(request);
        var csvBytes = await _reportService.ExportCsvAsync(report);

        var fileName = $"compliance-report-{request.FromDate:yyyyMMdd}-{request.ToDate:yyyyMMdd}.csv";
        return File(csvBytes, "text/csv", fileName);
    }
}
