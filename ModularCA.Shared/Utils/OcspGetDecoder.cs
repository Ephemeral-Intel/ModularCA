namespace ModularCA.Shared.Utils;

/// <summary>
/// Shared decoder for OCSP GET URL segments. RFC 6960 §A.1 allows
/// standard base64 or base64url for the encoded DER OCSPRequest; both the
/// <see cref="ModularCA.API.Controllers.v1.Public"/> main OCSP controller and the
/// public short-URL controller must decode identically and return a consistent
/// 400 on malformed input (never a 500 with stack trace).
/// </summary>
public static class OcspGetDecoder
{
    /// <summary>
    /// Decodes a base64 / base64url encoded OCSP GET URL segment into its DER bytes.
    /// Returns <c>false</c> when the input is malformed; callers should respond with
    /// HTTP 400 in that case.
    /// </summary>
    /// <param name="encodedRequest">The URL-segment value (may be base64 or base64url).</param>
    /// <param name="derRequest">Set to the decoded DER bytes on success; <c>null</c> on failure.</param>
    /// <returns><c>true</c> when decoding succeeded; <c>false</c> otherwise.</returns>
    public static bool TryDecode(string? encodedRequest, out byte[]? derRequest)
    {
        derRequest = null;
        if (string.IsNullOrEmpty(encodedRequest)) return false;

        // Reject control characters + NUL bytes before going near Convert.FromBase64String.
        foreach (var c in encodedRequest)
        {
            if (char.IsControl(c)) return false;
        }

        try
        {
            var padded = encodedRequest
                .Replace('-', '+')
                .Replace('_', '/');

            switch (padded.Length % 4)
            {
                case 2: padded += "=="; break;
                case 3: padded += "="; break;
            }

            derRequest = System.Convert.FromBase64String(padded);
            return derRequest.Length > 0;
        }
        catch (System.FormatException)
        {
            return false;
        }
    }
}
