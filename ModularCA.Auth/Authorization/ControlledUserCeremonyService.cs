using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ModularCA.Auth.Interfaces;
using ModularCA.Database;
using ModularCA.Shared.Authorization;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Enums;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models;

namespace ModularCA.Auth.Authorization;

/// <summary>
/// Default <see cref="IControlledUserCeremonyService"/>. Mirrors
/// <c>TenantPolicyChangeService</c>: opens a <see cref="CeremonyType.ControlledUserChange"/>
/// ceremony via <see cref="IKeyCeremonyService"/> with the deferred change in
/// <c>ParametersJson</c>, and applies it on execute. Tier classification and dominance use
/// group-membership flags (<c>IsSystemTierSuper</c>, <c>IsSystemGroup</c>, the CA
/// <c>Administrator</c> template).
/// </summary>
public class ControlledUserCeremonyService(
    ModularCADbContext db,
    IKeyCeremonyService keyCeremonyService,
    IUserManagementService userService,
    ILogger<ControlledUserCeremonyService> logger) : IControlledUserCeremonyService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    // Capabilities whose direct grant confers a privilege-controlled tier (Stage 1). Extended
    // in later stages as the role/group/operator paths are wired.
    private static readonly HashSet<string> ControlledCapabilities = new(StringComparer.OrdinalIgnoreCase)
    {
        Capabilities.SystemManage,
    };

    /// <inheritdoc />
    public ControlledTier? ClassifyCapabilityGrant(string capability, Guid? certificateAuthorityId)
    {
        if (string.IsNullOrWhiteSpace(capability) || !ControlledCapabilities.Contains(capability))
            return null;

        // system.manage scoped to a CA confers CA-admin authority; unscoped (global/tenant)
        // confers system-admin.
        return TierForScope(certificateAuthorityId);
    }

    /// <inheritdoc />
    public async Task<ControlledTier?> ClassifyRoleAssignmentAsync(Guid roleId, Guid? certificateAuthorityId)
    {
        var carriesControlled = await db.RoleCapabilities
            .AnyAsync(rc => rc.RoleId == roleId && ControlledCapabilities.Contains(rc.Capability));
        return carriesControlled ? TierForScope(certificateAuthorityId) : null;
    }

    /// <inheritdoc />
    public ControlledTier? ClassifyGroup(CaGroupEntity group)
    {
        if (group.IsSystemTierSuper)
            return new ControlledTier(ControlledTierLevel.SystemSuper, null);
        if (group.IsSystemGroup)
            return new ControlledTier(ControlledTierLevel.SystemAdmin, null);
        if (group.CertificateAuthorityId != null
            && string.Equals(group.TemplateName, "Administrator", StringComparison.OrdinalIgnoreCase))
            return new ControlledTier(ControlledTierLevel.CaAdmin, group.CertificateAuthorityId);
        // Operator groups become controlled in a later stage.
        return null;
    }

    // CA-scoped controlled grants confer CA-admin; otherwise system-admin.
    private static ControlledTier TierForScope(Guid? caId) =>
        caId != null
            ? new ControlledTier(ControlledTierLevel.CaAdmin, caId)
            : new ControlledTier(ControlledTierLevel.SystemAdmin, null);

    /// <inheritdoc />
    public async Task<bool> IsSuperAsync(Guid userId)
    {
        return await db.CaGroupMembers
            .AnyAsync(m => m.UserId == userId && m.Group.IsSystemTierSuper);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<ControlledTier>> GetUserTiersAsync(Guid userId)
    {
        var groups = await db.CaGroupMembers
            .Where(m => m.UserId == userId)
            .Select(m => new
            {
                m.Group.IsSystemGroup,
                m.Group.IsSystemTierSuper,
                m.Group.TemplateName,
                m.Group.CertificateAuthorityId,
            })
            .ToListAsync();

        var tiers = new List<ControlledTier>();
        if (groups.Any(g => g.IsSystemTierSuper))
            tiers.Add(new ControlledTier(ControlledTierLevel.SystemSuper, null));
        if (groups.Any(g => g.IsSystemGroup && !g.IsSystemTierSuper))
            tiers.Add(new ControlledTier(ControlledTierLevel.SystemAdmin, null));
        foreach (var g in groups.Where(g => !g.IsSystemGroup
                     && g.CertificateAuthorityId != null
                     && string.Equals(g.TemplateName, "Administrator", StringComparison.OrdinalIgnoreCase)))
        {
            tiers.Add(new ControlledTier(ControlledTierLevel.CaAdmin, g.CertificateAuthorityId));
        }
        // Operator tiers are added in a later stage (TemplateName == "Operator").
        return tiers;
    }

    /// <inheritdoc />
    public async Task<ControlledTier?> GetDeletionTierAsync(Guid userId)
    {
        var tiers = await GetUserTiersAsync(userId);
        if (tiers.Count == 0) return null; // not a controlled user — delete is uncontrolled

        if (tiers.Any(t => t.Level == ControlledTierLevel.SystemSuper))
            return new ControlledTier(ControlledTierLevel.SystemSuper, null);
        if (tiers.Any(t => t.Level == ControlledTierLevel.SystemAdmin))
            return new ControlledTier(ControlledTierLevel.SystemAdmin, null);

        var caIds = tiers.Where(t => t.Level == ControlledTierLevel.CaAdmin).Select(t => t.CaId).Distinct().ToList();
        if (caIds.Count == 1)
            return new ControlledTier(ControlledTierLevel.CaAdmin, caIds[0]);
        if (caIds.Count > 1)
            // Multiple CAs — only a system-tier approver dominates across CAs.
            return new ControlledTier(ControlledTierLevel.SystemAdmin, null);

        return null;
    }

    /// <inheritdoc />
    public async Task<int> CountDominatingControlledUsersAsync(ControlledTier minted, Guid excludeUserId)
    {
        // System-tier members (super + system-admin) dominate every tier.
        var dominators = new HashSet<Guid>(await db.CaGroupMembers
            .Where(m => m.Group.IsSystemGroup)
            .Select(m => m.UserId)
            .ToListAsync());

        // For a CA-scoped change, that CA's Administrator-group members also dominate.
        if (minted.CaId != null)
        {
            var caAdmins = await db.CaGroupMembers
                .Where(m => !m.Group.IsSystemGroup
                    && m.Group.CertificateAuthorityId == minted.CaId
                    && m.Group.TemplateName == "Administrator")
                .Select(m => m.UserId)
                .ToListAsync();
            foreach (var u in caAdmins) dominators.Add(u);
        }

        dominators.Remove(excludeUserId);
        return dominators.Count;
    }

    /// <inheritdoc />
    public async Task<bool> CanInitiateAsync(Guid userId, ControlledTier minted)
    {
        var tiers = await GetUserTiersAsync(userId);
        return tiers.Any(t => t.Dominates(minted));
    }

    /// <inheritdoc />
    public async Task<bool> CanApproveAsync(Guid approverUserId, KeyCeremonyEntity ceremony)
    {
        var p = Deserialize(ceremony);
        if (p == null) return false;

        // The user being promoted/demoted can't approve their own privilege change.
        if (approverUserId == p.TargetUserId) return false;

        var minted = new ControlledTier((ControlledTierLevel)p.MintedTierLevel, p.MintedTierCaId);
        var tiers = await GetUserTiersAsync(approverUserId);
        return tiers.Any(t => t.Dominates(minted));
    }

    /// <inheritdoc />
    public Task<Guid> InitiateCapabilityGrantAsync(
        Guid targetUserId,
        string? targetUsername,
        string capability,
        Guid? tenantId,
        Guid? certificateAuthorityId,
        string? resourceType,
        Guid? resourceId,
        ControlledTier minted,
        Guid initiatorUserId,
        string initiatorUsername)
    {
        var parameters = new ControlledUserChangeParameters
        {
            ChangeType = "GrantCapability",
            TargetUserId = targetUserId,
            TargetUsername = targetUsername,
            Capability = capability,
            TenantId = tenantId,
            CertificateAuthorityId = certificateAuthorityId,
            ResourceType = resourceType,
            ResourceId = resourceId,
        };
        return InitiateChangeAsync(parameters, minted, initiatorUserId, initiatorUsername);
    }

    /// <inheritdoc />
    public async Task<Guid> InitiateChangeAsync(
        ControlledUserChangeParameters parameters,
        ControlledTier minted,
        Guid initiatorUserId,
        string initiatorUsername)
    {
        // The minted tier is authoritative for later approver-dominance checks.
        parameters.MintedTierLevel = (int)minted.Level;
        parameters.MintedTierCaId = minted.CaId;

        var quorum = await ResolveUserQuorumAsync(minted);

        var ceremony = await keyCeremonyService.InitiateAsync(
            operationType: "ControlledUserChange",
            description: DescribeChange(parameters, minted),
            targetEntityId: (parameters.TargetUserId != Guid.Empty
                ? parameters.TargetUserId
                : parameters.GroupId)?.ToString() ?? "-",
            initiatorUserId: initiatorUserId,
            initiatorUsername: initiatorUsername,
            parametersJson: JsonSerializer.Serialize(parameters),
            quorumOverride: quorum);

        // The base InitiateAsync doesn't know the ControlledUserChange enum value — stamp it.
        var tracked = await db.KeyCeremonies.FindAsync(ceremony.Id)
            ?? throw new InvalidOperationException($"Newly-created ceremony {ceremony.Id} could not be re-loaded.");
        tracked.CeremonyType = CeremonyType.ControlledUserChange;
        await db.SaveChangesAsync();

        logger.LogInformation(
            "Initiated ControlledUserChange ceremony {CeremonyId} ({ChangeType}, tier {Tier}, quorum {Quorum}, initiator {Initiator}).",
            tracked.Id, parameters.ChangeType, minted.Level, quorum, initiatorUserId);

        return tracked.Id;
    }

    private static string DescribeChange(ControlledUserChangeParameters p, ControlledTier minted)
    {
        var who = p.TargetUsername
                  ?? (p.TargetUserId != Guid.Empty ? p.TargetUserId.ToString() : (p.GroupId?.ToString() ?? "?"));
        var scope = minted.CaId != null ? $" on CA {minted.CaId}" : " (system)";
        return p.ChangeType switch
        {
            "GrantCapability" => $"Promote controlled user {who}: grant '{p.Capability}'{scope}",
            "AssignRole" => $"Promote controlled user {who}: assign role {p.RoleId}{scope}",
            "AddGroupMember" => $"Promote controlled user {who}: add to group {p.GroupId}{scope}",
            "RevokeCapability" => $"Demote controlled user {who}: revoke '{p.Capability}'{scope}",
            "UnassignRole" => $"Demote controlled user {who}: unassign role {p.RoleId}{scope}",
            "RemoveGroupMember" => $"Demote controlled user {who}: remove from group {p.GroupId}{scope}",
            "DeleteUser" => $"Delete controlled user {who}{scope}",
            _ => $"Controlled-user change ({p.ChangeType}) for {who}{scope}",
        };
    }

    /// <inheritdoc />
    public async Task<ControlledUserChangeResult> ApplyApprovedAsync(Guid ceremonyId)
    {
        var ceremony = await db.KeyCeremonies.FindAsync(ceremonyId)
            ?? throw new InvalidOperationException($"Ceremony {ceremonyId} not found.");

        if (ceremony.Status != "Approved")
            throw new InvalidOperationException($"Ceremony must be Approved to apply (current: {ceremony.Status}).");

        var p = Deserialize(ceremony)
            ?? throw new InvalidOperationException($"Ceremony {ceremonyId} parameters could not be deserialized.");

        switch (p.ChangeType)
        {
            case "GrantCapability":
                {
                    if (string.IsNullOrWhiteSpace(p.Capability))
                        throw new InvalidOperationException($"Ceremony {ceremonyId} has no capability to grant.");

                    // Idempotency: skip if an identical grant already exists.
                    var exists = await db.UserCapabilityGrants.AnyAsync(g =>
                        g.UserId == p.TargetUserId
                        && g.Capability == p.Capability
                        && g.TenantId == p.TenantId
                        && g.CertificateAuthorityId == p.CertificateAuthorityId
                        && g.ResourceType == p.ResourceType
                        && g.ResourceId == p.ResourceId);

                    if (!exists)
                    {
                        db.UserCapabilityGrants.Add(new UserCapabilityGrantEntity
                        {
                            UserId = p.TargetUserId,
                            Capability = p.Capability,
                            TenantId = p.TenantId,
                            CertificateAuthorityId = p.CertificateAuthorityId,
                            ResourceType = p.ResourceType,
                            ResourceId = p.ResourceId,
                            GrantedByUserId = ceremony.InitiatedByUserId,
                        });
                        await db.SaveChangesAsync();
                    }
                    break;
                }
            case "AssignRole":
                {
                    if (p.RoleId == null)
                        throw new InvalidOperationException($"Ceremony {ceremonyId} has no role to assign.");

                    var userId = p.TargetUserId != Guid.Empty ? (Guid?)p.TargetUserId : null;
                    var exists = await db.RoleAssignments.AnyAsync(ra =>
                        ra.RoleId == p.RoleId
                        && ra.UserId == userId
                        && ra.GroupId == p.GroupId
                        && ra.TenantId == p.TenantId
                        && ra.CertificateAuthorityId == p.CertificateAuthorityId);

                    if (!exists)
                    {
                        db.RoleAssignments.Add(new RoleAssignmentEntity
                        {
                            RoleId = p.RoleId.Value,
                            UserId = userId,
                            GroupId = p.GroupId,
                            TenantId = p.TenantId,
                            CertificateAuthorityId = p.CertificateAuthorityId,
                            AssignedByUserId = ceremony.InitiatedByUserId,
                        });
                        await db.SaveChangesAsync();
                    }
                    break;
                }
            case "AddGroupMember":
                {
                    if (p.GroupId == null || p.TargetUserId == Guid.Empty)
                        throw new InvalidOperationException($"Ceremony {ceremonyId} is missing the group or target user.");

                    var exists = await db.CaGroupMembers.AnyAsync(m =>
                        m.GroupId == p.GroupId && m.UserId == p.TargetUserId);
                    if (!exists)
                    {
                        db.CaGroupMembers.Add(new CaGroupMemberEntity
                        {
                            GroupId = p.GroupId.Value,
                            UserId = p.TargetUserId,
                            AddedByUserId = ceremony.InitiatedByUserId,
                        });
                        await db.SaveChangesAsync();
                    }
                    break;
                }
            case "RevokeCapability":
                {
                    if (p.RecordId != null)
                    {
                        var grant = await db.UserCapabilityGrants.FindAsync(p.RecordId.Value);
                        if (grant != null)
                        {
                            db.UserCapabilityGrants.Remove(grant);
                            await db.SaveChangesAsync();
                        }
                    }
                    break;
                }
            case "UnassignRole":
                {
                    if (p.RecordId != null)
                    {
                        var assignment = await db.RoleAssignments.FindAsync(p.RecordId.Value);
                        if (assignment != null)
                        {
                            db.RoleAssignments.Remove(assignment);
                            await db.SaveChangesAsync();
                        }
                    }
                    break;
                }
            case "RemoveGroupMember":
                {
                    if (p.GroupId != null && p.TargetUserId != Guid.Empty)
                    {
                        var membership = await db.CaGroupMembers
                            .FirstOrDefaultAsync(m => m.GroupId == p.GroupId && m.UserId == p.TargetUserId);
                        if (membership != null)
                        {
                            db.CaGroupMembers.Remove(membership);
                            await db.SaveChangesAsync();
                        }
                    }
                    break;
                }
            case "DeleteUser":
                {
                    if (p.TargetUserId == Guid.Empty)
                        throw new InvalidOperationException($"Ceremony {ceremonyId} has no target user to delete.");
                    // Delegate to the same deletion path the controller uses (handles cascade).
                    await userService.DeleteUser(p.TargetUserId);
                    break;
                }
            default:
                throw new InvalidOperationException($"Unsupported controlled-user change type '{p.ChangeType}'.");
        }

        logger.LogInformation(
            "Applied ControlledUserChange ceremony {CeremonyId}: {ChangeType} for user {TargetUserId}.",
            ceremonyId, p.ChangeType, p.TargetUserId);

        return new ControlledUserChangeResult(p.ChangeType, p.TargetUserId, p.Capability, p.TenantId, p.CertificateAuthorityId);
    }

    /// <summary>
    /// Resolves the user quorum for a change at <paramref name="minted"/>: a CA-scoped change
    /// prefers the owning tenant's override, falling back to the system-level
    /// <c>SecurityPolicy.UserQuorum</c>. Clamped to a minimum of 1.
    /// </summary>
    private async Task<int> ResolveUserQuorumAsync(ControlledTier minted)
    {
        var systemQuorum = (await db.Set<SecurityPolicyEntity>().AsNoTracking().FirstOrDefaultAsync())?.UserQuorum ?? 1;

        if (minted.CaId != null)
        {
            var tenantId = await db.CertificateAuthorities
                .Where(c => c.Id == minted.CaId)
                .Select(c => (Guid?)c.TenantId)
                .FirstOrDefaultAsync();

            if (tenantId != null)
            {
                var tenantQuorum = await db.Tenants
                    .Where(t => t.Id == tenantId)
                    .Select(t => t.UserCeremonyRequiredApprovals)
                    .FirstOrDefaultAsync();
                if (tenantQuorum.HasValue)
                    return Math.Max(1, tenantQuorum.Value);
            }
        }

        return Math.Max(1, systemQuorum);
    }

    private static ControlledUserChangeParameters? Deserialize(KeyCeremonyEntity ceremony)
    {
        try
        {
            return JsonSerializer.Deserialize<ControlledUserChangeParameters>(ceremony.ParametersJson, JsonOpts);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
