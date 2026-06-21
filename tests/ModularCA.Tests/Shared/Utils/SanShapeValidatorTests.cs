using ModularCA.Shared.Utils;
using Xunit;

namespace ModularCA.Tests.Shared.Utils;

/// <summary>
/// Covers <see cref="SanShapeValidator"/>: IP/DNS shape checks that prevent the
/// downstream BouncyCastle <c>ArgumentException("IP Address is invalid")</c> when
/// a user accidentally enters a hostname into an IP-typed SAN (or vice versa).
/// </summary>
public class SanShapeValidatorTests
{
    [Theory]
    [InlineData("0.0.0.0")]
    [InlineData("127.0.0.1")]
    [InlineData("10.0.0.1")]
    [InlineData("192.168.1.1")]
    [InlineData("255.255.255.255")]
    public void IsValidIp_AcceptsValidIPv4(string value)
        => Assert.True(SanShapeValidator.IsValidIp(value));

    [Theory]
    [InlineData("::1")]
    [InlineData("::")]
    [InlineData("2001:db8::1")]
    [InlineData("fe80::1")]
    [InlineData("2001:0db8:85a3:0000:0000:8a2e:0370:7334")]
    [InlineData("::ffff:192.168.1.1")]
    public void IsValidIp_AcceptsValidIPv6(string value)
        => Assert.True(SanShapeValidator.IsValidIp(value));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-an-ip")]
    [InlineData("example.com")]
    [InlineData("256.256.256.256")]
    [InlineData("1.2.3")]
    [InlineData("1.2.3.4.5")]
    [InlineData("g001::1")]
    public void IsValidIp_RejectsInvalid(string value)
        => Assert.False(SanShapeValidator.IsValidIp(value));

    [Theory]
    [InlineData("example.com")]
    [InlineData("sub.example.com")]
    [InlineData("a.b.c.d.e.f.example.com")]
    [InlineData("xn--n3h.example")] // IDN punycode
    [InlineData("_acme-challenge.example.com")]
    [InlineData("*.example.com")]
    [InlineData("host123.example.com")]
    [InlineData("example.com.")] // trailing dot tolerated
    public void IsValidFqdn_AcceptsValid(string value)
        => Assert.True(SanShapeValidator.IsValidFqdn(value));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("*")]
    [InlineData("-bad.example.com")]
    [InlineData("bad-.example.com")]
    [InlineData(".example.com")]
    [InlineData("ex..ample.com")]
    [InlineData("192.168.1.1")] // IPs are not FQDNs in our shape model
    [InlineData("space here.example.com")]
    public void IsValidFqdn_RejectsInvalid(string value)
        => Assert.False(SanShapeValidator.IsValidFqdn(value));

    [Fact]
    public void IsValidFqdn_RejectsLabelOver63Chars()
    {
        var label = new string('a', 64);
        Assert.False(SanShapeValidator.IsValidFqdn($"{label}.example.com"));
    }

    [Fact]
    public void IsValidFqdn_AcceptsLabelExactly63Chars()
    {
        var label = new string('a', 63);
        Assert.True(SanShapeValidator.IsValidFqdn($"{label}.example.com"));
    }

    [Fact]
    public void IsValidFqdn_RejectsTotalOver253Chars()
    {
        // 17 labels of 14 = 238 + 16 dots = 254 chars total → just over the limit.
        var label = new string('a', 14);
        var name = string.Join(".", Enumerable.Repeat(label, 17));
        Assert.True(name.Length >= 254);
        Assert.False(SanShapeValidator.IsValidFqdn(name));
    }

    [Theory]
    [InlineData("IP", "192.168.1.1", null)]
    [InlineData("IP", "::1", null)]
    [InlineData("DNS", "example.com", null)]
    [InlineData("DNS", "*.example.com", null)]
    [InlineData("dns", "example.com", null)] // case-insensitive
    [InlineData("ip", "10.0.0.1", null)]
    [InlineData("RFC822", "user@example.com", null)] // not shape-checked
    [InlineData("URI", "https://example.com", null)] // not shape-checked
    [InlineData("", "anything", null)] // empty type → no check
    public void ValidateShape_ReturnsNullForOk(string type, string value, string? expected)
        => Assert.Equal(expected, SanShapeValidator.ValidateShape(type, value));

    // The bug from the user's stack trace: a hostname placed into an IP-typed SAN
    // would let BouncyCastle throw "IP Address is invalid". Now caught at validation.
    [Fact]
    public void ValidateShape_DetectsHostnameInIpField()
    {
        var err = SanShapeValidator.ValidateShape("IP", "example.com");
        Assert.NotNull(err);
        Assert.Contains("IPv4 or IPv6", err);
    }

    // The reverse: an IP placed into a DNS-typed SAN would still construct a valid
    // GeneralName but produce a confusing cert. We treat it as invalid shape since
    // FQDN labels can't be all-numeric (RFC 1123 allows it loosely, but for SAN
    // intent IP-into-DNS is almost always a mistake).
    [Fact]
    public void ValidateShape_DetectsIpInDnsField()
    {
        var err = SanShapeValidator.ValidateShape("DNS", "192.168.1.1");
        Assert.NotNull(err);
        Assert.Contains("FQDN", err);
    }
}
