using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Api.Errors;
using Api.Screens;
using Microsoft.EntityFrameworkCore;

namespace Api.Tests;

/// <summary>
/// Ryzyko #2 test-planu: przypisania kategorii w ekranach są poprawne po
/// zapisie i po każdym zdarzeniu, które je zmienia — usunięciu węzła, dodaniu
/// węzła, zmianie kategorii węzła, usunięciu kategorii, zmianie drzewa
/// i nagłówka ekranu — a odmowa niczego nie zdejmuje.
///
/// Wyrocznią są PRD i plany, nie kod pod testem: FR-012 (<c>prd.md:96</c>) —
/// ekran śledzi swoje drzewo; US-02 AC (<c>prd.md:60-63</c>) — zmiana dotyczy
/// tylko wskazanego węzła, a dwa ekrany jednego drzewa mają niezależne
/// przypisania; roadmap S-06 (<c>roadmap.md:192</c>) — zapisany ekran odtwarza
/// kategorie węzłów bez zmian; plan <c>zapisane-ekrany</c> (<c>plan.md:51</c>
/// — kaskada kategorii z odmową dla jedynej domyślnej, <c>:239</c> — nowy węzeł
/// dostaje listę domyślną każdego ekranu); zmiana drzewa ekranu jako świadoma
/// decyzja produktowa (commit <c>e7a94cb</c>). Oczekiwane listy są wpisane
/// w testach, a nie liczone przez <c>ScreenRules</c>.
///
/// Asercją są tabele <c>ScreenNodeCategories</c> i
/// <c>ScreenDefaultCategories</c> odczytane wprost, nie odpowiedź <c>GET</c>:
/// <c>GET /screens/{id}</c> wypisuje przypisania wyłącznie bieżących węzłów,
/// więc osierocone wiersze (brak kaskady, zmiana drzewa bez sprzątnięcia)
/// byłyby przez niego niewidoczne. Wyjątkiem jest pierwszy test, którego
/// zachowaniem jest właśnie odczyt zapisanego ekranu. Kategorie porównujemy po
/// kolejności, nie po surowych wartościach <c>Position</c> — to klucz porządku,
/// w którym kaskada zostawia luki.
///
/// Testy w klasie dzielą jeden host i plik bazy (<see cref="TestApiFactory"/>),
/// a słownik kategorii jest wspólny, więc każdy test zakłada własne konto,
/// obiekty i kategorie z unikalnym prefiksem i zawęża asercje do własnych
/// identyfikatorów.
/// </summary>
public class ScreenIntegrationTests(TestApiFactory factory) : IClassFixture<TestApiFactory>
{
    private const string ScreenName = "Ekran testowy";

    private const int Grain = 15;

    // --- Zapis i odczyt (S-06, US-02) ----------------------------------------

    [Fact]
    public async Task Saved_screen_reads_back_the_adjusted_node_in_its_order_and_the_defaults_on_other_nodes()
    {
        // Obie listy idą w kolejności malejących identyfikatorów, więc utrata
        // `Position` (odczyt po samym identyfikatorze) odwróciłaby je.
        var arranged = await ArrangeAsync(objectCount: 3, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, 0, 1);
        var under = await SeedNodesAsync(arranged, arranged.TreeId, parentId: top[0], 2);
        var (n1, n2, n3) = (top[0], top[1], under[0]);

        var created = await client.PostAsJsonAsync("/screens", new
        {
            name = ScreenName,
            treeId = arranged.TreeId,
            grainMinutes = Grain,
            defaultCategoryIds = new[] { k1, k0 },
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var screenId = await ReadIdAsync(created);

        var adjusted = await SetNodeCategoriesAsync(client, screenId, n1, k2, k1);
        Assert.Equal(HttpStatusCode.NoContent, adjusted.StatusCode);

        var response = await client.GetAsync($"/screens/{screenId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;

        Assert.Equal([k1, k0], Ints(root.GetProperty("defaultCategoryIds")));

        var assignments = root.GetProperty("assignments")
            .EnumerateArray()
            .ToDictionary(
                entry => entry.GetProperty("nodeId").GetInt32(),
                entry => Ints(entry.GetProperty("categoryIds")));

        Assert.Equal(3, assignments.Count);
        Assert.Equal([k2, k1], assignments[n1]);
        Assert.Equal([k1, k0], assignments[n2]);
        Assert.Equal([k1, k0], assignments[n3]);
    }

    // --- Kaskady od drzewa (FR-012) ------------------------------------------

    [Fact]
    public async Task Deleting_a_node_removes_its_subtree_assignments_in_every_screen_and_keeps_the_other_occurrence_of_the_object()
    {
        // P → A(a1) → C, Q → A(a2). Oba wystąpienia A dopasowane w obu
        // ekranach; usuwane jest a1 z poddrzewem.
        const int P = 0, Q = 1, A = 2, C = 3;
        var arranged = await ArrangeAsync(objectCount: 4, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, P, Q);
        var a1 = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: top[0], A))[0];
        var c = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: a1, C))[0];
        var a2 = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: top[1], A))[0];

        var s1 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran pierwszy", k0, k1);
        var s2 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran drugi", k2);

        await IntegrationSeed.SetNodeCategoriesAsync(factory, s1, a1, [k2]);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, s1, a2, [k1, k2]);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, s2, a1, [k0]);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, s2, a2, [k0, k2]);

        var before = await IntegrationSeed.ReadAssignmentsAsync(factory, s1, s2);

        var response = await client.DeleteAsync($"/trees/{arranged.TreeId}/nodes/{a1}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await ReadAssignmentsOfNodesAsync(a1, c));
        Assert.Equal(
            before.Where(row => row.TreeNodeId != a1 && row.TreeNodeId != c),
            await IntegrationSeed.ReadAssignmentsAsync(factory, s1, s2));
        Assert.Contains(before, row => row.ScreenId == s1 && row.TreeNodeId == a2);
        Assert.Contains(before, row => row.ScreenId == s2 && row.TreeNodeId == a2);
    }

    [Fact]
    public async Task Adding_a_node_gives_it_each_screen_own_default_list_in_order_and_leaves_other_assignments_unchanged()
    {
        const int P = 0, X = 1, N = 2;
        var arranged = await ArrangeAsync(objectCount: 3, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var p = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, P))[0];
        var x = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: p, X))[0];

        var s1 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran pierwszy", k2, k0);
        var s2 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran drugi", k0, k1, k2);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, s1, x, [k1]);

        var before = await IntegrationSeed.ReadAssignmentsAsync(factory, s1, s2);

        var response = await client.PostAsJsonAsync(
            $"/trees/{arranged.TreeId}/nodes",
            new { objectId = arranged.Objects[N], parentId = p });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var added = await ReadIdAsync(response);

        var after = await IntegrationSeed.ReadAssignmentsAsync(factory, s1, s2);

        Assert.Equal(before, after.Where(row => row.TreeNodeId != added));
        Assert.Equal([k2, k0], CategoriesOf(after, s1, added));
        Assert.Equal([k0, k1, k2], CategoriesOf(after, s2, added));
    }

    [Fact]
    public async Task Deleting_a_tree_used_by_a_screen_is_refused_and_leaves_tree_screen_and_assignments_unchanged()
    {
        const int A = 0, B = 1;
        var arranged = await ArrangeAsync(objectCount: 2, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var a = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, A))[0];
        var b = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: a, B))[0];

        var screenId = await SeedScreenAsync(arranged, arranged.TreeId, ScreenName, k0, k1);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, screenId, b, [k2]);

        var treeBefore = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);
        var screenBefore = await IntegrationSeed.ReadScreenAsync(factory, screenId);

        var response = await client.DeleteAsync($"/trees/{arranged.TreeId}");

        await AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeInScreen);
        Assert.Equal(treeBefore, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
        Assert.Equal(screenBefore, await IntegrationSeed.ReadScreenAsync(factory, screenId));
    }

    // --- Niezależność ekranów (US-02 AC) -------------------------------------

    [Fact]
    public async Task Changing_node_categories_in_one_screen_leaves_the_other_screen_on_the_same_tree_unchanged()
    {
        const int A = 0, B = 1;
        var arranged = await ArrangeAsync(objectCount: 2, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, A, B);
        var (a, b) = (top[0], top[1]);

        // Ta sama lista domyślna w obu ekranach: zapis po samym węźle zdjąłby
        // wiersze ekranu drugiego, a nie tylko je zmienił.
        var s1 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran pierwszy", k0, k1);
        var s2 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran drugi", k0, k1);

        var s1Before = await IntegrationSeed.ReadAssignmentsAsync(factory, s1);
        var s2Before = await IntegrationSeed.ReadScreenAsync(factory, s2);

        var response = await SetNodeCategoriesAsync(client, s1, a, k2, k0);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(s2Before, await IntegrationSeed.ReadScreenAsync(factory, s2));

        var s1After = await IntegrationSeed.ReadAssignmentsAsync(factory, s1);
        Assert.Equal([k2, k0], CategoriesOf(s1After, s1, a));
        Assert.Equal(
            s1Before.Where(row => row.TreeNodeId == b),
            s1After.Where(row => row.TreeNodeId == b));
    }

    // --- Kaskady od kategorii (zapisane-ekrany/plan.md:51) -------------------

    [Fact]
    public async Task Deleting_a_category_used_beside_others_removes_its_rows_from_both_tables_and_keeps_the_remaining_order()
    {
        const int A = 0, B = 1;
        var arranged = await ArrangeAsync(objectCount: 2, categoryCount: 4);
        using var client = arranged.Account.Client;
        var (k0, k1, k2, k3) = (arranged.K(0), arranged.K(1), arranged.K(2), arranged.K(3));

        var top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, A, B);
        var a = top[0];

        // Usuwana k1 stoi w środku list — po kaskadzie zostaje luka w `Position`.
        var s1 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran pierwszy", k2, k1, k0);
        var s2 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran drugi", k1, k3);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, s1, a, [k3, k1, k2]);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, s2, a, [k0, k1]);

        var assignmentsBefore = await IntegrationSeed.ReadAssignmentsAsync(factory, s1, s2);
        var defaultsBefore = await IntegrationSeed.ReadDefaultCategoriesAsync(factory, s1, s2);

        var response = await client.DeleteAsync($"/categories/{k1}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False(await CategoryExistsAsync(k1));
        Assert.Equal(
            AssignmentOrder(assignmentsBefore.Where(row => row.CategoryId != k1)),
            AssignmentOrder(await IntegrationSeed.ReadAssignmentsAsync(factory, s1, s2)));
        Assert.Equal(
            DefaultOrder(defaultsBefore.Where(row => row.CategoryId != k1)),
            DefaultOrder(await IntegrationSeed.ReadDefaultCategoriesAsync(factory, s1, s2)));
    }

    [Fact]
    public async Task Deleting_the_sole_default_category_of_a_screen_is_refused_and_leaves_the_category_and_both_tables_unchanged()
    {
        // k0 jest jedyną domyślną ekranu pierwszego, a w drugim stoi na liście
        // domyślnej obok k1 i w dopasowaniu węzła — odmowa nie może zdjąć
        // żadnego z tych wierszy.
        const int A = 0, B = 1;
        var arranged = await ArrangeAsync(objectCount: 2, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, A, B);

        var s1 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran pierwszy", k0);
        var s2 = await SeedScreenAsync(arranged, arranged.TreeId, "Ekran drugi", k1, k0);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, s2, top[0], [k0, k2]);

        var s1Before = await IntegrationSeed.ReadScreenAsync(factory, s1);
        var s2Before = await IntegrationSeed.ReadScreenAsync(factory, s2);

        var response = await client.DeleteAsync($"/categories/{k0}");

        await AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.CategorySoleScreenDefault);
        Assert.True(await CategoryExistsAsync(k0));
        Assert.Equal(s1Before, await IntegrationSeed.ReadScreenAsync(factory, s1));
        Assert.Equal(s2Before, await IntegrationSeed.ReadScreenAsync(factory, s2));
    }

    // --- Zmiana nagłówka ekranu ----------------------------------------------

    [Fact]
    public async Task Changing_the_screen_tree_drops_every_assignment_of_the_old_tree_and_gives_each_new_tree_node_the_default_list()
    {
        // T1: o0 → [o2], o1; o0 dopasowany. T2: o1, o3 → [o0].
        var arranged = await ArrangeAsync(objectCount: 4, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var t1Top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, 0, 1);
        var t1Under = await SeedNodesAsync(arranged, arranged.TreeId, parentId: t1Top[0], 2);
        int[] t1Nodes = [.. t1Top, .. t1Under];

        var t2 = await IntegrationSeed.SeedTreeAsync(factory, arranged.Account.Id, "Drzewo drugie");
        var t2Top = await SeedNodesAsync(arranged, t2, parentId: null, 1, 3);
        var t2Under = await SeedNodesAsync(arranged, t2, parentId: t2Top[1], 0);
        int[] t2Nodes = [.. t2Top, .. t2Under];

        var screenId = await SeedScreenAsync(arranged, arranged.TreeId, ScreenName, k1, k0);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, screenId, t1Top[0], [k2]);
        Assert.NotEmpty(await ReadAssignmentsOfNodesAsync(t1Nodes));

        var response = await UpdateScreenAsync(client, screenId, ScreenName, t2, Grain, k1, k0);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(t2, (await IntegrationSeed.ReadScreenHeaderAsync(factory, screenId))!.TreeId);

        // Wprost po węzłach starego drzewa, w każdym ekranie — odczyt przez
        // `GET` albo po samym ekranie nowego drzewa nie zobaczyłby sierot.
        Assert.Empty(await ReadAssignmentsOfNodesAsync(t1Nodes));

        var after = await IntegrationSeed.ReadAssignmentsAsync(factory, screenId);
        Assert.Equal(
            t2Nodes.Order().SelectMany(node => new[] { (screenId, node, k1), (screenId, node, k0) }),
            AssignmentOrder(after));
        Assert.Equal(
            [(screenId, k1), (screenId, k0)],
            DefaultOrder(await IntegrationSeed.ReadDefaultCategoriesAsync(factory, screenId)));
    }

    [Fact]
    public async Task Changing_the_screen_tree_to_another_account_tree_is_refused_and_leaves_the_screen_unchanged()
    {
        // Kontrola właściciela przy `PUT` (owasp-cr/raport.md:361): cudze drzewo
        // daje ten sam błąd pola `treeId` co drzewo nieistniejące.
        var arranged = await ArrangeAsync(objectCount: 2, categoryCount: 2);
        using var client = arranged.Account.Client;
        var (k0, k1) = (arranged.K(0), arranged.K(1));

        await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, 0);
        var screenId = await SeedScreenAsync(arranged, arranged.TreeId, ScreenName, k0, k1);

        var stranger = await IntegrationSeed.CreateAccountAsync(factory);
        stranger.Client.Dispose();
        var strangerTree = await IntegrationSeed.SeedTreeAsync(factory, stranger.Id, "Drzewo cudze");
        await SeedNodesAsync(arranged, strangerTree, parentId: null, 1);

        var screenBefore = await IntegrationSeed.ReadScreenAsync(factory, screenId);
        var strangerTreeBefore = await IntegrationSeed.ReadTreeAsync(factory, strangerTree);

        var response = await UpdateScreenAsync(client, screenId, ScreenName, strangerTree, Grain, k0, k1);

        var error = await AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.True(
            error.Context.GetProperty(ApiErrorContextKeys.Fields).TryGetProperty(ScreenRequestFields.TreeId, out _),
            $"Odmowa bez błędu pola '{ScreenRequestFields.TreeId}': {error.Context}");
        Assert.Equal(screenBefore, await IntegrationSeed.ReadScreenAsync(factory, screenId));
        Assert.Equal(strangerTreeBefore, await IntegrationSeed.ReadTreeAsync(factory, strangerTree));
    }

    [Fact]
    public async Task Changing_only_the_name_and_then_only_the_grain_keeps_the_default_list_and_every_node_assignment()
    {
        var arranged = await ArrangeAsync(objectCount: 2, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, 0, 1);
        var screenId = await SeedScreenAsync(arranged, arranged.TreeId, ScreenName, k1, k0);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, screenId, top[0], [k2, k1]);

        var before = await IntegrationSeed.ReadScreenAsync(factory, screenId);

        var renamed = await UpdateScreenAsync(client, screenId, "Ekran przemianowany", arranged.TreeId, Grain, k1, k0);

        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);

        var afterRename = await IntegrationSeed.ReadScreenAsync(factory, screenId);
        Assert.Equal("Ekran przemianowany", afterRename.Header!.Name);
        Assert.Equal(before.Defaults, afterRename.Defaults);
        Assert.Equal(before.Assignments, afterRename.Assignments);

        var regrained = await UpdateScreenAsync(client, screenId, "Ekran przemianowany", arranged.TreeId, 60, k1, k0);

        Assert.Equal(HttpStatusCode.OK, regrained.StatusCode);

        var afterGrain = await IntegrationSeed.ReadScreenAsync(factory, screenId);
        Assert.Equal(60, afterGrain.Header!.GrainMinutes);
        Assert.Equal(before.Defaults, afterGrain.Defaults);
        Assert.Equal(before.Assignments, afterGrain.Assignments);
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>
    /// Konto, obiekty i kategorie z własnym prefiksem kodu oraz puste drzewo
    /// tego konta.
    /// </summary>
    private async Task<ArrangedScreen> ArrangeAsync(int objectCount, int categoryCount)
    {
        var prefix = IntegrationSeed.NewPrefix();
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        var objects = await IntegrationSeed.SeedObjectsAsync(factory, prefix, objectCount);
        var categories = await IntegrationSeed.SeedCategoriesAsync(factory, prefix, categoryCount);
        var treeId = await IntegrationSeed.SeedTreeAsync(factory, account.Id, "Drzewo testowe");

        return new ArrangedScreen(account, treeId, objects, [.. categories.Order()]);
    }

    /// <summary>Węzły obiektów o podanych indeksach pod <paramref name="parentId"/> drzewa <paramref name="treeId"/>.</summary>
    private Task<IReadOnlyList<int>> SeedNodesAsync(
        ArrangedScreen arranged,
        int treeId,
        int? parentId,
        params int[] objectIndexes)
        => IntegrationSeed.SeedNodesAsync(
            factory,
            treeId,
            parentId,
            [.. objectIndexes.Select(index => arranged.Objects[index])]);

    private Task<int> SeedScreenAsync(ArrangedScreen arranged, int treeId, string name, params int[] defaults)
        => IntegrationSeed.SeedScreenAsync(factory, arranged.Account.Id, treeId, name, Grain, defaults);

    /// <summary>
    /// Wiersze przypisań wskazanych węzłów we <b>wszystkich</b> ekranach —
    /// odczyt wprost z tabeli, bez zawężenia do ekranu.
    /// </summary>
    private async Task<List<AssignmentRow>> ReadAssignmentsOfNodesAsync(params int[] nodeIds)
    {
        await using (factory.CreateDbScope(out var db))
        {
            return await db.ScreenNodeCategories
                .AsNoTracking()
                .Where(row => nodeIds.Contains(row.TreeNodeId))
                .Select(row => new AssignmentRow(row.ScreenId, row.TreeNodeId, row.CategoryId, row.Position))
                .ToListAsync();
        }
    }

    private async Task<bool> CategoryExistsAsync(int categoryId)
    {
        await using (factory.CreateDbScope(out var db))
        {
            return await db.Categories.AsNoTracking().AnyAsync(category => category.Id == categoryId);
        }
    }

    private static Task<HttpResponseMessage> UpdateScreenAsync(
        HttpClient client,
        int screenId,
        string name,
        int treeId,
        int grainMinutes,
        params int[] defaultCategoryIds)
        => client.PutAsJsonAsync($"/screens/{screenId}", new { name, treeId, grainMinutes, defaultCategoryIds });

    private static Task<HttpResponseMessage> SetNodeCategoriesAsync(
        HttpClient client,
        int screenId,
        int nodeId,
        params int[] categoryIds)
        => client.PutAsJsonAsync($"/screens/{screenId}/nodes/{nodeId}/categories", new { categoryIds });

    /// <summary>
    /// Kategorie węzła w ekranie w kolejności <c>Position</c> — migawka
    /// <see cref="IntegrationSeed.ReadAssignmentsAsync"/> jest już tak
    /// uporządkowana.
    /// </summary>
    private static int[] CategoriesOf(IEnumerable<AssignmentRow> rows, int screenId, int nodeId)
        => [.. rows.Where(row => row.ScreenId == screenId && row.TreeNodeId == nodeId).Select(row => row.CategoryId)];

    /// <summary>
    /// Przypisania jako kolejność (ekran, węzeł, kategoria), bez surowych
    /// wartości <c>Position</c> — porównujemy porządek, nie klucz porządku.
    /// </summary>
    private static List<(int ScreenId, int NodeId, int CategoryId)> AssignmentOrder(IEnumerable<AssignmentRow> rows)
        => [.. rows.Select(row => (row.ScreenId, row.TreeNodeId, row.CategoryId))];

    /// <summary>Lista domyślna jako kolejność (ekran, kategoria), bez wartości <c>Position</c>.</summary>
    private static List<(int ScreenId, int CategoryId)> DefaultOrder(IEnumerable<DefaultCategoryRow> rows)
        => [.. rows.Select(row => (row.ScreenId, row.CategoryId))];

    private static int[] Ints(JsonElement array)
        => [.. array.EnumerateArray().Select(item => item.GetInt32())];

    private static async Task<int> ReadIdAsync(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        return document.RootElement.GetProperty("id").GetInt32();
    }

    /// <summary>Status i <c>error.code</c> odmowy; zwraca kopertę do dalszych asercji.</summary>
    private static async Task<ErrorEnvelope> AssertRefusedAsync(
        HttpResponseMessage response,
        HttpStatusCode expectedStatus,
        string expectedCode)
    {
        Assert.Equal(expectedStatus, response.StatusCode);

        var error = await IntegrationSeed.ReadErrorAsync(response);
        Assert.Equal(expectedCode, error.Code);

        return error;
    }

    /// <summary>
    /// Konto z drzewem, obiektami i kategoriami jednego testu. Kategorie są
    /// posortowane rosnąco po identyfikatorze, więc lista „k1, k0" ma zawsze
    /// kolejność różną od kolejności identyfikatorów.
    /// </summary>
    private sealed record ArrangedScreen(
        TestAccount Account,
        int TreeId,
        IReadOnlyList<int> Objects,
        IReadOnlyList<int> Categories)
    {
        public int K(int index) => Categories[index];
    }
}
