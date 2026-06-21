namespace ModularCA.Core.Services;

/// <summary>
/// Generates compliance reports summarizing certificate inventory, algorithm usage,
/// vulnerability findings, expiry forecasts, and CA hierarchy status.
/// </summary>
public interface IComplianceReportService
{
    /// <summary>
    /// Generates a comprehensive compliance report for the specified time period and optional CA filter.
    /// </summary>
    /// <param name="request">Report parameters including date range and optional CA filter.</param>
    /// <returns>A populated <see cref="ComplianceReport"/> containing all report sections.</returns>
    Task<ComplianceReport> GenerateReportAsync(ComplianceReportRequest request);

    /// <summary>
    /// Exports a compliance report as a CSV file with one row per certificate.
    /// Columns include serial, subject, issuer, algorithm, key size, validity dates,
    /// status, health score, and vulnerability count.
    /// </summary>
    /// <param name="report">The compliance report to export.</param>
    /// <returns>UTF-8 encoded CSV bytes including a header row.</returns>
    Task<byte[]> ExportCsvAsync(ComplianceReport report);
}

/// <summary>
/// Parameters for generating a compliance report.
/// </summary>
public class ComplianceReportRequest
{
    /// <summary>Start of the reporting period (UTC). Applies to issuance and revocation history.</summary>
    public DateTime FromDate { get; set; }

    /// <summary>End of the reporting period (UTC). Applies to issuance and revocation history.</summary>
    public DateTime ToDate { get; set; }

    /// <summary>Optional CA identifier to restrict the report to a single certificate authority.</summary>
    public Guid? CaId { get; set; }
}

/// <summary>
/// Full compliance report containing all report sections.
/// </summary>
public class ComplianceReport
{
    /// <summary>UTC timestamp when the report was generated.</summary>
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Start of the reporting period.</summary>
    public DateTime FromDate { get; set; }

    /// <summary>End of the reporting period.</summary>
    public DateTime ToDate { get; set; }

    /// <summary>CA identifier if the report was scoped to a single CA, otherwise null.</summary>
    public Guid? CaId { get; set; }

    /// <summary>Certificate inventory counts (total, active, expired, revoked).</summary>
    public CertificateInventory Inventory { get; set; } = new();

    /// <summary>Distribution of certificates by algorithm and key size.</summary>
    public List<AlgorithmDistributionEntry> AlgorithmDistribution { get; set; } = new();

    /// <summary>Vulnerability counts grouped by severity and type.</summary>
    public VulnerabilitySummary VulnerabilitySummary { get; set; } = new();

    /// <summary>Active policy violations detected across certificates.</summary>
    public List<PolicyViolationEntry> PolicyViolations { get; set; } = new();

    /// <summary>Counts of certificates expiring within various forecast windows.</summary>
    public ExpiryForecast ExpiryForecast { get; set; } = new();

    /// <summary>Certificates revoked during the reporting period.</summary>
    public List<RevocationHistoryEntry> RevocationHistory { get; set; } = new();

    /// <summary>Certificates issued during the reporting period.</summary>
    public List<IssuanceHistoryEntry> IssuanceHistory { get; set; } = new();

    /// <summary>Certificate authorities and their current status.</summary>
    public List<CaHierarchyEntry> CaHierarchy { get; set; } = new();

    /// <summary>Flat list of all certificates included in the report, used for CSV export.</summary>
    public List<CertificateReportRow> CertificateRows { get; set; } = new();
}

/// <summary>
/// Certificate inventory totals.
/// </summary>
public class CertificateInventory
{
    /// <summary>Total number of certificates in scope.</summary>
    public int Total { get; set; }

    /// <summary>Certificates that are not revoked and have not expired.</summary>
    public int Active { get; set; }

    /// <summary>Certificates whose NotAfter date has passed.</summary>
    public int Expired { get; set; }

    /// <summary>Certificates that have been revoked.</summary>
    public int Revoked { get; set; }
}

/// <summary>
/// A single entry in the algorithm distribution breakdown.
/// </summary>
public class AlgorithmDistributionEntry
{
    /// <summary>Algorithm name (e.g. RSA, ECDSA, Ed25519).</summary>
    public string Algorithm { get; set; } = string.Empty;

    /// <summary>Key size or curve name (e.g. 2048, 4096, P-256).</summary>
    public string KeySize { get; set; } = string.Empty;

    /// <summary>Number of certificates using this combination.</summary>
    public int Count { get; set; }
}

/// <summary>
/// Aggregated vulnerability counts.
/// </summary>
public class VulnerabilitySummary
{
    /// <summary>Counts by severity level (e.g. Critical, Warning, Info).</summary>
    public Dictionary<string, int> BySeverity { get; set; } = new();

    /// <summary>Counts by vulnerability type (e.g. WeakKey, DeprecatedAlgorithm).</summary>
    public Dictionary<string, int> ByType { get; set; } = new();

    /// <summary>Total number of unresolved vulnerabilities.</summary>
    public int TotalUnresolved { get; set; }
}

/// <summary>
/// An active policy violation found on a certificate.
/// </summary>
public class PolicyViolationEntry
{
    /// <summary>Serial number of the affected certificate.</summary>
    public string SerialNumber { get; set; } = string.Empty;

    /// <summary>Subject DN of the affected certificate.</summary>
    public string SubjectDN { get; set; } = string.Empty;

    /// <summary>Type of the violation (mirrors the vulnerability type).</summary>
    public string ViolationType { get; set; } = string.Empty;

    /// <summary>Severity of the violation.</summary>
    public string Severity { get; set; } = string.Empty;

    /// <summary>Human-readable description of the violation.</summary>
    public string Description { get; set; } = string.Empty;
}

/// <summary>
/// Counts of certificates expiring within various time windows from now.
/// </summary>
public class ExpiryForecast
{
    /// <summary>Certificates expiring within 30 days.</summary>
    public int Within30Days { get; set; }

    /// <summary>Certificates expiring within 60 days.</summary>
    public int Within60Days { get; set; }

    /// <summary>Certificates expiring within 90 days.</summary>
    public int Within90Days { get; set; }

    /// <summary>Certificates expiring within 180 days.</summary>
    public int Within180Days { get; set; }

    /// <summary>Certificates expiring within 365 days.</summary>
    public int Within365Days { get; set; }
}

/// <summary>
/// A certificate that was revoked during the reporting period.
/// </summary>
public class RevocationHistoryEntry
{
    /// <summary>Serial number of the revoked certificate.</summary>
    public string SerialNumber { get; set; } = string.Empty;

    /// <summary>Subject DN of the revoked certificate.</summary>
    public string SubjectDN { get; set; } = string.Empty;

    /// <summary>Issuer of the revoked certificate.</summary>
    public string Issuer { get; set; } = string.Empty;

    /// <summary>Date the certificate was revoked.</summary>
    public DateTime? RevocationDate { get; set; }

    /// <summary>Reason for revocation.</summary>
    public string RevocationReason { get; set; } = string.Empty;
}

/// <summary>
/// A certificate issued during the reporting period.
/// </summary>
public class IssuanceHistoryEntry
{
    /// <summary>Serial number of the issued certificate.</summary>
    public string SerialNumber { get; set; } = string.Empty;

    /// <summary>Subject DN of the issued certificate.</summary>
    public string SubjectDN { get; set; } = string.Empty;

    /// <summary>Issuer of the certificate.</summary>
    public string Issuer { get; set; } = string.Empty;

    /// <summary>Date the certificate became valid (X.509 notBefore).</summary>
    public DateTime NotBefore { get; set; }

    /// <summary>Date the certificate expires.</summary>
    public DateTime NotAfter { get; set; }
}

/// <summary>
/// A certificate authority entry in the CA hierarchy section.
/// </summary>
public class CaHierarchyEntry
{
    /// <summary>Unique identifier of the CA.</summary>
    public Guid CaId { get; set; }

    /// <summary>Display name of the CA.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>CA type: Root, Intermediate, or Issuing.</summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>Whether the CA is currently enabled.</summary>
    public bool IsEnabled { get; set; }

    /// <summary>Parent CA identifier, null for root CAs.</summary>
    public Guid? ParentCaId { get; set; }

    /// <summary>Subject DN of the CA certificate.</summary>
    public string SubjectDN { get; set; } = string.Empty;
}

/// <summary>
/// Flat row representing a single certificate for CSV export.
/// </summary>
public class CertificateReportRow
{
    /// <summary>Certificate serial number.</summary>
    public string SerialNumber { get; set; } = string.Empty;

    /// <summary>Subject distinguished name.</summary>
    public string SubjectDN { get; set; } = string.Empty;

    /// <summary>Issuer distinguished name.</summary>
    public string Issuer { get; set; } = string.Empty;

    /// <summary>Key algorithm (e.g. RSA, ECDSA).</summary>
    public string Algorithm { get; set; } = string.Empty;

    /// <summary>Key size or curve name.</summary>
    public string KeySize { get; set; } = string.Empty;

    /// <summary>Certificate validity start date.</summary>
    public DateTime NotBefore { get; set; }

    /// <summary>Certificate expiry date.</summary>
    public DateTime NotAfter { get; set; }

    /// <summary>Current status: Active, Expired, or Revoked.</summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>Health score from 0 to 100.</summary>
    public int HealthScore { get; set; }

    /// <summary>Number of unresolved vulnerabilities.</summary>
    public int VulnerabilityCount { get; set; }
}
