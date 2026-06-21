using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Interfaces;
using ModularCA.Shared.Models.Crl;

namespace ModularCA.Core.Services
{
    /// <summary>
    /// Database-backed service for managing CRL generation configurations and schedules.
    /// </summary>
    public class CrlConfigurationService(ModularCADbContext db) : ICrlConfigurationService
    {
        private readonly ModularCADbContext _db = db;

        /// <summary>
        /// Scoped lookup by <paramref name="caCertificateId"/>. The previous
        /// parameterless <c>GetAsync()</c> returned an arbitrary first row which, in multi-CA
        /// deployments, surfaced the wrong config to whichever admin happened to be editing.
        /// </summary>
        public async Task<CrlConfigurationDto> GetByCaAsync(Guid caCertificateId)
        {
            var config = await _db.CrlConfigurations
                .Where(c => c.CaCertificateId == caCertificateId && !c.IsDelta)
                .FirstOrDefaultAsync()
                ?? throw new InvalidOperationException($"CRL config not found for CA {caCertificateId}.");

            return new CrlConfigurationDto
            {
                Id = config.TaskId,
                Name = config.Name,
                Description = config.Description,
                Enabled = config.Enabled,
                UpdateInterval = config.UpdateInterval,
                OverlapPeriod = config.OverlapPeriod,
                IsDelta = config.IsDelta,
                DeltaInterval = config.DeltaInterval,
                LastGenerated = config.LastGenerated
            };
        }

        public async Task UpdateAsync(UpdateCrlConfigurationRequest r)
        {
            var nextUpdate = NCrontab.CrontabSchedule.Parse(r.UpdateInterval)
                .GetNextOccurrence(DateTime.UtcNow);
            var config = await _db.CrlConfigurations
                .Where(c => c.TaskId == r.TaskId)
                .FirstOrDefaultAsync()
                ?? throw new InvalidOperationException("CRL config not found.");

            config.Description = r.Description;
            config.UpdateInterval = r.UpdateInterval;
            config.OverlapPeriod = r.OverlapPeriod;
            config.IsDelta = r.IsDelta;
            config.DeltaInterval = r.DeltaInterval;
            config.NextUpdateUtc = nextUpdate;

            await _db.SaveChangesAsync();
        }

        public async Task<CrlConfigurationDto> CreateAsync(CreateCrlConfigurationRequest r)
        {
            var nextUpdate = NCrontab.CrontabSchedule.Parse(r.UpdateInterval)
                .GetNextOccurrence(DateTime.UtcNow);
            var config = new CrlConfigurationEntity
            {
                Name = r.Name,
                Description = r.Description,
                UpdateInterval = r.UpdateInterval,
                OverlapPeriod = r.OverlapPeriod,
                IsDelta = r.IsDelta,
                DeltaInterval = r.DeltaInterval,
                NextUpdateUtc = nextUpdate,
                CaCertificateId = r.CaCertificateId
            };
            _db.CrlConfigurations.Add(config);
            await _db.SaveChangesAsync();
            return new CrlConfigurationDto
            {
                Id = config.TaskId,
                Name = config.Name,
                Description = config.Description,
                Enabled = config.Enabled,
                UpdateInterval = config.UpdateInterval,
                OverlapPeriod = config.OverlapPeriod,
                IsDelta = config.IsDelta,
                DeltaInterval = config.DeltaInterval,
                LastGenerated = config.LastGenerated
            };
        }

        public async Task DeleteAsync(Guid id)
        {
            var config = await _db.CrlConfigurations
                .Where(c => c.TaskId == id)
                .FirstOrDefaultAsync()
                ?? throw new InvalidOperationException("CRL config not found.");
            _db.CrlConfigurations.Remove(config);
            await _db.SaveChangesAsync();
        }

        public async Task SetEnabledAsync(Guid id, bool enabled)
        {
            var config = await _db.CrlConfigurations
                .Where(c => c.TaskId == id)
                .FirstOrDefaultAsync()
                ?? throw new InvalidOperationException("CRL config not found.");
            config.Enabled = enabled;
            await _db.SaveChangesAsync();
        }

        public async Task<CrlConfigurationDto> GetByIdAsync(Guid id)
        {
            var config = await _db.CrlConfigurations
                .Where(c => c.TaskId == id)
                .FirstOrDefaultAsync()
                ?? throw new InvalidOperationException("CRL config not found.");
            return new CrlConfigurationDto
            {
                Id = config.TaskId,
                Name = config.Name,
                Description = config.Description,
                Enabled = config.Enabled,
                UpdateInterval = config.UpdateInterval,
                OverlapPeriod = config.OverlapPeriod,
                IsDelta = config.IsDelta,
                DeltaInterval = config.DeltaInterval,
                LastGenerated = config.LastGenerated
            };
        }

        public async Task<IEnumerable<CrlConfigurationDto>> GetAllAsync()
        {
            var configs = await _db.CrlConfigurations.ToListAsync();

            // Resolve CA names for display
            var caCertIds = configs.Select(c => c.CaCertificateId).Distinct().ToList();
            var caNames = await _db.CertificateAuthorities
                .Where(ca => ca.CertificateId != null && caCertIds.Contains(ca.CertificateId.Value))
                .ToDictionaryAsync(ca => ca.CertificateId!.Value, ca => ca.Name);

            return configs.Select(c => new CrlConfigurationDto
            {
                Id = c.TaskId,
                Name = c.Name,
                Description = c.Description,
                Enabled = c.Enabled,
                UpdateInterval = c.UpdateInterval,
                OverlapPeriod = c.OverlapPeriod,
                IsDelta = c.IsDelta,
                DeltaInterval = c.DeltaInterval,
                LastGenerated = c.LastGenerated,
                NextUpdateUtc = c.NextUpdateUtc,
                CaCertificateId = c.CaCertificateId,
                CaName = caNames.GetValueOrDefault(c.CaCertificateId),
            }).ToList();
        }

    }

}
