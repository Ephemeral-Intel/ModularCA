using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Per-CA, per-protocol configuration. Controls which protocols are enabled
/// for a given CA and binds the signing / certificate profiles each protocol uses.
/// When no row exists for a CA + protocol pair the system falls back to the
/// global FeatureFlag configuration for backward compatibility.
/// </summary>
public class CaProtocolConfigEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid CaId { get; set; }

    [ForeignKey("CaId")]
    public virtual CertificateAuthorityEntity Ca { get; set; } = default!;

    /// <summary>
    /// Protocol identifier: "EST", "SCEP", "CMP", "ACME", "OCSP".
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Protocol { get; set; } = string.Empty;

    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Whether this protocol endpoint is shown on the public portal.
    /// When false, the endpoint still works but isn't advertised publicly.
    /// </summary>
    public bool IsPublicVisible { get; set; } = true;

    /// <summary>
    /// Signing profile used by this protocol for this CA.
    /// When null, falls back to the global FeatureFlag configuration.
    /// </summary>
    public Guid? SigningProfileId { get; set; }

    [ForeignKey("SigningProfileId")]
    public virtual SigningProfileEntity? SigningProfile { get; set; }

    /// <summary>
    /// Certificate profile used by this protocol for this CA.
    /// When null, falls back to the global FeatureFlag configuration.
    /// </summary>
    public Guid? CertProfileId { get; set; }

    [ForeignKey("CertProfileId")]
    public virtual CertProfileEntity? CertProfile { get; set; }

    // ─── EST-specific ──────────────────────────────────────────────

    /// <summary>
    /// When true, EST clients must present a valid client certificate for enrollment.
    /// </summary>
    public bool EstRequireClientCert { get; set; } = false;

    /// <summary>
    /// When true, EST accepts HTTP Basic/Digest authentication for enrollment.
    /// </summary>
    public bool EstHttpAuthEnabled { get; set; } = false;

    // ─── SCEP-specific ─────────────────────────────────────────────

    /// <summary>
    /// When true, SCEP enrollment requires a challenge password in the CSR.
    /// </summary>
    public bool ScepChallengeRequired { get; set; } = true;

    // ─── CMP-specific ──────────────────────────────────────────────

    /// <summary>
    /// When true, CMP messages must use signature-based protection (client cert required).
    /// When false, PBMAC (shared secret) protection is also accepted.
    /// </summary>
    public bool CmpRequireSignature { get; set; } = false;

    // ─── ACME-specific ─────────────────────────────────────────────

    /// <summary>
    /// When true, ACME accounts must provide an External Account Binding (EAB)
    /// during registration (RFC 8555 §7.3.4).
    /// </summary>
    public bool AcmeRequireEab { get; set; } = false;

    /// <summary>
    /// Comma-separated list of allowed ACME challenge types (e.g. "http-01,dns-01,tls-alpn-01").
    /// Empty means all challenge types are allowed.
    /// </summary>
    [MaxLength(255)]
    public string? AcmeAllowedChallengeTypes { get; set; }

    /// <summary>
    /// When true, the http-01 validator for this CA is permitted to resolve/connect
    /// to RFC 1918, loopback, and link-local addresses. Defaults to false — the
    /// validator refuses private address space to prevent a public ACME deployment
    /// from being tricked into validating against an internal host. Operators
    /// running ACME for private PKI flip this per-CA rather than globally.
    /// </summary>
    public bool AcmeAllowPrivateAddressValidation { get; set; } = false;

    // ─── OCSP-specific ─────────────────────────────────────────────

    /// <summary>
    /// When true, OCSP responses are signed. Should generally be true for production.
    /// </summary>
    public bool OcspSignResponses { get; set; } = true;

    // ─── Request Profile ──────────────────────────────────────────

    /// <summary>
    /// Optional request profile controlling what requesters can submit for this protocol.
    /// Null means no additional request validation (open enrollment).
    /// </summary>
    public Guid? RequestProfileId { get; set; }

    [ForeignKey("RequestProfileId")]
    public virtual RequestProfileEntity? RequestProfile { get; set; }
}
