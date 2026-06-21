using Microsoft.EntityFrameworkCore;
using ModularCA.Database;

namespace ModularCA.Core.Helpers
{
    /// <summary>
    /// Resolves OID strings to their human-friendly names using the database OID registry.
    /// </summary>
    public class OidHelper
    {
        /// <summary>
        /// Resolves a list of OIDs to their friendly names from the database.
        /// </summary>
        public static async Task<List<string>> ResolveOidFriendlyNamesAsync(ModularCADbContext db, List<string> oids)
        {
            return db.OIDOptions
                .ToList()
                .Where(x => oids.Contains(x.OID))
                .Select(x => x.FriendlyName)
                .ToList();
        }
        /// <summary>
        /// Resolves a single OID to its friendly name, returning the OID itself if not found.
        /// </summary>
        public static async Task<string> ResolveOidFriendlyNameAsync(ModularCADbContext db, string oid)
        {
            return  db.OIDOptions
                .ToList()
                .Where(x => x.OID == oid)
                .Select(x => x.FriendlyName)
                .FirstOrDefault() ?? oid;
        }
    }
}
