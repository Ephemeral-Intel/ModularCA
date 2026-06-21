using ModularCA.Bootstrap;
using Xunit;

namespace ModularCA.Tests.Bootstrap;

/// <summary>
/// Pins the my.cnf option-file format <see cref="BackupRestore.WriteMysqlDefaultsFile"/>
/// emits. The original implementation wrote <c>password={raw}</c> unquoted, which silently
/// truncated any password containing <c>#</c> at the comment delimiter — producing a
/// confusing <c>Access denied (using password: YES)</c> when mysqldump tried to authenticate
/// with the truncated fragment. <see cref="ModularCA.Auth.Utils.PasswordUtil.Generate"/>'s
/// symbol set includes <c>#</c>, so this was an intermittent real-world failure. The new
/// implementation wraps the password in double quotes and escapes <c>\</c> and <c>"</c>.
/// </summary>
public class WriteMysqlDefaultsFileTests
{
    [Fact]
    public void Writes_PasswordWithHash_QuotedSoMyCnfDoesNotTruncate()
    {
        var path = BackupRestore.WriteMysqlDefaultsFile("localhost", 3306, "modularca_app", "Abc#123!def");
        try
        {
            var content = File.ReadAllText(path);
            // Must be wrapped so '#' is not a comment delimiter.
            Assert.Contains("password=\"Abc#123!def\"", content);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Writes_PasswordWithBackslashAndQuote_EscapedInsideQuotes()
    {
        var path = BackupRestore.WriteMysqlDefaultsFile("localhost", 3306, "u", "a\\b\"c");
        try
        {
            var content = File.ReadAllText(path);
            // Backslash and double-quote must be escaped per MySQL option-file rules.
            Assert.Contains("password=\"a\\\\b\\\"c\"", content);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void Writes_PasswordWithoutSpecialChars_StillQuoted()
    {
        // We always quote — simpler and matches the only-correct-form contract.
        var path = BackupRestore.WriteMysqlDefaultsFile("127.0.0.1", 3307, "user1", "plain123");
        try
        {
            var content = File.ReadAllText(path);
            Assert.Contains("password=\"plain123\"", content);
            Assert.Contains("user=user1", content);
            Assert.Contains("host=127.0.0.1", content);
            Assert.Contains("port=3307", content);
        }
        finally { File.Delete(path); }
    }
}
