using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Acme;

namespace ModularCA.Core.Services.Acme;

/// <summary>
/// Parses, verifies, and validates ACME JWS (JSON Web Signature) request
/// payloads. Enforces an explicit JWS algorithm allow-list
/// (<c>RS256</c>, <c>ES256</c>, <c>ES384</c>, <c>PS256</c>) per RFC 8555 §6.2,
/// cross-checks <c>alg</c> vs the registered account key type, and implements
/// <c>PS256</c> with RSA-PSS padding.
/// </summary>
public class AcmeJwsService(IAcmeAccountService accountService, IAcmeNonceService nonceService) : IAcmeJwsService
{
    private readonly IAcmeAccountService _accountService = accountService;
    private readonly IAcmeNonceService _nonceService = nonceService;

    /// <summary>
    /// RFC 8555 §6.2 allow-list. Anything outside this set is
    /// rejected with <c>urn:ietf:params:acme:error:badSignatureAlgorithm</c>.
    /// </summary>
    public static readonly HashSet<string> AllowedAlgorithms = new(StringComparer.Ordinal)
    {
        "RS256", "PS256", "ES256", "ES384"
    };

    public async Task<AcmeJwsPayload> ParseAndVerifyAsync(string rawBody, string requestUrl)
    {
        var jws = JsonSerializer.Deserialize<JsonElement>(rawBody);

        var protectedB64 = jws.GetProperty("protected").GetString()
            ?? throw new InvalidOperationException("Missing protected header.");
        var payloadB64 = jws.GetProperty("payload").GetString()
            ?? throw new InvalidOperationException("Missing payload.");
        var signatureB64 = jws.GetProperty("signature").GetString()
            ?? throw new InvalidOperationException("Missing signature.");

        var headerJson = Encoding.UTF8.GetString(Base64UrlDecode(protectedB64));
        var header = JsonSerializer.Deserialize<JsonElement>(headerJson);

        var alg = header.GetProperty("alg").GetString()
            ?? throw new InvalidOperationException("Missing alg in protected header.");

        // Enforce the RFC 8555 algorithm allow-list before any
        // cryptographic work. Prefix with "badSignatureAlgorithm:" so the filter
        // can map the exception to the correct ACME problem type.
        if (!AllowedAlgorithms.Contains(alg))
            throw new InvalidOperationException($"badSignatureAlgorithm: Algorithm '{alg}' is not permitted. Allowed: {string.Join(", ", AllowedAlgorithms)}.");

        var url = header.TryGetProperty("url", out var urlProp) ? urlProp.GetString() : null;

        if (url != requestUrl)
            throw new InvalidOperationException("JWS url does not match request URL.");

        // Check if this is a new-account request (uses JWK, not kid) — nonce still recommended but some clients omit on first request
        bool hasKid = header.TryGetProperty("kid", out _);
        if (!header.TryGetProperty("nonce", out var nonceProp) || string.IsNullOrEmpty(nonceProp.GetString()))
        {
            if (hasKid) // Not a new-account request — nonce is required
                throw new InvalidOperationException("Nonce is required in ACME JWS protected header.");
        }
        else
        {
            var nonce = nonceProp.GetString()!;
            if (!await _nonceService.ConsumeAsync(nonce))
                throw new InvalidOperationException("Invalid or expired nonce.");
        }

        string? kid = header.TryGetProperty("kid", out var kidProp) ? kidProp.GetString() : null;
        JsonElement? jwk = header.TryGetProperty("jwk", out var jwkProp) ? jwkProp : null;

        if (kid != null && jwk != null)
            throw new InvalidOperationException("JWS must contain either kid or jwk, not both.");
        if (kid == null && jwk == null)
            throw new InvalidOperationException("JWS must contain kid or jwk.");

        var signingInput = Encoding.ASCII.GetBytes($"{protectedB64}.{payloadB64}");
        var signature = Base64UrlDecode(signatureB64);

        Guid? accountId = null;
        string? thumbprint = null;

        if (jwk != null)
        {
            VerifySignature(alg, jwk.Value, signingInput, signature);
            thumbprint = ComputeThumbprint(jwk.Value.GetRawText());
        }
        else if (kid != null)
        {
            var kidUri = new Uri(kid);
            var accountIdStr = kidUri.Segments.Last().TrimEnd('/');
            if (!Guid.TryParse(accountIdStr, out var parsedId))
                throw new InvalidOperationException("Invalid kid format.");

            var account = await _accountService.GetByIdAsync(parsedId)
                ?? throw new InvalidOperationException("Account not found.");

            accountId = account.Id;

            var acctJwkJson = await _accountService.GetJwkByIdAsync(parsedId)
                ?? throw new InvalidOperationException("Account JWK not found.");
            var acctJwk = JsonSerializer.Deserialize<JsonElement>(acctJwkJson);
            VerifySignature(alg, acctJwk, signingInput, signature);
            thumbprint = ComputeThumbprint(acctJwkJson);
        }

        return new AcmeJwsPayload
        {
            ProtectedHeader = headerJson,
            Payload = payloadB64.Length == 0 ? "" : Encoding.UTF8.GetString(Base64UrlDecode(payloadB64)),
            Signature = signatureB64,
            Kid = kid,
            Jwk = jwk,
            Nonce = nonceProp.ValueKind != JsonValueKind.Undefined ? nonceProp.GetString() : null,
            Url = url,
            AccountId = accountId,
            JwkThumbprint = thumbprint
        };
    }

    public string ComputeThumbprint(string jwkJson)
    {
        var jwk = JsonSerializer.Deserialize<JsonElement>(jwkJson);
        var kty = jwk.GetProperty("kty").GetString();

        string canonical;
        if (kty == "RSA")
        {
            var e = jwk.GetProperty("e").GetString();
            var n = jwk.GetProperty("n").GetString();
            canonical = $"{{\"e\":\"{e}\",\"kty\":\"RSA\",\"n\":\"{n}\"}}";
        }
        else if (kty == "EC")
        {
            var crv = jwk.GetProperty("crv").GetString();
            var x = jwk.GetProperty("x").GetString();
            var y = jwk.GetProperty("y").GetString();
            canonical = $"{{\"crv\":\"{crv}\",\"kty\":\"EC\",\"x\":\"{x}\",\"y\":\"{y}\"}}";
        }
        else
        {
            throw new InvalidOperationException($"Unsupported key type: {kty}");
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return Base64UrlEncode(hash);
    }

    /// <summary>
    /// Verifies a JWS signature using the specified JWK.
    /// </summary>
    public void VerifySignature(string protectedB64, string payloadB64, string signatureB64, string jwkJson)
    {
        var headerJson = Encoding.UTF8.GetString(Base64UrlDecode(protectedB64));
        var header = JsonSerializer.Deserialize<JsonElement>(headerJson);
        var alg = header.GetProperty("alg").GetString()
            ?? throw new InvalidOperationException("Missing alg in protected header.");

        var signingInput = Encoding.ASCII.GetBytes($"{protectedB64}.{payloadB64}");
        var signature = Base64UrlDecode(signatureB64);
        var jwk = JsonSerializer.Deserialize<JsonElement>(jwkJson);

        VerifySignature(alg, jwk, signingInput, signature);
    }

    /// <summary>
    /// Verifies a JWS signature after enforcing the RFC 8555
    /// algorithm allow-list and cross-checking that <paramref name="alg"/> is
    /// consistent with the JWK <c>kty</c> and (for EC keys) the named curve.
    /// <list type="bullet">
    /// <item><description><c>RS256</c>/<c>PS256</c> require <c>kty == "RSA"</c>.</description></item>
    /// <item><description><c>ES256</c> requires <c>kty == "EC"</c> and <c>crv == "P-256"</c>.</description></item>
    /// <item><description><c>ES384</c> requires <c>kty == "EC"</c> and <c>crv == "P-384"</c>.</description></item>
    /// <item><description><c>PS256</c> is verified with <see cref="RSASignaturePadding.Pss"/>.</description></item>
    /// </list>
    /// </summary>
    private static void VerifySignature(string alg, JsonElement jwk, byte[] signingInput, byte[] signature)
    {
        if (!AllowedAlgorithms.Contains(alg))
            throw new InvalidOperationException($"badSignatureAlgorithm: Algorithm '{alg}' is not permitted.");

        var kty = jwk.GetProperty("kty").GetString();

        // Cross-check: alg must match the account key type. An RSA key cannot
        // be verified with ES256, and an EC key cannot be verified with RS256.
        if (alg is "RS256" or "PS256")
        {
            if (kty != "RSA")
                throw new InvalidOperationException($"badSignatureAlgorithm: alg '{alg}' requires an RSA key, got '{kty}'.");

            var rsa = RSA.Create();
            var n = Base64UrlDecode(jwk.GetProperty("n").GetString()!);
            var e = Base64UrlDecode(jwk.GetProperty("e").GetString()!);
            rsa.ImportParameters(new RSAParameters { Modulus = n, Exponent = e });

            var padding = alg == "PS256" ? RSASignaturePadding.Pss : RSASignaturePadding.Pkcs1;
            if (!rsa.VerifyData(signingInput, signature, HashAlgorithmName.SHA256, padding))
                throw new InvalidOperationException("RSA signature verification failed.");
            return;
        }

        if (alg is "ES256" or "ES384")
        {
            if (kty != "EC")
                throw new InvalidOperationException($"badSignatureAlgorithm: alg '{alg}' requires an EC key, got '{kty}'.");

            var crv = jwk.GetProperty("crv").GetString();
            // Enforce ES256⇔P-256, ES384⇔P-384 pairing to
            // block curve/hash confusion.
            var (requiredCurve, hashAlg) = alg switch
            {
                "ES256" => ("P-256", HashAlgorithmName.SHA256),
                "ES384" => ("P-384", HashAlgorithmName.SHA384),
                _ => throw new InvalidOperationException($"badSignatureAlgorithm: Unsupported EC alg: {alg}")
            };
            if (crv != requiredCurve)
                throw new InvalidOperationException($"badSignatureAlgorithm: alg '{alg}' requires curve '{requiredCurve}', got '{crv}'.");

            var curve = requiredCurve switch
            {
                "P-256" => ECCurve.NamedCurves.nistP256,
                "P-384" => ECCurve.NamedCurves.nistP384,
                _ => throw new InvalidOperationException($"Unsupported curve: {requiredCurve}")
            };

            var x = Base64UrlDecode(jwk.GetProperty("x").GetString()!);
            var y = Base64UrlDecode(jwk.GetProperty("y").GetString()!);

            var ecdsa = ECDsa.Create(new ECParameters
            {
                Curve = curve,
                Q = new ECPoint { X = x, Y = y }
            });

            // JWS EC signatures are RFC 7515 IEEE P1363 concat form. Try that
            // first; fall back to DER for clients that send X.509/DSS form.
            if (!ecdsa.VerifyData(signingInput, signature, hashAlg))
            {
                if (!ecdsa.VerifyData(signingInput, signature, hashAlg, DSASignatureFormat.Rfc3279DerSequence))
                    throw new InvalidOperationException("ECDSA signature verification failed.");
            }
            return;
        }

        throw new InvalidOperationException($"badSignatureAlgorithm: Unsupported algorithm: {alg}");
    }

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }

    private static string Base64UrlEncode(byte[] input)
    {
        return Convert.ToBase64String(input)
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
