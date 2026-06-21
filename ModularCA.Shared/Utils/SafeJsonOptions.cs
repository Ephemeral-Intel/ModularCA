using System.Text.Json;

namespace ModularCA.Shared.Utils
{
    /// <summary>
    /// Central <see cref="JsonSerializerOptions"/> instance used for deserializing
    /// JSON blobs stored on CSR and profile entities. Sets a conservative
    /// <c>MaxDepth</c> cap to block denial-of-service amplification via deeply
    /// nested payloads.
    /// </summary>
    public static class SafeJsonOptions
    {
        /// <summary>
        /// Shared read-only options with <c>MaxDepth = 16</c> and a small default
        /// buffer. Safe to pass to <see cref="JsonSerializer.Deserialize{T}(string, JsonSerializerOptions?)"/>
        /// from any caller.
        /// </summary>
        public static readonly JsonSerializerOptions Default = new()
        {
            MaxDepth = 16,
            DefaultBufferSize = 4096
        };
    }
}
