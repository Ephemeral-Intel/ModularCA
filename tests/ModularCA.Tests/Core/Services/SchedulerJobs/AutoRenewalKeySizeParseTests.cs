using ModularCA.Core.Services.SchedulerJobs;
using Xunit;

namespace ModularCA.Tests.Core.Services.SchedulerJobs;

/// <summary>
/// Tests for <see cref="AutoRenewalJob.ParseKeySizeToInt"/>. The helper sits between the
/// auto-renewal scan and <c>ICsrService.GenerateInfrastructureCsrAsync</c>; a regression
/// here mismaps a P-curve to the wrong bit size and silently issues renewals on a smaller
/// key than the original.
/// </summary>
public class AutoRenewalKeySizeParseTests
{
    [Theory]
    [InlineData("ECDSA", "P-256", 256)]
    [InlineData("ECDSA", "P-384", 384)]
    [InlineData("ECDSA", "P-521", 521)]
    public void ECDSA_P_Curve_Names_Map_To_Bit_Sizes(string algo, string keySize, int expected)
    {
        Assert.Equal(expected, AutoRenewalJob.ParseKeySizeToInt(algo, keySize));
    }

    [Theory]
    [InlineData("ecdsa", "p-256", 256)]
    [InlineData("ECDSA", "p-384", 384)]
    [InlineData("EcDsA", "P-521", 521)]
    public void ECDSA_Curve_Names_Are_Case_Insensitive(string algo, string keySize, int expected)
    {
        Assert.Equal(expected, AutoRenewalJob.ParseKeySizeToInt(algo, keySize));
    }

    [Theory]
    [InlineData("RSA", "2048", 2048)]
    [InlineData("RSA", "3072", 3072)]
    [InlineData("RSA", "4096", 4096)]
    public void RSA_Returns_Direct_Integer_Parse(string algo, string keySize, int expected)
    {
        Assert.Equal(expected, AutoRenewalJob.ParseKeySizeToInt(algo, keySize));
    }

    [Fact]
    public void Empty_KeySize_With_ECDSA_Defaults_To_256()
    {
        // P-256 is a sane fallback for ECDSA when the original CSR didn't record a curve.
        Assert.Equal(256, AutoRenewalJob.ParseKeySizeToInt("ECDSA", ""));
    }

    [Fact]
    public void Empty_KeySize_With_NonECDSA_Defaults_To_2048()
    {
        // 2048-bit RSA is the conservative fallback the rest of the codebase assumes.
        Assert.Equal(2048, AutoRenewalJob.ParseKeySizeToInt("RSA", ""));
        Assert.Equal(2048, AutoRenewalJob.ParseKeySizeToInt("Ed25519", ""));
    }

    [Fact]
    public void Whitespace_KeySize_Defaults_Same_As_Empty()
    {
        Assert.Equal(256, AutoRenewalJob.ParseKeySizeToInt("ECDSA", "   "));
        Assert.Equal(2048, AutoRenewalJob.ParseKeySizeToInt("RSA", "\t"));
    }

    [Fact]
    public void Garbage_KeySize_Defaults_By_Algorithm()
    {
        Assert.Equal(256, AutoRenewalJob.ParseKeySizeToInt("ECDSA", "not-a-curve"));
        Assert.Equal(2048, AutoRenewalJob.ParseKeySizeToInt("RSA", "not-a-number"));
    }

    [Fact]
    public void ECDSA_With_Numeric_KeySize_Falls_Through_To_Integer_Parse()
    {
        // Some legacy callers stored "256" (no P- prefix) for ECDSA. The helper should
        // honor it to stay backwards-compatible with old CSR records.
        Assert.Equal(256, AutoRenewalJob.ParseKeySizeToInt("ECDSA", "256"));
        Assert.Equal(384, AutoRenewalJob.ParseKeySizeToInt("ECDSA", "384"));
    }
}
