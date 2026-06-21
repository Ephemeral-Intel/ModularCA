namespace ModularCA.API.Startup;

/// <summary>
/// Controls whether the setup wizard accepts connections from RFC 1918 private networks
/// in addition to localhost. Set via the <c>--setup-local</c> CLI flag.
/// When disabled (default), only loopback addresses are allowed.
/// When enabled, private network ranges (10.x, 172.16-31.x, 192.168.x) are also accepted.
/// </summary>
internal static class SetupNetworkMode
{
    private static bool _allowPrivateNetworks;

    /// <summary>
    /// Enables access from RFC 1918 private network addresses.
    /// Called from startup when <c>--setup-local</c> is present.
    /// </summary>
    public static void AllowPrivateNetworks() => _allowPrivateNetworks = true;

    /// <summary>
    /// Returns true if private network access is enabled via <c>--setup-local</c>.
    /// </summary>
    public static bool IsPrivateNetworkAllowed => _allowPrivateNetworks;
}
