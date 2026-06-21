using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ModularCA.Shared.Entities;

/// <summary>
/// Global LDAP publisher job policy — master gate for <c>LdapPublisherJob</c>
/// dispatch plus tunables applied to every publisher run. Per-CA per-directory
/// publisher configs (connection, bind credentials, publish targets) live on
/// <see cref="LdapConfigurationEntity"/> in the <c>LdapConfigurations</c> table.
/// Single-row entity — same pattern as <see cref="PasswordPolicyEntity"/>.
/// </summary>
[Table("LdapPublisherPolicy")]
public class LdapPublisherPolicyEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>
    /// Master gate. When <c>false</c> the <c>SchedulerService</c> skips
    /// <c>LdapPublisherJob</c> dispatch entirely regardless of how many
    /// <see cref="LdapConfigurationEntity"/> rows exist.
    /// </summary>
    public bool Enabled { get; set; } = false;

    /// <summary>
    /// Fallback "publish recent certs since" window in hours, used when the
    /// <see cref="LdapConfigurationEntity.LastUpdatedUtc"/> on a row is missing
    /// or zero. Defaults to 1 hour.
    /// </summary>
    public int SinceFallbackHours { get; set; } = 1;

    /// <summary>
    /// LDAP connection timeout in seconds for bind + publish operations.
    /// Caps the blocking time on an unresponsive directory server. Default 30 s.
    /// </summary>
    public int ConnectionTimeoutSeconds { get; set; } = 30;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
