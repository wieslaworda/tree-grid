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
/// bez relacji z czymkolwiek. Od S-03 — drzewo robocze użytkownika
/// (<see cref="TreeNode"/>): pierwsza tabela z właścicielem, jedno drzewo na
/// konto, złożone z wystąpień obiektów słownika. Nazwane ekrany (S-06) i grid
/// dochodzą w kolejnych plastrach.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser>(options)
{
    public DbSet<CatalogObject> CatalogObjects => Set<CatalogObject>();

    public DbSet<CatalogObjectLink> CatalogObjectLinks => Set<CatalogObjectLink>();

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<TreeNode> TreeNodes => Set<TreeNode>();

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

        builder.Entity<TreeNode>(node =>
        {
            // Kaskada od konta: kont nie da się dziś usuwać, ale węzeł bez
            // właściciela nie ma sensu, więc gdy usuwanie konta się pojawi,
            // drzewo ma zniknąć razem z nim, a nie blokować je kluczem obcym.
            node.HasOne(n => n.User)
                .WithMany()
                .HasForeignKey(n => n.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Kaskada od rodzica: usunięcie węzła usuwa jego poddrzewo także na
            // poziomie bazy. Endpoint i tak wczytuje całe drzewo użytkownika,
            // więc EF usuwa śledzonych potomków sam — schemat jest drugim
            // bezpiecznikiem, żeby żaden węzeł nie został z rodzicem, którego
            // nie ma.
            node.HasOne(n => n.Parent)
                .WithMany(n => n.Children)
                .HasForeignKey(n => n.ParentId)
                .OnDelete(DeleteBehavior.Cascade);

            // `Restrict` od obiektu: obiektu słownika użytego w czyimkolwiek
            // drzewie nie wolno usunąć. Odmowę `object_in_tree` wydaje
            // `ObjectEndpoints.DeleteAsync`; klucz obcy jest drugim
            // bezpiecznikiem, gdyby ta kontrola zawiodła — kaskada w tym
            // miejscu po cichu wycięłaby węzły z cudzych drzew.
            node.HasOne(n => n.Object)
                .WithMany()
                .HasForeignKey(n => n.ObjectId)
                .OnDelete(DeleteBehavior.Restrict);

            // Indeks pod odczyt grupy rodzeństwa w kolejności. Celowo nie
            // unikalny: przenumerowanie przesuwa pozycje w miejscu, więc
            // unikalność łamałaby się chwilowo w środku `SaveChanges`.
            //
            // Unikalnego indeksu na duplikat rodzeństwa `(UserId, ParentId,
            // ObjectId)` też nie ma: SQLite traktuje `NULL` w unikalnym indeksie
            // jako różne wartości, więc nie złapałby duplikatu na najwyższym
            // poziomie. Ta reguła żyje w `TreeRules` i w transakcji endpointu.
            node.HasIndex(n => new { n.UserId, n.ParentId, n.Position });
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
