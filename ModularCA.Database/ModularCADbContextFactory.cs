using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ModularCA.Database;

/// <summary>
/// Design-time factory for creating ModularCADbContext instances during EF Core migrations.
/// </summary>
public class ModularCADbContextFactory : IDesignTimeDbContextFactory<ModularCADbContext>
{
    /// <summary>
    /// Creates a new ModularCADbContext with a placeholder connection string for migration generation.
    /// </summary>
    public ModularCADbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<ModularCADbContext>();
        optionsBuilder.UseMySql(
            "Server=localhost;Database=modularca-app;Uid=root;Pwd=placeholder;",
            ServerVersion.Create(8, 0, 0, Pomelo.EntityFrameworkCore.MySql.Infrastructure.ServerType.MySql));
        return new ModularCADbContext(optionsBuilder.Options);
    }
}
