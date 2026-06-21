using ModularCA.Shared.Models.Config;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace ModularCA.Shared.Utils;

/// <summary>
/// Loads system configuration from a YAML file into a SystemConfig object.
/// </summary>
public static class YamlConfigLoader
{
    /// <summary>
    /// Reads and deserializes a YAML configuration file at the given path.
    /// </summary>
    public static SystemConfig Load(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException($"YAML config file not found: {path}");

        var yaml = File.ReadAllText(path);

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(PascalCaseNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        return deserializer.Deserialize<SystemConfig>(yaml);
    }
}