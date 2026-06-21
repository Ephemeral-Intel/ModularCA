using Xunit;

namespace ModularCA.Tests.TestUtils;

/// <summary>
/// xUnit collection definition that disables parallel execution for tests touching process-wide
/// environment variables. Tests in this collection set <c>MODULARCA__JWT__SECRET</c> etc. via
/// <see cref="Environment.SetEnvironmentVariable"/>, so two concurrent tests would clobber each
/// other's setup. xUnit serializes within a collection.
/// </summary>
[CollectionDefinition(Name)]
public class EnvVarsCollection
{
    public const string Name = "EnvVars";
}
