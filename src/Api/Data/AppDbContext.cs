using Api.Categories;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Api.Data;

/// <summary>
/// Kontekst EF Core aplikacji. Od S-01 jest kontekstem Identity — daje
/// <c>UserManager</c> miejsce na konta. Od S-02 niesie też słownik obiektów
/// (<see cref="CatalogObject"/> i relację rodzic–podobiekt
/// <see cref="CatalogObjectLink"/>), wspólny dla wszystkich kont. Od S-09 —
/// słownik kategorii danych (<see cref="Category"/>), również wspólny i na razie
/// bez relacji z czymkolwiek. Model domenowy ekranów i gridu dochodzi
/// w kolejnych plastrach.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser>(options)
{
    public DbSet<CatalogObject> CatalogObjects => Set<CatalogObject>();

    public DbSet<CatalogObjectLink> CatalogObjectLinks => Set<CatalogObjectLink>();

    public DbSet<Category> Categories => Set<Category>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        // Wywołanie bazowej implementacji jest obowiązkowe: to ona konfiguruje
        // cały model Identity. Bez niego migracja wychodzi pusta, a błąd nie
        // pojawia się nigdzie — schemat po prostu nie powstaje.
        base.OnModelCreating(builder);

        // Niezmienniki słownika są tu powtórzone po stronie bazy, a nie tylko
        // sprawdzane w endpointach: żądanie wysłane z pominięciem interfejsu
        // albo błąd w kodzie endpointu mają się zatrzymać na schemacie.
        builder.Entity<CatalogObject>(entity =>
        {
            // SQLite nie egzekwuje długości kolumny tekstowej — to metadane
            // modelu. Wiążący limit egzekwuje walidacja w `ObjectEndpoints`,
            // która czyta te same stałe.
            entity.Property(o => o.Code).HasMaxLength(CatalogObject.CodeMaxLength);
            entity.Property(o => o.NormalizedCode).HasMaxLength(CatalogObject.CodeMaxLength);
            entity.Property(o => o.Name).HasMaxLength(CatalogObject.NameMaxLength);

            // Unikalność po postaci znormalizowanej, nie po kodzie wpisanym —
            // powód w komentarzu `CatalogObject`.
            entity.HasIndex(o => o.NormalizedCode).IsUnique();
        });

        builder.Entity<CatalogObjectLink>(link =>
        {
            link.HasKey(l => new { l.ParentId, l.ChildId });

            // `Restrict`, a nie domyślna dla wymaganej relacji kaskada: kaskada
            // usunęłaby razem z obiektem jego relacje, czyli po cichu wycięła
            // gałąź z drzew, w których występuje. Usunąć wolno wyłącznie obiekt
            // bez powiązań, a klucze obce są w `e_sqlite3` włączone domyślnie,
            // więc baza odmówi także wtedy, gdy kontrola w endpoincie zawiedzie.
            link.HasOne(l => l.Parent)
                .WithMany(o => o.Children)
                .HasForeignKey(l => l.ParentId)
                .OnDelete(DeleteBehavior.Restrict);

            link.HasOne(l => l.Child)
                .WithMany(o => o.Parents)
                .HasForeignKey(l => l.ChildId)
                .OnDelete(DeleteBehavior.Restrict);

            // Cykl długości 1 da się wykluczyć samym schematem; dłuższe cykle
            // wymagają przejścia grafu (`ObjectRules.FindCycle`).
            link.ToTable(table => table.HasCheckConstraint(
                "CK_CatalogObjectLinks_ParentIsNotChild",
                "\"ParentId\" <> \"ChildId\""));
        });

        builder.Entity<Category>(entity =>
        {
            // Długości jako metadane, wiążący limit w walidacji
            // `CategoryEndpoints` — ten sam układ co w bloku obiektów wyżej.
            entity.Property(c => c.Code).HasMaxLength(Category.CodeMaxLength);
            entity.Property(c => c.NormalizedCode).HasMaxLength(Category.CodeMaxLength);
            entity.Property(c => c.Name).HasMaxLength(Category.NameMaxLength);

            entity.HasIndex(c => c.NormalizedCode).IsUnique();

            // Tekst kanoniczny, a nie domyślna liczba: plik bazy ma być czytelny
            // bez kodu, a kolejność składowych enuma nie może po cichu zmienić
            // znaczenia zapisanych wierszy. Obie strony konwersji idą przez
            // `CategoryRules`, czyli przez ten sam zapis, który widzi klient API.
            entity.Property(c => c.AggregateFunction)
                .IsRequired()
                .HasConversion(
                    function => CategoryRules.FormatAggregateFunction(function),
                    text => ReadStoredAggregateFunction(text));
        });
    }

    /// <summary>
    /// Odczyt funkcji agregującej z kolumny. Wartość spoza listy oznacza plik
    /// bazy zmieniony z pominięciem API i kończy się wyjątkiem, a nie
    /// podstawieniem domyślnej funkcji, które po cichu przekłamałoby kategorię.
    /// </summary>
    private static AggregateFunction ReadStoredAggregateFunction(string text)
        => CategoryRules.TryParseAggregateFunction(text, out var function)
            ? function
            : throw new InvalidOperationException(
                $"Kolumna AggregateFunction zawiera wartość spoza listy: „{text}\".");
}
