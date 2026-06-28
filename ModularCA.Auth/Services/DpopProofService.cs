using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Distributed;

namespace ModularCA.Auth.Services;

/// <summary>
/// Validates DPoP-style proof-of-possession JWTs (RFC 9449, scoped to refresh/token-issuing
/// endpoints). The client holds a non-extractable WebCrypto ECDSA P-256 key and signs a short-lived
/// proof per request; the server verifies it and returns the key's JWK SHA-256 thumbprint (RFC 7638),
/// which refresh tokens are bound to. A stolen refresh token is then useless without the private key,
/// which cannot be exfiltrated from the browser. Cross-platform: pure web-crypto + .NET ECDsa, no TPM.
/// </summary>
public interface IDpopProofService
{
    /// <summary>
    /// Reads and validates the <c>DPoP</c> header on the current request. Returns the bound key's
    /// JWK thumbprint when the proof is valid (correct signature, method/path, fresh, non-replayed),
    /// or null when no proof is present or it fails validation. Never throws.
    /// </summary>
    Task<string?> GetValidatedJktAsync(HttpContext context, CancellationToken ct = default);
}

/// <inheritdoc />
public sealed class DpopProofService : IDpopProofService
{
    private readonly IDistributedCache _cache;
    // iat acceptance + single-use replay window. Generous enough to tolerate moderate client clock
    // skew (a too-tight window would lock out a legitimately-bound session), tight enough that a
    // captured proof — already single-use via its jti — has a short life.
    private static readonly TimeSpan ProofMaxAge = TimeSpan.FromSeconds(300);

    public DpopProofService(IDistributedCache cache) => _cache = cache;

    /// <inheritdoc />
    public async Task<string?> GetValidatedJktAsync(HttpContext context, CancellationToken ct = default)
    {
        var header = context.Request.Headers["DPoP"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(header)) return null;

        try
        {
            var parts = header.Split('.');
            if (parts.Length != 3) return null;

            using var headerDoc = JsonDocument.Parse(B64UrlDecode(parts[0]));
            var head = headerDoc.RootElement;
            if (GetStr(head, "typ") != "dpop+jwt" || GetStr(head, "alg") != "ES256") return null;
            if (!head.TryGetProperty("jwk", out var jwk)) return null;
            if (GetStr(jwk, "kty") != "EC" || GetStr(jwk, "crv") != "P-256") return null;
            var x = GetStr(jwk, "x");
            var y = GetStr(jwk, "y");
            if (string.IsNullOrEmpty(x) || string.IsNullOrEmpty(y)) return null;

            using var payloadDoc = JsonDocument.Parse(B64UrlDecode(parts[1]));
            var payload = payloadDoc.RootElement;

            // Method + path binding (host left lenient so reverse proxies don't break the proof).
            if (!string.Equals(GetStr(payload, "htm"), context.Request.Method, StringComparison.OrdinalIgnoreCase)) return null;
            var htu = GetStr(payload, "htu");
            if (string.IsNullOrEmpty(htu) || !Uri.TryCreate(htu, UriKind.Absolute, out var htuUri)) return null;
            // Endpoint binding — tolerate a reverse-proxy PathBase prefix on either side so a path
            // rewrite can't lock every client out; the key-possession + single-use jti are the core.
            var reqPath = context.Request.Path.Value ?? string.Empty;
            var htuPath = htuUri.AbsolutePath;
            if (!(string.Equals(htuPath, reqPath, StringComparison.Ordinal)
                  || reqPath.EndsWith(htuPath, StringComparison.Ordinal)
                  || htuPath.EndsWith(reqPath, StringComparison.Ordinal))) return null;

            // Freshness window.
            if (!payload.TryGetProperty("iat", out var iatEl) || !iatEl.TryGetInt64(out var iat)) return null;
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (Math.Abs(now - iat) > ProofMaxAge.TotalSeconds) return null;

            // Single-use: reject replayed jti within the freshness window.
            var jti = GetStr(payload, "jti");
            if (string.IsNullOrEmpty(jti)) return null;
            var replayKey = $"dpop:jti:{jti}";
            if (await _cache.GetAsync(replayKey, ct) != null) return null;

            // Signature: ES256 over "header.payload" with the embedded public key (raw r||s).
            using var ecdsa = ECDsa.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = B64UrlDecode(x), Y = B64UrlDecode(y) },
            });
            var signingInput = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
            var signature = B64UrlDecode(parts[2]);
            if (!ecdsa.VerifyData(signingInput, signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
                return null;

            // Mark the jti consumed for the rest of the freshness window.
            await _cache.SetAsync(replayKey, new byte[] { 1 },
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ProofMaxAge }, ct);

            return ComputeJkt(x, y);
        }
        catch
        {
            // Malformed proof = treated as "no proof". Never throws into the auth pipeline.
            return null;
        }
    }

    /// <summary>RFC 7638 JWK thumbprint for an EC P-256 public key: base64url(SHA-256(canonical JWK)).</summary>
    private static string ComputeJkt(string x, string y)
    {
        // Canonical JWK: members in lexicographic order (crv, kty, x, y), no whitespace.
        var canonical = $"{{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"{x}\",\"y\":\"{y}\"}}";
        return B64UrlEncode(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    private static string? GetStr(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static byte[] B64UrlDecode(string s)
    {
        var t = s.Replace('-', '+').Replace('_', '/');
        switch (t.Length % 4) { case 2: t += "=="; break; case 3: t += "="; break; }
        return Convert.FromBase64String(t);
    }

    private static string B64UrlEncode(byte[] b) =>
        Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
