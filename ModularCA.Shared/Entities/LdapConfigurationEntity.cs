using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

[Table("LdapConfigurations")]
public class LdapConfigurationEntity
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    public string? Name { get; set; } = string.Empty;

    public bool Enabled { get; set; } = false;
    public string? Description { get; set; } = string.Empty;
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 389;
    public bool UseSsl { get; set; } = false;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string BaseDn { get; set; } = string.Empty;
    /// <summary>FK to the certificate authority this LDAP publisher belongs to.</summary>
    public Guid CertificateAuthorityId { get; set; }

    public bool PublishCACert { get; set; } = false;
    public bool PublishCRL { get; set; } = false;

    /// <summary>When true, delta CRLs are published alongside the full CRL.</summary>
    public bool PublishDelta { get; set; } = false;

    /// <summary>When true, recently-issued end-entity certificates are published to LDAP user entries.</summary>
    public bool PublishUserCerts { get; set; } = false;

    /// <summary>
    /// Template used to derive the target LDAP DN for a user certificate.
    /// Use <c>{email}</c> for the subject email and <c>{cn}</c> for the subject CN.
    /// Example: <c>uid={email},ou=People,dc=example,dc=com</c>.
    /// </summary>
    public string? UserDnTemplate { get; set; }

    public string UpdateInterval { get; set; } = string.Empty;
    public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Default of <see cref="DateTime.MinValue"/> means a freshly-created LDAP publisher row is
    /// already past-due and will be picked up by the scheduler on its next poll (within 30s).
    /// Otherwise a newly-configured publisher would not push the first CA cert / CRL set for an
    /// hour after creation, mismatching the operator's expectation that "Save" means "publish
    /// soon". After the first run, <see cref="LdapPublisherJob.ExecuteRowAsync"/> advances this
    /// to the next cron occurrence.
    /// </summary>
    public DateTime NextUpdateUtc { get; set; } = DateTime.MinValue;

}
