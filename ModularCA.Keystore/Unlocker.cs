using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Keystore.Config;
using ModularCA.Keystore.Crypto;
using ModularCA.Keystore.Services;
using ModularCA.Keystore.Utils;
using ModularCA.Shared.Utils;
using MySqlConnector;
using System.Security;
using System.Security.Cryptography;
using System.Text;

namespace ModularCA.Keystore;

/// <summary>
/// CLI tool that decrypts and displays or exports keystore entries. Verifies
/// the keystore's file-level signature against the pinned signing CA before decrypting any
/// entry, and refuses to write decrypted output to disk unless the operator passes
/// <c>--insecure-no-verify</c>. Without a DB-backed verification step, an attacker who
/// knows the passphrases could swap <c>keystores/ca-certs.keystore</c> and use the Unlocker
/// to extract attacker-controlled CA private keys.
/// </summary>
public static class Unlocker
{
    /// <summary>
    /// Parses command-line arguments and decrypts keystore entries to stdout or file. The
    /// default mode requires a DB-backed signature verification; <c>--insecure-no-verify</c>
    /// opts out explicitly and refuses to write decrypted output unless the flag is present.
    /// </summary>
    public static void Run(string[] args)
    {
        var path = GetArg(args, "--keystore") ?? throw new ArgumentException("Missing --keystore");
        var yamlPath = GetArg(args, "--yaml") ?? "config/keystore.yaml";
        var outputPath = GetArg(args, "--output"); // optional
        var print = args.Contains("--print");
        var insecureNoVerify = args.Contains("--insecure-no-verify");

        Console.WriteLine($"Loading keystore: {path}");

        var keystore = KeystoreFileParser.Parse(path);
        var keystoreName = Path.GetFileName(path);

        // Verify the file-level signature against the pinned signing CA unless
        // the operator explicitly opted out. The pin comes from the Keystores row in the app
        // DB; legacy rows fall through to the loud-warning "any IsCA cert" path in
        // FindValidSigner and the operator should run --backfill-keystore-pins --write to
        // close the gap.
        ModularCADbContext? db = null;
        try
        {
            if (!insecureNoVerify)
            {
                db = OpenAppDb();
                if (db == null)
                {
                    Console.Error.WriteLine(
                        "[ERROR] Unlocker could not open the app database. Re-run with " +
                        "--insecure-no-verify to force an offline decryption (will NOT write output " +
                        "unless that flag is set).");
                    Environment.Exit(1);
                    return;
                }

                var pinnedSpki = KeystoreService.GetPinnedSignerSpki(db, keystoreName);
                try
                {
                    KeystoreService.VerifyKeystoreFileSignature(path, db, pinnedSpki);
                }
                catch (SecurityException ex)
                {
                    Console.Error.WriteLine($"[ERROR] Keystore signature verification failed: {ex.Message}");
                    Console.Error.WriteLine("        Refusing to decrypt — pass --insecure-no-verify to override.");
                    Environment.Exit(2);
                    return;
                }

                Console.WriteLine("Keystore file-level signature verified against pinned CA.");
            }
            else
            {
                Console.Error.WriteLine(
                    "[WARNING] Unlocker running with --insecure-no-verify. Keystore signature is NOT checked; " +
                    "this mode exists for disaster recovery and must not be used in production.");
            }

            // Refuse to write decrypted plaintext key material to disk unless the
            // operator explicitly opted out via --insecure-no-verify. The file signature check
            // above doesn't make writing DER private keys to an arbitrary path safe by itself
            // (ACLs on the output directory are up to the operator), so the flag remains a
            // mandatory acknowledgement that the operator accepts the consequences.
            var writeRequested = !string.IsNullOrWhiteSpace(outputPath);
            if (writeRequested && !insecureNoVerify)
            {
                Console.Error.WriteLine(
                    "[ERROR] Unlocker refuses to write decrypted private keys to disk without " +
                    "--insecure-no-verify. Re-run with that flag to acknowledge the risk.");
                Environment.Exit(3);
                return;
            }

            var secondaryPass = KeystoreYamlLoader.LoadSecondaryPassphrase(yamlPath, Path.GetFileName(path));
            var mainPass = LoadMainPassphrase();

            byte[]? key = null;
            try
            {
                key = ScryptKeyDeriver.DeriveFileKey(mainPass, secondaryPass, keystore);

                foreach (var entry in keystore.Entries)
                {
                    byte[]? decrypted = null;
                    try
                    {
                        decrypted = AesGcmDecryptor.Decrypt(entry.Nonce, entry.Ciphertext, entry.Tag, key);

                        if (print || string.IsNullOrWhiteSpace(outputPath))
                        {
                            Console.WriteLine("Decrypted entry:\n");
                            Console.WriteLine(Encoding.UTF8.GetString(decrypted));
                        }
                        else
                        {
                            var outputName = outputPath!;
                            var numberedPath = keystore.Entries.Count > 1
                                ? Path.Combine(Path.GetDirectoryName(outputName)!, $"{Path.GetFileNameWithoutExtension(outputName)}_{keystore.Entries.IndexOf(entry)}{Path.GetExtension(outputName)}")
                                : outputName;

                            File.WriteAllBytes(numberedPath, decrypted);
                            FileSecurityUtil.SetOwnerOnly(numberedPath);
                            Console.WriteLine($"Decrypted entry written to: {numberedPath}");
                        }
                    }
                    finally
                    {
                        if (decrypted != null)
                            CryptographicOperations.ZeroMemory(decrypted);
                    }
                }
            }
            finally
            {
                if (key != null)
                    CryptographicOperations.ZeroMemory(key);
            }
        }
        finally
        {
            db?.Dispose();
        }
    }

    /// <summary>
    /// Opens a <see cref="ModularCADbContext"/> against the runtime app database using
    /// <c>config/config.yaml</c> + <c>config/db.yaml</c> — mirroring the loader path the API
    /// uses at startup. Returns null if the config files are missing (a brand-new install
    /// that has never been bootstrapped).
    /// </summary>
    private static ModularCADbContext? OpenAppDb()
    {
        try
        {
            var configDir = Path.Combine(AppContext.BaseDirectory, "config");
            var configPath = Path.Combine(configDir, "config.yaml");
            var dbYamlPath = Path.Combine(configDir, "db.yaml");
            if (!File.Exists(configPath))
                return null;

            var cfg = YamlConfigLoader.Load(configPath);
            if (File.Exists(dbYamlPath))
            {
                var dbYaml = YamlDbConfigLoader.Load(dbYamlPath);
                if (dbYaml != null)
                {
                    cfg.DB.App.Host = dbYaml.App.Host;
                    cfg.DB.App.Port = dbYaml.App.Port;
                    cfg.DB.App.Database = dbYaml.App.Database;
                    cfg.DB.App.Username = dbYaml.App.Username;
                    cfg.DB.App.Password = dbYaml.App.Password;
                    cfg.DB.App.SslMode = dbYaml.App.SslMode;
                }
            }

            // TLS-Required by default; unparseable values clamp to Required.
            var sslMode = Enum.TryParse<MySqlSslMode>(cfg.DB.App.SslMode, ignoreCase: true, out var _ssl)
                ? _ssl : MySqlSslMode.Required;
            var builder = new MySqlConnectionStringBuilder
            {
                Server = cfg.DB.App.Host,
                Port = (uint)cfg.DB.App.Port,
                Database = cfg.DB.App.Database,
                UserID = cfg.DB.App.Username,
                Password = cfg.DB.App.Password,
                SslMode = sslMode,
            };
            var connStr = builder.ConnectionString;
            var options = new DbContextOptionsBuilder<ModularCADbContext>()
                .UseMySql(connStr, ServerVersion.AutoDetect(connStr))
                .Options;
            return new ModularCADbContext(options);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WARNING] Unlocker failed to open app DB for signature verification: {ex.Message}");
            return null;
        }
    }

    private static string? GetArg(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        return index >= 0 && index < args.Length - 1 ? args[index + 1] : null;
    }

    private static string LoadMainPassphrase()
    {
        Console.Write("Enter main passphrase: ");
        return Console.ReadLine() ?? throw new Exception("Main passphrase is required");
    }
}
