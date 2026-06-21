namespace ModularCA.Shared.Enums;

/// <summary>
/// Permission level within a CA group. Determines what operations a group member can perform.
/// </summary>
public enum RoleLevel
{
    /// <summary>Full management: create, modify, delete, approve catastrophic operations.</summary>
    Admin = 0,
    /// <summary>Operational: issue/revoke certificates, manage CRL schedules.</summary>
    Operator = 1,
    /// <summary>Read-only access to logs, certificates, and configuration.</summary>
    Auditor = 2,
    /// <summary>Request certificates only.</summary>
    User = 3
}
