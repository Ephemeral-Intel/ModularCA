namespace ModularCA.Shared.Enums;

/// <summary>
/// RFC 5280 §5.3.1 revocation reason codes used by CRLs and OCSP. The enum values match the
/// CRLReason ASN.1 enumeration ordering and BouncyCastle's <c>CrlReason</c> integer constants
/// (and therefore must stay in that exact order). Replaces the legacy free-text
/// <c>CertificateEntity.RevocationReason</c> string surface (legacy).
/// </summary>
/// <remarks>
/// <para>Revocation reasons are now strictly validated at API entry
/// via <see cref="System.ComponentModel.DataAnnotations.EnumDataTypeAttribute"/> on the request
/// DTOs and round-tripped through <c>CertificateEntity.RevocationReason</c> as the enum name.
/// Unknown values at CRL build time throw instead of silently falling through to
/// <see cref="Unspecified"/>.</para>
/// <para>Value <c>7</c> is explicitly unassigned per RFC 5280 §5.3.1 and is therefore omitted.</para>
/// </remarks>
public enum RevocationReason
{
    /// <summary>No specific reason given (reason code 0).</summary>
    Unspecified = 0,

    /// <summary>Subscriber key compromise (reason code 1).</summary>
    KeyCompromise = 1,

    /// <summary>Issuing CA key compromise (reason code 2).</summary>
    CACompromise = 2,

    /// <summary>Affiliation changed (reason code 3).</summary>
    AffiliationChanged = 3,

    /// <summary>Certificate superseded by a replacement (reason code 4).</summary>
    Superseded = 4,

    /// <summary>Cessation of operation (reason code 5).</summary>
    CessationOfOperation = 5,

    /// <summary>Certificate on temporary hold (reason code 6).</summary>
    CertificateHold = 6,

    /// <summary>Privilege withdrawn (reason code 9).</summary>
    PrivilegeWithdrawn = 9,

    /// <summary>Attribute authority compromise (reason code 10).</summary>
    AaCompromise = 10,
}
