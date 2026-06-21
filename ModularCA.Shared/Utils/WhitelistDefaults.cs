namespace ModularCA.Shared.Utils;

/// <summary>
/// Compile-time constants for the IP whitelist subsystem. Centralizing these
/// here guarantees the pre-bootstrap hardcoded fallback (used while the
/// <c>Whitelists</c> table does not yet exist) and the post-bootstrap seeder
/// insert byte-identical CIDR lists. If you change one, you change both.
/// </summary>
public static class WhitelistDefaults
{
    /// <summary>
    /// RFC1918 private ranges, IPv4 loopback, IPv6 loopback, IPv6 unique
    /// local addresses, and IPv6 link-local. Used as the default value for
    /// the <c>System</c>, <c>Setup</c>, and <c>Api</c> scope seed rows, and
    /// as the pre-bootstrap hardcoded fallback for <c>/setup/*</c> paths
    /// when the whitelist service has not yet warmed from the database.
    /// </summary>
    public static readonly IReadOnlyList<string> InternalOnlyCidrs = new[]
    {
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "127.0.0.0/8",
        "::1/128",
        "fc00::/7",
        "fe80::/10",
    };

    /// <summary>
    /// Open allow-list covering every IPv4 and IPv6 address. Used as the
    /// default value for the <c>Auth</c> scope seed row so remote admin
    /// login works out of the box; operators can tighten it explicitly from
    /// the admin UI after bootstrap.
    /// </summary>
    public static readonly IReadOnlyList<string> AllAddressesCidrs = new[]
    {
        "0.0.0.0/0",
        "::/0",
    };
}
