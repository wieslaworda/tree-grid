using Microsoft.EntityFrameworkCore;

namespace Api.Data;

/// <summary>
/// Kontekst EF Core aplikacji. Na tym etapie zawiera wyłącznie tabelę
/// techniczną <see cref="SchemaProbe"/> — model domenowy powstaje w S-01.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<SchemaProbe> SchemaProbes => Set<SchemaProbe>();
}
