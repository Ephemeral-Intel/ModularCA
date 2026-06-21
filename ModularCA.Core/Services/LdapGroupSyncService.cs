using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Models.Config;
using System.Security.Cryptography;
using System.Text.Json;

namespace ModularCA.Core.Services;

/// <summary>
/// Provides LDAP group membership lookup for user-to-group mapping.
/// </summary>
public interface ILdapGroupProvider
{
    /// <summary>
    /// Returns the list of LDAP group names (DNs or common names) for the given username.
    /// </summary>
    Task<List<string>> GetUserGroupsAsync(string username);
}

/// <summary>
/// Synchronizes user CA group memberships from LDAP groups and auto-provisions LDAP users.
/// </summary>
public interface ILdapGroupSyncService
{
    /// <summary>
    /// Synchronizes a user's CA group memberships based on their LDAP group list.
    /// Adds memberships for matching CaGroups and removes stale ones.
    /// </summary>
    Task SyncUserGroupsAsync(Guid userId, List<string> ldapGroups);

    /// <summary>
    /// Auto-provisions a new user from LDAP and syncs their group memberships.
    /// Returns null if auto-provisioning is disabled or the user already exists.
    /// </summary>
    Task<UserEntity?> AutoProvisionUserAsync(string username, List<string> ldapGroups);

    /// <summary>
    /// Synchronizes CA group memberships for all active users who have previously logged in.
    /// </summary>
    Task SyncAllUsersAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Maps LDAP groups to CaGroupEntity memberships and provisions users from LDAP directory.
/// LDAP group names are matched against <see cref="CaGroupEntity.Name"/> values in the database.
/// </summary>
public class LdapGroupSyncService : ILdapGroupSyncService
{
    private readonly ModularCADbContext _db;
    private readonly SystemConfig _config;
    private readonly ILdapGroupProvider _groupProvider;
    private readonly ILogger<LdapGroupSyncService> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="LdapGroupSyncService"/> class.
    /// </summary>
    public LdapGroupSyncService(ModularCADbContext db, SystemConfig config, ILdapGroupProvider groupProvider, ILogger<LdapGroupSyncService> logger)
    {
        _db = db;
        _config = config;
        _groupProvider = groupProvider;
        _logger = logger;
    }

    /// <summary>
    /// Synchronizes a user's CA group memberships from LDAP groups.
    /// Matches LDAP group names against CaGroupEntity.Name in the database.
    /// Adds missing memberships and removes memberships for groups no longer present
    /// in the LDAP response (only for groups that were LDAP-synced, identified as auto-generated groups).
    /// System-admin group memberships are never removed by sync.
    /// </summary>
    public async Task SyncUserGroupsAsync(Guid userId, List<string> ldapGroups)
    {
        var mappings = ParseMappings();
        if (mappings.Count == 0 && ldapGroups.Count == 0) return;

        var user = await _db.Users
            .Include(u => u.GroupMemberships)
                .ThenInclude(gm => gm.Group)
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return;

        // Resolve target CaGroup names from LDAP groups using configured mappings.
        // If mappings are configured, map LDAP DNs to CaGroup names.
        // Otherwise, try direct matching of LDAP group names against CaGroup names.
        var targetGroupNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (mappings.Count > 0)
        {
            foreach (var ldapGroup in ldapGroups)
            {
                foreach (var (groupDn, caGroupName) in mappings)
                {
                    if (string.Equals(ldapGroup, groupDn, StringComparison.OrdinalIgnoreCase))
                        targetGroupNames.Add(caGroupName);
                }
            }
        }
        else
        {
            // Direct match: LDAP group names = CaGroup names
            foreach (var lg in ldapGroups)
                targetGroupNames.Add(lg);
        }

        // Load all CaGroups that match the target names
        var targetGroups = await _db.CaGroups
            .Where(g => targetGroupNames.Contains(g.Name))
            .ToListAsync();

        var targetGroupIds = new HashSet<Guid>(targetGroups.Select(g => g.Id));

        // Add missing memberships
        foreach (var group in targetGroups)
        {
            if (!user.GroupMemberships.Any(gm => gm.GroupId == group.Id))
            {
                _db.CaGroupMembers.Add(new CaGroupMemberEntity
                {
                    UserId = userId,
                    GroupId = group.Id,
                    AddedAt = DateTime.UtcNow,
                });
                _logger.LogInformation("LDAP sync: added user {Username} to group {GroupName}", user.Username, group.Name);
            }
        }

        // Remove memberships for auto-generated groups no longer in the LDAP response.
        // Never remove system-tier memberships (system-super / system-admin / system-operator
        // / system-auditor) via LDAP sync — those are operator-controlled and should only
        // change through the admin UI. Broadened from a literal "system-admin" exclusion
        // so renaming or adding new system tiers can't accidentally make them sync-removable.
        var membershipsToRemove = user.GroupMemberships
            .Where(gm => gm.Group.IsAutoGenerated
                          && !gm.Group.IsSystemGroup
                          && !targetGroupIds.Contains(gm.GroupId))
            .ToList();

        foreach (var membership in membershipsToRemove)
        {
            _db.CaGroupMembers.Remove(membership);
            _logger.LogInformation("LDAP sync: removed user {Username} from group {GroupName}", user.Username, membership.Group.Name);
        }

        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Auto-provisions a new user from LDAP if enabled in configuration.
    /// Creates the user with a random password hash and syncs group memberships.
    /// </summary>
    public async Task<UserEntity?> AutoProvisionUserAsync(string username, List<string> ldapGroups)
    {
        if (!_config.LdapAuth.AutoProvisionUsers) return null;

        var existing = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (existing != null) return existing;

        var user = new UserEntity
        {
            Username = username,
            PasswordHash = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        // Assign group memberships from LDAP groups
        await SyncUserGroupsAsync(user.Id, ldapGroups);

        _logger.LogInformation("LDAP sync: auto-provisioned user {Username}", username);
        return user;
    }

    /// <summary>
    /// Synchronizes CA group memberships for all active users with a previous login timestamp.
    /// Skips users who fail lookup and logs warnings. Observes the cancellation token between iterations.
    /// </summary>
    public async Task SyncAllUsersAsync(CancellationToken cancellationToken = default)
    {
        if (!_config.LdapAuth.Enabled || !_config.LdapAuth.GroupSyncEnabled) return;

        var users = await _db.Users.Where(u => u.IsActive && u.LastLoginAt != null).ToListAsync(cancellationToken);

        foreach (var user in users)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var groups = await _groupProvider.GetUserGroupsAsync(user.Username);
                await SyncUserGroupsAsync(user.Id, groups);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "LDAP sync failed for user {Username}", user.Username);
            }
        }

        _logger.LogInformation("LDAP group sync completed for {Count} users", users.Count);
    }

    /// <summary>
    /// Parses the GroupToRoleMappings config as a dictionary mapping LDAP group DNs to CaGroup names.
    /// </summary>
    private List<(string GroupDn, string CaGroupName)> ParseMappings()
    {
        var result = new List<(string, string)>();
        if (string.IsNullOrWhiteSpace(_config.LdapAuth.GroupToRoleMappings)) return result;

        var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(_config.LdapAuth.GroupToRoleMappings);
        if (dict == null) return result;

        foreach (var (groupDn, caGroupName) in dict)
        {
            if (!string.IsNullOrWhiteSpace(caGroupName))
                result.Add((groupDn, caGroupName));
            else
                _logger.LogWarning("LDAP sync: empty CaGroup name in mapping for '{GroupDn}'", groupDn);
        }

        return result;
    }
}
