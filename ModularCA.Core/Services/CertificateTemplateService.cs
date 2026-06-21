using Microsoft.EntityFrameworkCore;
using ModularCA.Database;
using ModularCA.Shared.Entities;
using ModularCA.Shared.Models.CertificateTemplates;

namespace ModularCA.Core.Services;

/// <summary>
/// Database-backed CRUD service for managing certificate templates that bundle
/// a CA, signing profile, cert profile, and optional request profile into a
/// named template for simplified certificate enrollment.
/// </summary>
public class CertificateTemplateService
{
    private readonly ModularCADbContext _db;

    /// <summary>
    /// Initializes the service with the application database context.
    /// </summary>
    public CertificateTemplateService(ModularCADbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Returns all certificate templates with resolved CA and profile names.
    /// </summary>
    public async Task<List<CertificateTemplateDto>> GetAllAsync()
    {
        var entities = await _db.CertificateTemplates
            .AsNoTracking()
            .Include(t => t.Ca)
            .Include(t => t.CertProfile)
            .Include(t => t.SigningProfile)
            .Include(t => t.RequestProfile)
            .OrderBy(t => t.Name)
            .ToListAsync();

        return entities.Select(MapToDto).ToList();
    }

    /// <summary>
    /// Retrieves a single certificate template by ID with resolved names. Returns null if not found.
    /// </summary>
    public async Task<CertificateTemplateDto?> GetByIdAsync(Guid id)
    {
        var entity = await _db.CertificateTemplates
            .AsNoTracking()
            .Include(t => t.Ca)
            .Include(t => t.CertProfile)
            .Include(t => t.SigningProfile)
            .Include(t => t.RequestProfile)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (entity == null)
            return null;

        return MapToDto(entity);
    }

    /// <summary>
    /// Retrieves a single certificate template by its unique name. Returns null if not found.
    /// </summary>
    public async Task<CertificateTemplateDto?> GetByNameAsync(string name)
    {
        var entity = await _db.CertificateTemplates
            .AsNoTracking()
            .Include(t => t.Ca)
            .Include(t => t.CertProfile)
            .Include(t => t.SigningProfile)
            .Include(t => t.RequestProfile)
            .FirstOrDefaultAsync(t => t.Name == name);

        if (entity == null)
            return null;

        return MapToDto(entity);
    }

    /// <summary>
    /// Creates a new certificate template from the given request.
    /// </summary>
    public async Task<CertificateTemplateDto> CreateAsync(CreateCertificateTemplateRequest request)
    {
        var entity = new CertificateTemplateEntity
        {
            Name = request.Name,
            Description = request.Description,
            CaId = request.CaId,
            RequestProfileId = request.RequestProfileId,
            CertProfileId = request.CertProfileId,
            SigningProfileId = request.SigningProfileId,
            IsEnabled = request.IsEnabled
        };

        _db.CertificateTemplates.Add(entity);
        await _db.SaveChangesAsync();

        // Reload with navigations to return resolved names
        return (await GetByIdAsync(entity.Id))!;
    }

    /// <summary>
    /// Updates an existing certificate template by ID. Throws <see cref="KeyNotFoundException"/> if not found.
    /// </summary>
    public async Task<CertificateTemplateDto> UpdateAsync(Guid id, UpdateCertificateTemplateRequest request)
    {
        var entity = await _db.CertificateTemplates.FindAsync(id)
            ?? throw new KeyNotFoundException("Certificate template not found");

        entity.Name = request.Name;
        entity.Description = request.Description;
        entity.CaId = request.CaId;
        entity.RequestProfileId = request.RequestProfileId;
        entity.CertProfileId = request.CertProfileId;
        entity.SigningProfileId = request.SigningProfileId;
        entity.IsEnabled = request.IsEnabled;

        await _db.SaveChangesAsync();

        // Reload with navigations to return resolved names
        return (await GetByIdAsync(entity.Id))!;
    }

    /// <summary>
    /// Deletes a certificate template by ID. Returns true if deleted, false if not found.
    /// </summary>
    public async Task<bool> DeleteAsync(Guid id)
    {
        var entity = await _db.CertificateTemplates.FindAsync(id);
        if (entity == null)
            return false;

        _db.CertificateTemplates.Remove(entity);
        await _db.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Maps a <see cref="CertificateTemplateEntity"/> to a <see cref="CertificateTemplateDto"/>
    /// with resolved navigation property names.
    /// </summary>
    private static CertificateTemplateDto MapToDto(CertificateTemplateEntity entity) => new()
    {
        Id = entity.Id,
        Name = entity.Name,
        Description = entity.Description,
        CaId = entity.CaId,
        CaName = entity.Ca?.Name,
        RequestProfileId = entity.RequestProfileId,
        RequestProfileName = entity.RequestProfile?.Name,
        CertProfileId = entity.CertProfileId,
        CertProfileName = entity.CertProfile?.Name,
        SigningProfileId = entity.SigningProfileId,
        SigningProfileName = entity.SigningProfile?.Name,
        IsEnabled = entity.IsEnabled
    };
}
