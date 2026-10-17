using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Api.Data;
using Api.Tree;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Api.Tests;

/// <summary>
/// Kopia wzorca ekranu przy rejestracji (S-16, PRD FR-001 w wersji
/// z 2026-10-17) na prawdziwym potoku HTTP i SQLite: rejestracja przez oba
/// kroki daje nowemu kontu wierną kopię wzorca o nazwach z loginem; brak
/// wzorca, niespójny wzorzec i awaria zapisu kopii zostawiają konto bez kopii,
/// a dwa ostatnie — wpis Error w logu.
///
/// Wyrocznią jest plan <c>context/changes/drzewo-domyslne/plan.md</c>
/// („Testing Strategy", „Critical Implementation Details"): nazwy kopii
/// i statusy są wpisane w testach. Wierność kopii porównuje odczyt
/// <c>GET /screens/{id}</c> kopii z odczytem wzorca po ścieżkach węzłów od
/// korzenia („obiekt@pozycja"), bo identyfikatory węzłów kopii są nowe.
/// Wzorzec jest zasiany z ręcznie wypisaną strukturą i przypisaniami
/// odbiegającymi od listy domyślnej, a jego stan po rejestracji porównany
/// z migawką sprzed niej.
///
/// Własne hosty, a nie host <see cref="AuthIntegrationTests"/>: flaga wzorca
/// jest jedna na bazę, więc zmieniałaby wynik tamtych rejestracji. Testy klasy
/// dzielą host i po kolei ustawiają wzorzec od nowa
/// (<see cref="IntegrationSeed.SetTemplateAsync"/>). Awaria zapisu kopii ma
/// host z interceptorem (<see cref="FailingCloneApiFactory"/>), uzbrajanym
/// po seedzie.
/// </summary>
public class RegistrationTemplateIntegrationTests(
    TestApiFactory factory,
    RegistrationTemplateIntegrationTests.FailingCloneApiFactory failingFactory)
    : IClassFixture<TestApiFactory>,
        IClassFixture<RegistrationTemplateIntegrationTests.FailingCloneApiFactory>
{
    /// <summary>Hasło spełniające reguły złożoności Identity z <c>Program.cs</c>.</summary>
    private const string Password = "Haslo-Testowe-1";

    private const string TemplateScreenName = "Testowy ekran prezentacyjny";

    private const string TemplateTreeName = "Drzewo testowe na potrzeby prezentacji";

    /// <summary>Niespójność flag wzorca.</summary>
    public enum Inconsistency
    {
        /// <summary>Flaga na ekranie, żadne drzewo bez flagi.</summary>
        ScreenWithoutTreeFlag,

        /// <summary>Flaga na ekranie i na drzewie, które nie jest drzewem tego ekranu.</summary>
        TreeFlagOnAnotherTree,
    }

    // --- Kopia --------------------------------------------------------------

    [Fact]
    public async Task Registration_with_a_template_gives_the_new_account_a_faithful_copy_named_after_the_login()
    {
        var template = await ArrangeTemplateAsync(factory);
        var treeBefore = await IntegrationSeed.ReadTreeAsync(factory, template.TreeId);
        var screenBefore = await IntegrationSeed.ReadScreenAsync(factory, template.ScreenId);

        using var client = factory.CreateClient();
        var login = NewLogin();

        var response = await IntegrationSeed.RegisterThroughBothStepsAsync(factory, client, login, Password);

        // Kontrakt kroku 2 bez zmian: `{ id, login, email }`.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var account = await response.Content.ReadFromJsonAsync<JsonElement>();
        var accountId = account.GetProperty("id").GetString()!;
        Assert.Equal(login, account.GetProperty("login").GetString());
        Assert.Equal($"{login}@test.local", account.GetProperty("email").GetString());
        Assert.Equal(
            ["email", "id", "login"],
            account.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal));

        var owned = await ReadOwnedAsync(factory, accountId);
        var tree = Assert.Single(owned.Trees);
        var screen = Assert.Single(owned.Screens);

        Assert.Equal($"{TemplateTreeName} {login}", tree.Name);
        Assert.Equal($"{TemplateScreenName} dla {login}", screen.Name);
        Assert.False(tree.IsTemplate);
        Assert.False(screen.IsTemplate);
        Assert.Equal(tree.Id, screen.TreeId);
        Assert.NotEqual(template.TreeId, tree.Id);

        using var owner = ClientFor(factory, accountId);
        var copy = await ReadScreenAsync(owner, screen.Id);
        var original = await ReadScreenAsync(template.Curator.Client, template.ScreenId);

        Assert.Equal($"{TemplateTreeName} {login}", copy.TreeName);
        Assert.Equal(original.GrainMinutes, copy.GrainMinutes);
        Assert.Equal(original.DefaultCategoryIds, copy.DefaultCategoryIds);
        Assert.Equal(original.NodePaths, copy.NodePaths);
        Assert.Equal(original.Assignments, copy.Assignments);
        Assert.Empty(copy.NodeIds.Intersect(original.NodeIds));

        // Struktura i przypisania wzorca w postaci zasianej w `ArrangeTemplateAsync`.
        Assert.Equal(
            ["0@0", "0@0/1@0", "0@0/1@0/2@0", "0@0/3@1", "4@1", "4@1/1@0"],
            copy.NodePaths.Select(template.Relabel).Order(StringComparer.Ordinal));

        Assert.Equal(treeBefore, await IntegrationSeed.ReadTreeAsync(factory, template.TreeId));
        Assert.Equal(screenBefore, await IntegrationSeed.ReadScreenAsync(factory, template.ScreenId));
    }

    // --- Brak wzorca --------------------------------------------------------

    [Fact]
    public async Task Registration_without_a_template_gives_an_account_with_no_trees_or_screens_and_no_log_entry()
    {
        // Wzorzec innego testu klasy mógł zostać — brak wzorca to brak flag.
        await IntegrationSeed.SetTemplateAsync(factory, screenId: null, treeId: null);

        using var client = factory.CreateClient();
        var login = NewLogin();

        var response = await IntegrationSeed.RegisterThroughBothStepsAsync(factory, client, login, Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var accountId = await ReadAccountIdAsync(response);

        var owned = await ReadOwnedAsync(factory, accountId);
        Assert.Empty(owned.Trees);
        Assert.Empty(owned.Screens);

        // Katalog logu powstaje dopiero przy pierwszym wpisie — jego brak też
        // znaczy „bez wpisu". Zapis do pliku jest synchroniczny.
        var log = Directory.Exists(factory.LogDirectory) ? IntegrationSeed.ReadLog(factory) : string.Empty;
        Assert.DoesNotContain(accountId, log);
    }

    // --- Niespójny wzorzec --------------------------------------------------

    [Theory]
    [InlineData(Inconsistency.ScreenWithoutTreeFlag)]
    [InlineData(Inconsistency.TreeFlagOnAnotherTree)]
    public async Task Inconsistent_template_leaves_the_account_without_a_copy_and_writes_an_error_entry(
        Inconsistency inconsistency)
    {
        var template = await ArrangeTemplateAsync(factory);

        int? flaggedTree = inconsistency switch
        {
            Inconsistency.ScreenWithoutTreeFlag => null,
            Inconsistency.TreeFlagOnAnotherTree => await IntegrationSeed.SeedTreeAsync(
                factory, template.Curator.Id, "Inne drzewo kuratora"),
            _ => throw new ArgumentOutOfRangeException(nameof(inconsistency), inconsistency, null),
        };

        await IntegrationSeed.SetTemplateAsync(factory, template.ScreenId, flaggedTree);

        using var client = factory.CreateClient();
        var login = NewLogin();

        var response = await IntegrationSeed.RegisterThroughBothStepsAsync(factory, client, login, Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var accountId = await ReadAccountIdAsync(response);

        var owned = await ReadOwnedAsync(factory, accountId);
        Assert.Empty(owned.Trees);
        Assert.Empty(owned.Screens);

        var header = LogEntryHeaderFor(IntegrationSeed.ReadLog(factory), accountId);
        Assert.Contains("[ERR]", header);
        Assert.Contains("Api.Screens.ScreenTemplateClone", header);
    }

    // --- Awaria zapisu kopii ------------------------------------------------

    [Fact]
    public async Task Failed_copy_save_still_answers_200_and_leaves_a_signed_in_account_without_a_copy()
    {
        var template = await ArrangeTemplateAsync(failingFactory);
        var treeBefore = await IntegrationSeed.ReadTreeAsync(failingFactory, template.TreeId);
        var screenBefore = await IntegrationSeed.ReadScreenAsync(failingFactory, template.ScreenId);

        using var client = failingFactory.CreateClient();
        var login = NewLogin();

        HttpResponseMessage response;
        failingFactory.Failure.Arm();

        try
        {
            response = await IntegrationSeed.RegisterThroughBothStepsAsync(failingFactory, client, login, Password);
        }
        finally
        {
            failingFactory.Failure.Disarm();
        }

        // Interceptor zadziałał dokładnie raz — przy zapisie kopii, nie konta.
        Assert.Equal(1, failingFactory.Failure.FiredCount);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var accountId = await ReadAccountIdAsync(response);

        var signedIn = await client.PostAsJsonAsync("/auth/login", new { login, password = Password });
        Assert.Equal(HttpStatusCode.OK, signedIn.StatusCode);

        var owned = await ReadOwnedAsync(failingFactory, accountId);
        Assert.Empty(owned.Trees);
        Assert.Empty(owned.Screens);

        // Wpis jest i niesie konto oraz przyczynę — bez hasła i kodu.
        var log = IntegrationSeed.ReadLog(failingFactory);
        var header = LogEntryHeaderFor(log, accountId);
        Assert.Contains("[ERR]", header);
        Assert.Contains("Api.Screens.ScreenTemplateClone", header);
        Assert.Contains(FailingTreeInsertInterceptor.Marker, log);
        Assert.DoesNotContain(Password, log);
        Assert.DoesNotContain(failingFactory.ReadLastVerificationCode(login), log);

        Assert.Equal(treeBefore, await IntegrationSeed.ReadTreeAsync(failingFactory, template.TreeId));
        Assert.Equal(screenBefore, await IntegrationSeed.ReadScreenAsync(failingFactory, template.ScreenId));
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>
    /// Wzorzec na koncie kuratora: drzewo o0 → [o1 → [o2], o3] oraz o4 → [o1]
    /// (o1 powtórzony pod innym korzeniem — dozwolone przez FR-004), ekran
    /// o ziarnie 15 min z listą domyślną [k0, k1], węzeł o3 dopasowany do
    /// [k2, k0], węzeł o4 z zerem kategorii. Flagi stawiane na końcu, po
    /// zdjęciu poprzednich.
    /// </summary>
    private static async Task<ArrangedTemplate> ArrangeTemplateAsync(TestApiFactory host)
    {
        var prefix = IntegrationSeed.NewPrefix();
        var curator = await IntegrationSeed.CreateAccountAsync(host);
        var objects = await IntegrationSeed.SeedObjectsAsync(host, prefix, 5);
        IReadOnlyList<int> categories = [.. (await IntegrationSeed.SeedCategoriesAsync(host, prefix, 3)).Order()];

        var treeId = await IntegrationSeed.SeedTreeAsync(host, curator.Id, TemplateTreeName);
        var roots = await IntegrationSeed.SeedNodesAsync(host, treeId, null, [objects[0], objects[4]]);
        var level1 = await IntegrationSeed.SeedNodesAsync(host, treeId, roots[0], [objects[1], objects[3]]);
        await IntegrationSeed.SeedNodesAsync(host, treeId, level1[0], [objects[2]]);
        await IntegrationSeed.SeedNodesAsync(host, treeId, roots[1], [objects[1]]);

        var screenId = await IntegrationSeed.SeedScreenAsync(
            host, curator.Id, treeId, TemplateScreenName, 15, [categories[0], categories[1]]);
        await IntegrationSeed.SetNodeCategoriesAsync(host, screenId, level1[1], [categories[2], categories[0]]);
        await IntegrationSeed.SetNodeCategoriesAsync(host, screenId, roots[1], []);

        await IntegrationSeed.SetTemplateAsync(host, screenId, treeId);

        return new ArrangedTemplate(curator, treeId, screenId, objects);
    }

    /// <summary>Losowy login w dozwolonym zestawie znaków, 13 znaków.</summary>
    private static string NewLogin() => $"t{Guid.NewGuid():N}"[..13];

    private static async Task<string> ReadAccountIdAsync(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;

    /// <summary>Klient HTTP niosący tożsamość konta nagłówkiem — tak jak serwer React Routera.</summary>
    private static HttpClient ClientFor(TestApiFactory host, string userId)
    {
        var client = host.CreateClient();
        client.DefaultRequestHeaders.Add(TreeIdentity.UserHeader, userId);

        return client;
    }

    /// <summary>Drzewa i ekrany konta, odczytane wprost z tabel.</summary>
    private static async Task<OwnedResources> ReadOwnedAsync(TestApiFactory host, string userId)
    {
        await using (host.CreateDbScope(out var db))
        {
            var trees = await db.Trees
                .AsNoTracking()
                .Where(tree => tree.UserId == userId)
                .Select(tree => new OwnedTree(tree.Id, tree.Name, tree.IsTemplate))
                .ToListAsync();

            var screens = await db.Screens
                .AsNoTracking()
                .Where(screen => screen.UserId == userId)
                .Select(screen => new OwnedScreen(screen.Id, screen.TreeId, screen.Name, screen.IsTemplate))
                .ToListAsync();

            return new OwnedResources(trees, screens);
        }
    }

    /// <summary>
    /// <c>GET /screens/{id}</c> sprowadzony do postaci niezależnej od
    /// identyfikatorów węzłów: każdy węzeł to ścieżka od korzenia
    /// „obiekt@pozycja/…", a przypisania — „ścieżka: kategorie w kolejności".
    /// </summary>
    private static async Task<ScreenReadBack> ReadScreenAsync(HttpClient client, int screenId)
    {
        var response = await client.GetAsync($"/screens/{screenId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        var nodes = body.GetProperty("nodes").EnumerateArray()
            .Select(node => new
            {
                Id = node.GetProperty("id").GetInt32(),
                ParentId = node.GetProperty("parentId").ValueKind == JsonValueKind.Null
                    ? (int?)null
                    : node.GetProperty("parentId").GetInt32(),
                ObjectId = node.GetProperty("objectId").GetInt32(),
                Position = node.GetProperty("position").GetInt32(),
            })
            .ToDictionary(node => node.Id);

        string PathOf(int nodeId)
        {
            var steps = new List<string>();

            for (int? current = nodeId; current is { } id; current = nodes[id].ParentId)
            {
                steps.Add($"{nodes[id].ObjectId}@{nodes[id].Position}");
            }

            steps.Reverse();

            return string.Join('/', steps);
        }

        var assignments = body.GetProperty("assignments").EnumerateArray()
            .Select(entry =>
                $"{PathOf(entry.GetProperty("nodeId").GetInt32())}: " +
                string.Join(",", entry.GetProperty("categoryIds").EnumerateArray().Select(c => c.GetInt32())))
            .Order(StringComparer.Ordinal)
            .ToList();

        return new ScreenReadBack(
            body.GetProperty("treeName").GetString()!,
            body.GetProperty("grainMinutes").GetInt32(),
            [.. body.GetProperty("defaultCategoryIds").EnumerateArray().Select(c => c.GetInt32())],
            [.. nodes.Keys.Select(PathOf).Order(StringComparer.Ordinal)],
            assignments,
            [.. nodes.Keys]);
    }

    /// <summary>
    /// Nagłówek wpisu logu (czas, poziom, kategoria), którego treść zawiera
    /// <paramref name="marker"/> — szablon pliku stawia treść w wierszu zaraz
    /// pod nagłówkiem. Brak takiego wpisu jest błędem asercji.
    /// </summary>
    private static string LogEntryHeaderFor(string log, string marker)
    {
        var lines = log.Split('\n');
        var index = Array.FindIndex(lines, line => line.Contains(marker, StringComparison.Ordinal));

        Assert.True(index > 0, $"Brak wpisu w logu z '{marker}'.");

        return lines[index - 1];
    }

    /// <summary>Zasiany wzorzec i jego kurator.</summary>
    private sealed record ArrangedTemplate(TestAccount Curator, int TreeId, int ScreenId, IReadOnlyList<int> Objects)
    {
        /// <summary>
        /// Ścieżka z identyfikatorami obiektów przepisana na ich indeksy
        /// w seedzie („17@0" → „0@0"), żeby dało się ją porównać z wypisaną
        /// strukturą.
        /// </summary>
        public string Relabel(string path)
            => string.Join('/', path.Split('/').Select(step =>
            {
                var at = step.IndexOf('@');
                var index = Objects.ToList().IndexOf(int.Parse(step[..at], System.Globalization.CultureInfo.InvariantCulture));

                return $"{index}{step[at..]}";
            }));
    }

    private sealed record OwnedTree(int Id, string Name, bool IsTemplate);

    private sealed record OwnedScreen(int Id, int TreeId, string Name, bool IsTemplate);

    private sealed record OwnedResources(IReadOnlyList<OwnedTree> Trees, IReadOnlyList<OwnedScreen> Screens);

    private sealed record ScreenReadBack(
        string TreeName,
        int GrainMinutes,
        IReadOnlyList<int> DefaultCategoryIds,
        IReadOnlyList<string> NodePaths,
        IReadOnlyList<string> Assignments,
        IReadOnlyList<int> NodeIds);

    /// <summary>
    /// <see cref="TestApiFactory"/> z interceptorem awarii kopii dołożonym do
    /// opcji <c>AppDbContext</c> hosta — opcje z <c>Program.cs</c> (plik,
    /// <c>SqliteBusyTimeoutInterceptor</c>) zostają.
    /// </summary>
    public sealed class FailingCloneApiFactory : TestApiFactory
    {
        /// <summary>Interceptor wspólny dla wszystkich kontekstów tego hosta.</summary>
        public FailingTreeInsertInterceptor Failure { get; } = new();

        protected override void ConfigureAppDbContext(DbContextOptionsBuilder options)
            => options.AddInterceptors(Failure);
    }

    /// <summary>
    /// Jednorazowo uzbrajana awaria zapisu kopii: po <see cref="Arm"/>
    /// najbliższe <c>SaveChanges</c>, w którym kontekst dodaje drzewo
    /// (<see cref="UserTree"/>), rzuca wyjątek i rozbraja interceptor. Zapisy
    /// bez dodawanego drzewa — rezerwacja w kroku 1, konto i usunięcie
    /// rezerwacji w kroku 2 — przechodzą, więc pada wyłącznie zapis kopii.
    /// </summary>
    public sealed class FailingTreeInsertInterceptor : SaveChangesInterceptor
    {
        /// <summary>Treść wstrzykniętego wyjątku — wyłącznie ASCII, żeby dało się ją znaleźć w pliku logu.</summary>
        public const string Marker = "injected-template-copy-failure";

        private int _armed;

        private int _firedCount;

        /// <summary>Ile razy interceptor rzucił od ostatniego <see cref="Arm"/>.</summary>
        public int FiredCount => Volatile.Read(ref _firedCount);

        public void Arm()
        {
            Interlocked.Exchange(ref _firedCount, 0);
            Interlocked.Exchange(ref _armed, 1);
        }

        public void Disarm() => Interlocked.Exchange(ref _armed, 0);

        public override InterceptionResult<int> SavingChanges(
            DbContextEventData eventData,
            InterceptionResult<int> result)
        {
            FailIfArmed(eventData.Context);

            return base.SavingChanges(eventData, result);
        }

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            FailIfArmed(eventData.Context);

            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }

        private void FailIfArmed(DbContext? context)
        {
            if (Volatile.Read(ref _armed) == 0
                || context is null
                || !context.ChangeTracker.Entries<UserTree>().Any(entry => entry.State == EntityState.Added))
            {
                return;
            }

            if (Interlocked.Exchange(ref _armed, 0) == 1)
            {
                Interlocked.Increment(ref _firedCount);

                throw new InvalidOperationException(Marker);
            }
        }
    }
}
