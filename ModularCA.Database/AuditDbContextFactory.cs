using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ModularCA.Database;

/// <summary>
/// Design-time factory for creating AuditDbContext instances during EF Core migrations.
/// </summary>
public class AuditDbContextFactory : IDesignTimeDbContextFactory<AuditDbContext>
{
    /// <summary>
    /// Creates a new AuditDbContext with a placeholder connection string for migration generation.
    /// </summary>
    public AuditDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<AuditDbContext>();
        // Design-time connection for migration generation only
        optionsBuilder.UseMySql(
            "Server=localhost;Database=modularca-audit;Uid=root;Pwd=placeholder;",
            ServerVersion.Create(8, 0, 0, Pomelo.EntityFrameworkCore.MySql.Infrastructure.ServerType.MySql));
        return new AuditDbContext(optionsBuilder.Options);
    }
}
