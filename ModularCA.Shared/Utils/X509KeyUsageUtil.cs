using Org.BouncyCastle.X509;

namespace ModularCA.Shared.Utils
{
    /// <summary>
    /// Utility for parsing comma-separated X.509 key usage names into BouncyCastle flags.
    /// </summary>
    public static class X509KeyUsageUtil
    {
        /// <summary>
        /// Parses a CSV string of key usage names and returns the combined BouncyCastle key usage flags.
        /// </summary>
        public static int ParseKeyUsages(string usageCsv)
        {
            int flags = 0;
            foreach (var usage in usageCsv.Split(',').Select(u => u.Trim().ToLower()))
            {
                flags |= usage switch
                {
                    "digital signature" => X509KeyUsage.DigitalSignature,
                    "non repudiation" => X509KeyUsage.NonRepudiation,
                    "key encipherment" => X509KeyUsage.KeyEncipherment,
                    "data encipherment" => X509KeyUsage.DataEncipherment,
                    "key agreement" => X509KeyUsage.KeyAgreement,
                    "key cert sign" => X509KeyUsage.KeyCertSign,
                    "crl sign" => X509KeyUsage.CrlSign,
                    "encipher only" => X509KeyUsage.EncipherOnly,
                    "decipher only" => X509KeyUsage.DecipherOnly,
                    _ => 0
                };
            }
            return flags;
        }
    }
}
