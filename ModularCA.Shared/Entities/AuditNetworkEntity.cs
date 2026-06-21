using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Audit record for all network requests to protocol and admin endpoints.
/// Captures HTTP method, status code, response time, and whether the request was blocked.
/// </summary>
[Table("AuditNetwork")]
public class AuditNetworkEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>UTC timestamp when the request was received.</summary>
    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>Client IP address (IPv4 or IPv6).</summary>
    [Required]
    [MaxLength(45)]
    public string SourceIp { get; set; } = string.Empty;

    /// <summary>The HTTP request path.</summary>
    [Required]
    [MaxLength(500)]
    public string RequestPath { get; set; } = string.Empty;

    /// <summary>Detected protocol (EST, SCEP, CMP, ACME, OCSP, TSA, CRL, CA, ADMIN), or null.</summary>
    [MaxLength(20)]
    public string? Protocol { get; set; }

    /// <summary>CA label extracted from the request path, if applicable.</summary>
    [MaxLength(255)]
    public string? CaLabel { get; set; }

    /// <summary>Reason for blocking, or empty/null for allowed requests.</summary>
    [MaxLength(255)]
    public string Reason { get; set; } = string.Empty;

    /// <summary>The User-Agent header value.</summary>
    [MaxLength(500)]
    public string? UserAgent { get; set; }

    /// <summary>HTTP method (GET, POST, etc.).</summary>
    [MaxLength(10)]
    public string HttpMethod { get; set; } = string.Empty;

    /// <summary>HTTP response status code (e.g. 200, 403, 500).</summary>
    public int StatusCode { get; set; }

    /// <summary>Request duration in milliseconds, or null if not measured.</summary>
    public long? ResponseTimeMs { get; set; }

    /// <summary>True if the request was blocked by IP whitelist enforcement.</summary>
    public bool Blocked { get; set; }

    /// <summary>Certificate Authority ID for CA-scoped audit filtering.</summary>
    public Guid? CertificateAuthorityId { get; set; }

    /// <summary>Tenant ID for tenant-scoped audit filtering.</summary>
    public Guid? TenantId { get; set; }
}
