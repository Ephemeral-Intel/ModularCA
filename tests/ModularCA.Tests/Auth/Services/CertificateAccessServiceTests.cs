using Microsoft.EntityFrameworkCore;
using ModularCA.Auth.Services;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Enums;
using ModularCA.Tests.TestUtils;
using Xunit;

namespace ModularCA.Tests.Auth.Services;

/// <summary>
/// Tests for <see cref="CertificateAccessService.UpdatePermissionsOntoReissuedCertificate"/>.
/// The predecessor lookup recently changed to exclude the new cert itself — without that
/// filter a brand-new subject (no prior cert) silently picked the new cert as its own
/// predecessor and the copy became a no-op. The ordering also changed from
/// <c>OrderByDescending(RevocationDate)</c> (NULL-sort issue) to
/// <c>OrderByDescending(NotBefore)</c>.
/// </summary>
public class CertificateAccessServiceTests
{
    private static CertificateEntity NewCert(string subjectDn, DateTime notBefore, Guid? id = null) =>
        new CertificateEntity
        {
            CertificateId = id ?? Guid.NewGuid(),
            SerialNumber = Guid.NewGuid().ToString("N"),
            SubjectDN = subjectDn,
            NotBefore = notBefore,
            NotAfter = notBefore.AddYears(1),
        };

    [Fact]
    public async Task Throws_When_NewCert_Does_Not_Exist()
    {
        using var db = InMemoryDbContextFactory.Create();
        var svc = new CertificateAccessService(db);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            svc.UpdatePermissionsOntoReissuedCertificate(Guid.NewGuid(), Guid.NewGuid()));
    }

    [Fact]
    public async Task NoOp_When_New_Subject_Has_No_Predecessor()
    {
        // The bug we just fixed: brand-new SubjectDN means the only matching row is the
        // new cert itself. After the filter, oldCert == null, function returns cleanly.
        using var db = InMemoryDbContextFactory.Create();
        var newCert = NewCert("CN=fresh.example.com", new DateTime(2026, 4, 1, 0, 0, 0, DateTimeKind.Utc));
        db.Certificates.Add(newCert);
        await db.SaveChangesAsync();

        var svc = new CertificateAccessService(db);
        await svc.UpdatePermissionsOntoReissuedCertificate(newCert.CertificateId, Guid.NewGuid());

        Assert.Empty(await db.CertificateAccessLists.ToListAsync());
    }

    [Fact]
    public async Task Copies_Permissions_From_The_Single_Predecessor()
    {
        using var db = InMemoryDbContextFactory.Create();
        var oldCert = NewCert("CN=server.example.com", new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var newCert = NewCert("CN=server.example.com", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        db.Certificates.AddRange(oldCert, newCert);

        var alice = Guid.NewGuid();
        var bob = Guid.NewGuid();
        db.CertificateAccessLists.AddRange(
            new CertificateAccessListEntity { UserId = alice, CertificateId = oldCert.CertificateId, AccessLevel = CertificateAccessLevel.Manage, GrantedByUserId = Guid.NewGuid() },
            new CertificateAccessListEntity { UserId = bob, CertificateId = oldCert.CertificateId, AccessLevel = CertificateAccessLevel.View, GrantedByUserId = Guid.NewGuid() });
        await db.SaveChangesAsync();

        var operatorId = Guid.NewGuid();
        var svc = new CertificateAccessService(db);
        await svc.UpdatePermissionsOntoReissuedCertificate(newCert.CertificateId, operatorId);

        var newCertPerms = await db.CertificateAccessLists
            .Where(p => p.CertificateId == newCert.CertificateId)
            .ToListAsync();
        Assert.Equal(2, newCertPerms.Count);
        Assert.Contains(newCertPerms, p => p.UserId == alice && p.AccessLevel == CertificateAccessLevel.Manage);
        Assert.Contains(newCertPerms, p => p.UserId == bob && p.AccessLevel == CertificateAccessLevel.View);
        // The reissue-time operator is the GrantedBy on every copy — preserves audit trail
        // showing who triggered the copy, not who originally granted to Alice/Bob.
        Assert.All(newCertPerms, p => Assert.Equal(operatorId, p.GrantedByUserId));
    }

    [Fact]
    public async Task Picks_Most_Recent_NotBefore_When_Multiple_Predecessors_Exist()
    {
        using var db = InMemoryDbContextFactory.Create();
        // Three certs with the same SubjectDN. Only the most-recent-NotBefore non-self
        // predecessor's permissions should copy across.
        var ancientCert = NewCert("CN=server.example.com", new DateTime(2023, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var recentCert = NewCert("CN=server.example.com", new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Utc));
        var newCert = NewCert("CN=server.example.com", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        db.Certificates.AddRange(ancientCert, recentCert, newCert);

        var ancientUser = Guid.NewGuid();
        var recentUser = Guid.NewGuid();
        db.CertificateAccessLists.AddRange(
            new CertificateAccessListEntity { UserId = ancientUser, CertificateId = ancientCert.CertificateId, AccessLevel = CertificateAccessLevel.Manage, GrantedByUserId = Guid.NewGuid() },
            new CertificateAccessListEntity { UserId = recentUser, CertificateId = recentCert.CertificateId, AccessLevel = CertificateAccessLevel.Manage, GrantedByUserId = Guid.NewGuid() });
        await db.SaveChangesAsync();

        var svc = new CertificateAccessService(db);
        await svc.UpdatePermissionsOntoReissuedCertificate(newCert.CertificateId, Guid.NewGuid());

        var newCertPerms = await db.CertificateAccessLists
            .Where(p => p.CertificateId == newCert.CertificateId)
            .ToListAsync();
        // Only the recent-cert's user should be carried forward; ancient-cert's user is dropped.
        Assert.Single(newCertPerms);
        Assert.Equal(recentUser, newCertPerms[0].UserId);
    }

    [Fact]
    public async Task Excludes_The_New_Cert_Itself_From_Predecessor_Lookup()
    {
        // Even with a real predecessor present, the filter must keep the new cert out so
        // the OrderByDescending doesn't pick "self" by accident.
        using var db = InMemoryDbContextFactory.Create();
        var oldCert = NewCert("CN=server.example.com", new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var newCert = NewCert("CN=server.example.com", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        db.Certificates.AddRange(oldCert, newCert);

        var oldUser = Guid.NewGuid();
        db.CertificateAccessLists.Add(new CertificateAccessListEntity
        {
            UserId = oldUser,
            CertificateId = oldCert.CertificateId,
            AccessLevel = CertificateAccessLevel.Manage,
            GrantedByUserId = Guid.NewGuid()
        });
        // No permissions on newCert — if the lookup picked the new cert as predecessor,
        // it'd find zero perms to copy and the test would still pass falsely. The Single()
        // assertion below distinguishes "found the right predecessor" from "found nothing".
        await db.SaveChangesAsync();

        var svc = new CertificateAccessService(db);
        await svc.UpdatePermissionsOntoReissuedCertificate(newCert.CertificateId, Guid.NewGuid());

        var newCertPerms = await db.CertificateAccessLists
            .Where(p => p.CertificateId == newCert.CertificateId)
            .ToListAsync();
        Assert.Single(newCertPerms);
        Assert.Equal(oldUser, newCertPerms[0].UserId);
    }
}
