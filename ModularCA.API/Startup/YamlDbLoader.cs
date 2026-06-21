using ModularCA.Shared.Models.Config;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace ModularCA.API.Startup;

/// <summary>
/// Loads database connection configuration from a YAML file.
/// </summary>
public static class YamlDbLoader
{
    /// <summary>
    /// Reads and deserializes the database configuration from the specified YAML file.
    /// </summary>
    public static DbConfig Load(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException($"YAML config file not found: {path}");

        var yaml = File.ReadAllText(path);

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(CamelCaseNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        return deserializer.Deserialize<DbConfig>(yaml);
    }
}