using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Api.Data;

/// <summary>
/// Kontekst EF Core aplikacji. Od S-01 jest kontekstem Identity — daje
/// <c>UserManager</c> miejsce na konta. Model domenowy (drzewa, ekrany, grid)
/// dochodzi w kolejnych plastrach.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser>(options)
{
    protected override void OnModelCreating(ModelBuilder builder)
    {
        // Wywołanie bazowej implementacji jest obowiązkowe: to ona konfiguruje
        // cały model Identity. Bez niego migracja wychodzi pusta, a błąd nie
        // pojawia się nigdzie — schemat po prostu nie powstaje.
        base.OnModelCreating(builder);
    }
}
