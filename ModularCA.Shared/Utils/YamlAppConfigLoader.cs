using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace ModularCA.Shared.Utils
{
    /// <summary>
    /// Generic YAML configuration loader that deserializes a YAML file into a specified type.
    /// </summary>
    public static class YamlAppConfigLoader
    {
        /// <summary>
        /// Reads and deserializes a YAML file at the given path into the specified type T.
        /// </summary>
        public static T Load<T>(string path)
        {
            if (!File.Exists(path))
                throw new FileNotFoundException($"YAML config not found: {path}");

            var yaml = File.ReadAllText(path);

            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(CamelCaseNamingConvention.Instance)
                .IgnoreUnmatchedProperties()
                .Build();

            return deserializer.Deserialize<T>(yaml);
        }
    }
}