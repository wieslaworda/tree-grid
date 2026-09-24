using Api.Categories;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Api.Data;

/// <summary>
/// Kontekst EF Core aplikacji. Od S-01 jest kontekstem Identity — daje
/// <c>UserManager</c> miejsce na konta. Od S-02 niesie też słownik obiektów
/// (<see cref="CatalogObject"/>), wspólny dla wszystkich kont i bez relacji
/// między obiektami. Od S-09 —
/// słownik kategorii danych (<see cref="Category"/>), również wspólny i na razie
/// bez relacji z czymkolwiek. Od S-03 — nazwane drzewa użytkownika
/// (<see cref="UserTree"/>): pierwsza tabela z właścicielem, dowolnie wiele drzew
/// na konto, każde złożone z węzłów (<see cref="TreeNode"/>) — wystąpień obiektów
/// słownika. Węzeł należy do drzewa, drzewo do konta. Od S-06 — nazwane ekrany
/// użytkownika (<see cref="Screen"/>), druga tabela z właścicielem: ekran
/// wskazuje jedno z drzew konta i niesie uporządkowaną listę kategorii
/// domyślnych (<see cref="ScreenDefaultCategory"/>) oraz przypisania kategorii
/// do węzłów tego drzewa (<see cref="ScreenNodeCategory"/>). Kolumny czasowe
/// gridu dochodzą w kolejnym plastrze.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<AppUser>(options)
{
    public DbSet<CatalogObject> CatalogObjects => Set<CatalogObject>();

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<UserTree> Trees => Set<UserTree>();

    public DbSet<TreeNode> TreeNodes => Set<TreeNode>();

    public DbSet<Screen> Screens => Set<Screen>();

    public DbSet<ScreenDefaultCategory> ScreenDefaultCategories => Set<ScreenDefaultCategory>();

    public DbSet<ScreenNodeCategory> ScreenNodeCategories => Set<ScreenNodeCategory>();

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

        builder.Entity<UserTree>(tree =>
        {
            // Kaskada od konta: kont nie da się dziś usuwać, ale drzewo bez
            // właściciela nie ma sensu, więc gdy usuwanie konta się pojawi,
            // drzewa mają zniknąć razem z nim (a z nimi — kaskadą niżej — ich
            // węzły), a nie blokować je kluczem obcym.
            tree.HasOne(t => t.User)
                .WithMany()
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Długości jako metadane, wiążący limit w `TreeNameRules` — ten sam
            // układ co w blokach słowników wyżej.
            tree.Property(t => t.Name).HasMaxLength(UserTree.NameMaxLength);
            tree.Property(t => t.NormalizedName).HasMaxLength(UserTree.NameMaxLength);

            // Unikalność nazwy w obrębie konta, po postaci znormalizowanej.
            // `UserId` jest wymagane, więc pułapka `NULL` z indeksu rodzeństwa
            // (niżej) tu nie występuje: dwa drzewa jednego konta o tej samej
            // nazwie zderzą się na indeksie zawsze.
            tree.HasIndex(t => new { t.UserId, t.NormalizedName }).IsUnique();
        });

        builder.Entity<TreeNode>(node =>
        {
            // Kaskada od drzewa: usunięcie drzewa usuwa jego węzły także na
            // poziomie bazy. Właściciela węzeł nie ma — ma go drzewo.
            node.HasOne(n => n.Tree)
                .WithMany(t => t.Nodes)
                .HasForeignKey(n => n.TreeId)
                .OnDelete(DeleteBehavior.Cascade);

            // Kaskada od rodzica: usunięcie węzła usuwa jego poddrzewo także na
            // poziomie bazy. Endpoint i tak wczytuje całe drzewo z adresu,
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
            // Unikalnego indeksu na duplikat rodzeństwa `(TreeId, ParentId,
            // ObjectId)` też nie ma: SQLite traktuje `NULL` w unikalnym indeksie
            // jako różne wartości, więc nie złapałby duplikatu na najwyższym
            // poziomie. Ta reguła żyje w `TreeRules` i w transakcji endpointu.
            node.HasIndex(n => new { n.TreeId, n.ParentId, n.Position });
        });

        builder.Entity<Screen>(screen =>
        {
            // Kaskada od konta — z tego samego powodu co przy drzewie wyżej.
            // Kont nie da się dziś usuwać, a zderzenie tej kaskady z `Restrict`
            // od drzewa (niżej) nie jest projektowane w tym plastrze (plan
            // `zapisane-ekrany`, „What We're NOT Doing").
            screen.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // `Restrict` od drzewa: drzewa wskazywanego przez ekran nie wolno
            // usunąć — kaskada w tym miejscu po cichu wycięłaby ekrany razem
            // z drzewem. Klucz obcy jest drugim bezpiecznikiem za odmową
            // w endpoincie usuwania drzewa. Nawigacji zwrotnej w `UserTree` nie
            // ma celowo: nagłówek drzewa nie rośnie o ekrany.
            screen.HasOne(s => s.Tree)
                .WithMany()
                .HasForeignKey(s => s.TreeId)
                .OnDelete(DeleteBehavior.Restrict);

            // Długości jako metadane, wiążący limit w `ScreenRules` — ten sam
            // układ co przy drzewie.
            screen.Property(s => s.Name).HasMaxLength(Screen.NameMaxLength);
            screen.Property(s => s.NormalizedName).HasMaxLength(Screen.NameMaxLength);

            // Unikalność nazwy w obrębie konta, po postaci znormalizowanej —
            // jak przy drzewie. Indeks obsługuje też filtr po właścicielu, więc
            // osobnego indeksu na `UserId` nie ma.
            screen.HasIndex(s => new { s.UserId, s.NormalizedName }).IsUnique();

            // Pod pytanie „czy któryś ekran wskazuje to drzewo" i pod
            // sprawdzenie klucza obcego przy usuwaniu drzewa.
            screen.HasIndex(s => s.TreeId);
        });

        builder.Entity<ScreenDefaultCategory>(entry =>
        {
            entry.HasKey(e => new { e.ScreenId, e.CategoryId });

            // Obie kaskady na poziomie bazy: lista schodzi razem z ekranem,
            // a pozycja listy — razem z kategorią usuniętą ze słownika.
            entry.HasOne(e => e.Screen)
                .WithMany(s => s.DefaultCategories)
                .HasForeignKey(e => e.ScreenId)
                .OnDelete(DeleteBehavior.Cascade);

            entry.HasOne(e => e.Category)
                .WithMany()
                .HasForeignKey(e => e.CategoryId)
                .OnDelete(DeleteBehavior.Cascade);

            // Pod kaskadę od kategorii — klucz główny zaczyna się od
            // `ScreenId`, więc jej nie obsługuje.
            entry.HasIndex(e => e.CategoryId);
        });

        builder.Entity<ScreenNodeCategory>(assignment =>
        {
            assignment.HasKey(a => new { a.ScreenId, a.TreeNodeId, a.CategoryId });

            // Trzy ścieżki usuwania i wszystkie kaskadą bazy. Kaskada od węzła
            // musi działać bez śledzenia przypisań: usunięcie węzła wczytuje
            // wyłącznie węzły drzewa, a przypisania węzła i jego potomków
            // zdejmuje schemat. SQLite dopuszcza wiele ścieżek kaskady do jednej
            // tabeli, a EF Core włącza na nim `foreign_keys`.
            assignment.HasOne(a => a.Screen)
                .WithMany(s => s.NodeCategories)
                .HasForeignKey(a => a.ScreenId)
                .OnDelete(DeleteBehavior.Cascade);

            assignment.HasOne(a => a.Node)
                .WithMany()
                .HasForeignKey(a => a.TreeNodeId)
                .OnDelete(DeleteBehavior.Cascade);

            assignment.HasOne(a => a.Category)
                .WithMany()
                .HasForeignKey(a => a.CategoryId)
                .OnDelete(DeleteBehavior.Cascade);

            // Pod kaskady od węzła i od kategorii — klucz główny zaczyna się od
            // `ScreenId`, więc ich nie obsługuje.
            assignment.HasIndex(a => a.TreeNodeId);
            assignment.HasIndex(a => a.CategoryId);
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
