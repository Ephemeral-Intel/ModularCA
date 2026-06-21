using ModularCA.Shared.Utils;
using Xunit;

namespace ModularCA.Tests.Shared.Utils;

/// <summary>
/// Pins the RSA size allow-list in <see cref="KeyAlgorithmPolicy"/>. The policy is the
/// single source of truth that controllers, CSR validators, and the issuance pipeline
/// all consult — drift here breaks intent at every gate.
/// </summary>
public class KeyAlgorithmPolicyTests
{
    [Theory]
    [InlineData("2048")]
    [InlineData("3072")]
    [InlineData("4096")]
    [InlineData("7680")]
    [InlineData("8192")]
    public void IsAllowed_AcceptsSupportedRsaSizes(string size)
        => Assert.True(KeyAlgorithmPolicy.IsAllowed("RSA", size));

    [Theory]
    [InlineData("1024")] // below CABF BR floor
    [InlineData("1536")]
    [InlineData("6144")] 
    [InlineData("16384")]
    [InlineData("")]
    [InlineData("abc")]
    public void IsAllowed_RejectsUnsupportedRsaSizes(string size)
        => Assert.False(KeyAlgorithmPolicy.IsAllowed("RSA", size));

    [Theory]
    [InlineData("RSA", 2048)]
    [InlineData("RSA", 3072)]
    [InlineData("RSA", 4096)]
    [InlineData("RSA", 7680)]
    [InlineData("RSA", 8192)]
    public void IsAllowed_IntOverload_AcceptsSupportedRsa(string alg, int size)
        => Assert.True(KeyAlgorithmPolicy.IsAllowed(alg, size));
}
