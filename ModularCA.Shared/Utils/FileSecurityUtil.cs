using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;

namespace ModularCA.Shared.Utils;

/// <summary>
/// Sets restrictive file permissions on sensitive config files. Provides cross-platform
/// best-effort hardening: chmod 600 on POSIX, NTFS DACL replacement on Windows.
/// </summary>
public static class FileSecurityUtil
{
    private static int _windowsAclWarningLogged;

    /// <summary>
    /// Sets file permissions to owner-only read/write. On POSIX systems this maps to
    /// <c>chmod 600</c> via <see cref="File.SetUnixFileMode"/>. On Windows, the file's
    /// DACL is replaced with explicit ACEs granting <see cref="FileSystemRights.FullControl"/>
    /// only to the current user and the local Administrators group, and inheritance is
    /// disabled so parent-folder ACEs do not leak access. Errors are swallowed so a
    /// permission-tightening failure does not crash callers writing secrets to disk.
    /// </summary>
    /// <param name="filePath">Absolute path to the file whose ACL should be tightened.</param>
    public static void SetOwnerOnly(string filePath)
    {
        if (!File.Exists(filePath))
            return;

        if (OperatingSystem.IsWindows())
        {
            try
            {
                ApplyWindowsOwnerOnlyAcl(filePath);
            }
            catch (Exception ex)
            {
                if (System.Threading.Interlocked.Exchange(ref _windowsAclWarningLogged, 1) == 0)
                {
                    Console.Error.WriteLine(
                        $"[WARNING] FileSecurityUtil.SetOwnerOnly: failed to harden ACL on '{filePath}': {ex.Message}. " +
                        "Sensitive files may inherit parent-folder permissions until this is resolved.");
                }
            }
            return;
        }

        try
        {
            File.SetUnixFileMode(filePath,
                UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch { /* Best effort — don't crash if permissions fail */ }
    }

    /// <summary>
    /// Replaces the file's DACL with explicit Allow ACEs for the current user and
    /// the local Administrators group, removing inheritance and any pre-existing ACEs.
    /// </summary>
    [SupportedOSPlatform("windows")]
    private static void ApplyWindowsOwnerOnlyAcl(string filePath)
    {
        var fileInfo = new FileInfo(filePath);
        var security = fileInfo.GetAccessControl();

        // Disable inheritance and clear any inherited ACEs (do not preserve).
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

        // Strip any explicit ACEs that were left behind.
        var existing = security.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier));
        foreach (FileSystemAccessRule rule in existing)
            security.RemoveAccessRule(rule);

        var currentUserSid = WindowsIdentity.GetCurrent().User
            ?? throw new InvalidOperationException("Cannot resolve current Windows user SID.");
        var administratorsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);

        security.AddAccessRule(new FileSystemAccessRule(
            currentUserSid,
            FileSystemRights.FullControl,
            AccessControlType.Allow));

        security.AddAccessRule(new FileSystemAccessRule(
            administratorsSid,
            FileSystemRights.FullControl,
            AccessControlType.Allow));

        fileInfo.SetAccessControl(security);
    }
}
