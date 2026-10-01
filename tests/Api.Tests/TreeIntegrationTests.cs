using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Api.Errors;
using Api.Tree;

namespace Api.Tests;

/// <summary>
/// Ryzyko #1 test-planu: odrzucona operacja na drzewie nie zmienia zapisanej
/// struktury, a przyjęta zapisuje się w całości. Klasa przypina to na
/// endpointach węzłów — dodaniu, przeniesieniu i usunięciu — przez pełny
/// potok HTTP na prawdziwym SQLite.
///
/// Wyrocznią są PRD i plan, nie kod pod testem: Guardrail (<c>prd.md:37</c>)
/// i FR-004 (<c>prd.md:76</c>) — obiekt nie może stanąć na własnej ścieżce
/// przodków; Business Logic (<c>prd.md:108-116</c>) — zmiana struktury jest
/// oceniana przed przyjęciem, a usunięty węzeł znika z całym poddrzewem;
/// limit 2000 węzłów i przenumerowanie rodzeństwa z
/// <c>context/changes/budowa-drzewa/plan.md</c>. Oczekiwane wartości są
/// wpisane w testach, a nie liczone regułami z <c>TreeRules</c>.
///
/// Asercją jest stan bazy, nie status odpowiedzi. Każda odmowa porównuje
/// migawkę drzewa odczytaną wprost z tabeli przed żądaniem i po nim — sam 409
/// nie dowodzi niczego, bo endpoint mógłby zapisać część zmiany i dopiero
/// potem odmówić. Każde przyjęcie porównuje bazę z ręcznie wypisanym stanem
/// oczekiwanym, nie z odpowiedzią <c>GET</c>.
///
/// Testy w klasie dzielą jeden host i plik bazy (<see cref="TestApiFactory"/>),
/// więc każdy zakłada własne konto, obiekty z unikalnym prefiksem i drzewo.
/// </summary>
public class TreeIntegrationTests(TestApiFactory factory) : IClassFixture<TestApiFactory>
{
    /// <summary>
    /// Limit węzłów jednego drzewa — wartość z planu
    /// <c>context/changes/budowa-drzewa/plan.md:388-389</c>, celowo nie
    /// <c>TreeNode.MaxNodesPerTree</c>: test ma złapać zmianę progu w kodzie,
    /// a nie podążać za nią.
    /// </summary>
    private const int NodeLimit = 2000;

    // --- Zapętlenie (FR-004) -------------------------------------------------

    [Fact]
    public async Task Adding_an_object_under_its_own_deeper_occurrence_is_refused_as_a_cycle_and_leaves_the_tree_unchanged()
    {
        // X → A → B, a obok drugie, poprawne wystąpienie A na najwyższym
        // poziomie. Dodanie A pod B stawia A na jego własnej ścieżce przez
        // wystąpienie dwa poziomy wyżej, nie przez bezpośredniego rodzica.
        const int X = 0, A = 1, B = 2;
        var arranged = await ArrangeAsync(objectCount: 3);
        using var client = arranged.Account.Client;

        var top = await SeedAsync(arranged, parentId: null, X, A);
        var underX = await SeedAsync(arranged, parentId: top[0], A);
        var underA = await SeedAsync(arranged, parentId: underX[0], B);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);

        var response = await AddAsync(client, arranged.TreeId, arranged.Objects[A], parentId: underA[0]);

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeCycle);
        Assert.Contains(arranged.Code(A), PathCodes(error));
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
    }

    [Fact]
    public async Task Moving_a_subtree_whose_descendant_repeats_a_target_ancestor_is_refused_and_leaves_the_tree_unchanged()
    {
        // Gałąź 1: A → B → [E]. Gałąź 2: C → A. Przeniesienie C pod B dałoby
        // A → B → C → A — pętla przez poddrzewo, nie przez przenoszony węzeł
        // (budowa-drzewa/plan.md:330-334). D trzyma rodzeństwo źródła
        // niepustym, E — rodzeństwo celu.
        const int A = 0, B = 1, C = 2, D = 3, E = 4;
        var arranged = await ArrangeAsync(objectCount: 5);
        using var client = arranged.Account.Client;

        var top = await SeedAsync(arranged, parentId: null, A, C, D);
        var underA = await SeedAsync(arranged, parentId: top[0], B);
        await SeedAsync(arranged, parentId: underA[0], E);
        await SeedAsync(arranged, parentId: top[1], A);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);

        var response = await MoveAsync(client, arranged.TreeId, top[1], parentId: underA[0], position: 0);

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeCycle);
        Assert.Contains(arranged.Code(A), PathCodes(error));
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
    }

    [Fact]
    public async Task Moving_a_node_under_its_own_child_is_refused_as_a_cycle_and_leaves_the_tree_unchanged()
    {
        // A → B → C oraz D obok. Najkrótsza pętla przez potomka: A pod B.
        const int A = 0, B = 1, C = 2, D = 3;
        var arranged = await ArrangeAsync(objectCount: 4);
        using var client = arranged.Account.Client;

        var top = await SeedAsync(arranged, parentId: null, A, D);
        var underA = await SeedAsync(arranged, parentId: top[0], B);
        await SeedAsync(arranged, parentId: underA[0], C);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);

        var response = await MoveAsync(client, arranged.TreeId, top[0], parentId: underA[0], position: 0);

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeCycle);
        Assert.Contains(arranged.Code(A), PathCodes(error));
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
    }

    // --- Duplikat rodzeństwa (Business Logic) --------------------------------

    [Fact]
    public async Task Adding_an_object_that_is_already_a_child_of_the_parent_is_refused_and_leaves_the_tree_unchanged()
    {
        const int P = 0, A = 1, B = 2;
        var arranged = await ArrangeAsync(objectCount: 3);
        using var client = arranged.Account.Client;

        var top = await SeedAsync(arranged, parentId: null, P);
        await SeedAsync(arranged, parentId: top[0], A, B);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);

        var response = await AddAsync(client, arranged.TreeId, arranged.Objects[A], parentId: top[0]);

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeDuplicateSibling);
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
    }

    [Fact]
    public async Task Adding_an_object_that_is_already_at_the_top_level_is_refused_and_leaves_the_tree_unchanged()
    {
        const int A = 0, B = 1;
        var arranged = await ArrangeAsync(objectCount: 2);
        using var client = arranged.Account.Client;

        await SeedAsync(arranged, parentId: null, A, B);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);

        var response = await AddAsync(client, arranged.TreeId, arranged.Objects[A], parentId: null);

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeDuplicateSibling);
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
    }

    [Fact]
    public async Task Moving_a_node_to_the_top_level_next_to_the_same_object_is_refused_and_leaves_the_tree_unchanged()
    {
        // Najwyższy poziom: A, P; pod P drugie wystąpienie A (i B obok).
        const int A = 0, P = 1, B = 2;
        var arranged = await ArrangeAsync(objectCount: 3);
        using var client = arranged.Account.Client;

        var top = await SeedAsync(arranged, parentId: null, A, P);
        var underP = await SeedAsync(arranged, parentId: top[1], A, B);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);

        var response = await MoveAsync(client, arranged.TreeId, underP[0], parentId: null, position: 0);

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeDuplicateSibling);
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
    }

    // --- Limit rozmiaru (budowa-drzewa/plan.md:388-389) ----------------------

    [Fact]
    public async Task Tree_one_node_below_the_limit_accepts_the_node_that_reaches_it()
    {
        var arranged = await ArrangeAsync(objectCount: NodeLimit);
        using var client = arranged.Account.Client;

        await SeedAsync(arranged, parentId: null, [.. Enumerable.Range(0, NodeLimit - 1)]);

        var response = await AddAsync(client, arranged.TreeId, arranged.Objects[NodeLimit - 1], parentId: null);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var after = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);
        Assert.Equal(NodeLimit, after.Nodes.Count);
        Assert.Single(after.Nodes, node => node.ObjectId == arranged.Objects[NodeLimit - 1]);
    }

    [Fact]
    public async Task Tree_at_the_limit_refuses_another_node_and_stays_unchanged()
    {
        var arranged = await ArrangeAsync(objectCount: NodeLimit + 1);
        using var client = arranged.Account.Client;

        await SeedAsync(arranged, parentId: null, [.. Enumerable.Range(0, NodeLimit)]);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);
        Assert.Equal(NodeLimit, before.Nodes.Count);

        var response = await AddAsync(client, arranged.TreeId, arranged.Objects[NodeLimit], parentId: null);

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Conflict, ApiErrorCodes.TreeTooLarge);

        var after = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);
        Assert.Equal(NodeLimit, after.Nodes.Count);
        Assert.Equal(before, after);
    }

    [Fact]
    public async Task Parallel_adds_to_a_tree_one_below_the_limit_admit_exactly_one_node()
    {
        // Hipoteza z komentarza `TreeEndpoints.cs:33-36`: transakcja startuje
        // jako zapisowa, więc równoległe dodania ustawiają się w kolejce zamiast
        // przejść kontrolę limitu na tym samym stanie. Bez ponowień: 500
        // (`SQLITE_BUSY`) albo więcej niż limit węzłów to znalezisko o kodzie
        // produkcyjnym, nie niestabilność testu.
        const int parallelAdds = 4;
        var arranged = await ArrangeAsync(objectCount: NodeLimit - 1 + parallelAdds);
        using var client = arranged.Account.Client;

        await SeedAsync(arranged, parentId: null, [.. Enumerable.Range(0, NodeLimit - 1)]);

        var candidates = Enumerable.Range(NodeLimit - 1, parallelAdds)
            .Select(index => arranged.Objects[index])
            .ToList();

        var responses = await Task.WhenAll(candidates.Select(objectId =>
            Task.Run(() => AddAsync(client, arranged.TreeId, objectId, parentId: null))));

        var outcomes = new List<string>();

        foreach (var response in responses)
        {
            outcomes.Add($"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        }

        var summary = string.Join(Environment.NewLine, outcomes);

        Assert.True(
            responses.All(response => response.StatusCode is HttpStatusCode.Created or HttpStatusCode.Conflict),
            $"Równoległe dodania dały status spoza 201/409:{Environment.NewLine}{summary}");
        Assert.True(
            responses.Count(response => response.StatusCode == HttpStatusCode.Created) == 1,
            $"Oczekiwano dokładnie jednego 201:{Environment.NewLine}{summary}");

        foreach (var refused in responses.Where(response => response.StatusCode == HttpStatusCode.Conflict))
        {
            Assert.Equal(ApiErrorCodes.TreeTooLarge, (await IntegrationSeed.ReadErrorAsync(refused)).Code);
        }

        var after = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);
        Assert.Equal(NodeLimit, after.Nodes.Count);
        Assert.Single(after.Nodes, node => candidates.Contains(node.ObjectId));
    }

    // --- Granica drzewa (research §A) ----------------------------------------

    [Fact]
    public async Task Moving_a_node_under_a_parent_from_another_own_tree_is_refused_and_leaves_both_trees_unchanged()
    {
        // Węzeł drzewa 1 pod węzeł drzewa 2 tego samego konta, adresem drzewa 1:
        // rodzica nie ma w drzewie z adresu — błąd pola `parentId` (research §A,
        // „walidacja pól"). Przenoszenia między drzewami nie ma
        // (budowa-drzewa/plan.md, „What We're NOT Doing").
        const int A = 0, B = 1, C = 2;
        var arranged = await ArrangeAsync(objectCount: 3);
        using var client = arranged.Account.Client;
        var otherTreeId = await IntegrationSeed.SeedTreeAsync(factory, arranged.Account.Id, "Drzewo drugie");

        var top = await SeedAsync(arranged, parentId: null, A, B);
        var otherTop = await IntegrationSeed.SeedNodesAsync(factory, otherTreeId, null, [arranged.Objects[C]]);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);
        var otherBefore = await IntegrationSeed.ReadTreeAsync(factory, otherTreeId);

        var response = await MoveAsync(client, arranged.TreeId, top[1], parentId: otherTop[0], position: 0);

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.BadRequest, ApiErrorCodes.ValidationError);
        Assert.True(
            error.Context.GetProperty(ApiErrorContextKeys.Fields).TryGetProperty(TreeRequestFields.ParentId, out _),
            $"Odmowa bez błędu pola '{TreeRequestFields.ParentId}': {error.Context}");
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
        Assert.Equal(otherBefore, await IntegrationSeed.ReadTreeAsync(factory, otherTreeId));
    }

    [Fact]
    public async Task Moving_a_node_of_another_own_tree_through_this_tree_address_is_not_found_and_leaves_both_trees_unchanged()
    {
        // Węzeł drzewa 1 przenoszony adresem drzewa 2 pod węzeł drzewa 2:
        // węzeł innego drzewa jest w adresie nieistniejący — 404 (research §A).
        const int A = 0, B = 1, C = 2;
        var arranged = await ArrangeAsync(objectCount: 3);
        using var client = arranged.Account.Client;
        var otherTreeId = await IntegrationSeed.SeedTreeAsync(factory, arranged.Account.Id, "Drzewo drugie");

        var top = await SeedAsync(arranged, parentId: null, A, B);
        var otherTop = await IntegrationSeed.SeedNodesAsync(factory, otherTreeId, null, [arranged.Objects[C]]);

        var before = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);
        var otherBefore = await IntegrationSeed.ReadTreeAsync(factory, otherTreeId);

        var response = await MoveAsync(client, otherTreeId, top[1], parentId: otherTop[0], position: 0);

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.NotFound, ApiErrorCodes.NotFound);
        Assert.Equal(before, await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
        Assert.Equal(otherBefore, await IntegrationSeed.ReadTreeAsync(factory, otherTreeId));
    }

    // --- Operacje przyjęte ---------------------------------------------------

    [Theory]
    [InlineData(0, new[] { "S", "X", "Y" })]
    [InlineData(2, new[] { "X", "Y", "S" })]
    public async Task Accepted_subtree_move_lands_whole_under_the_new_parent_with_contiguous_sibling_positions(
        int position,
        string[] expectedTargetOrder)
    {
        // P → [A, S, B], S → [S1, S2], S1 → [S3]; Q → [X, Y]. S z całym
        // poddrzewem idzie pod Q na początek albo na koniec.
        string[] names = ["P", "Q", "A", "S", "B", "S1", "S2", "S3", "X", "Y"];
        var arranged = await ArrangeAsync(objectCount: names.Length);
        using var client = arranged.Account.Client;
        var ids = new Dictionary<string, int>();

        await SeedNamedAsync(arranged, ids, names, parent: null, "P", "Q");
        await SeedNamedAsync(arranged, ids, names, parent: "P", "A", "S", "B");
        await SeedNamedAsync(arranged, ids, names, parent: "S", "S1", "S2");
        await SeedNamedAsync(arranged, ids, names, parent: "S1", "S3");
        await SeedNamedAsync(arranged, ids, names, parent: "Q", "X", "Y");

        var response = await MoveAsync(client, arranged.TreeId, ids["S"], parentId: ids["Q"], position);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Oczekiwany stan wypisany ręcznie: źródło P przenumerowane bez luki,
        // cel Q w żądanej kolejności, poddrzewo S nietknięte pod S.
        var expected = new List<(string Name, string? Parent, int Position)>
        {
            ("P", null, 0),
            ("Q", null, 1),
            ("A", "P", 0),
            ("B", "P", 1),
            ("S1", "S", 0),
            ("S2", "S", 1),
            ("S3", "S1", 0),
        };
        expected.AddRange(expectedTargetOrder.Select((name, index) => (name, (string?)"Q", index)));

        Assert.Equal(
            ExpectedState(arranged, ids, names, expected),
            await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId));
    }

    [Fact]
    public async Task Accepted_delete_of_a_middle_sibling_removes_its_whole_subtree_and_renumbers_the_siblings()
    {
        // P → [A, M, B], M → [M1, M2], M1 → [M3]; Z obok P.
        string[] names = ["P", "Z", "A", "M", "B", "M1", "M2", "M3"];
        var arranged = await ArrangeAsync(objectCount: names.Length);
        using var client = arranged.Account.Client;
        var ids = new Dictionary<string, int>();

        await SeedNamedAsync(arranged, ids, names, parent: null, "P", "Z");
        await SeedNamedAsync(arranged, ids, names, parent: "P", "A", "M", "B");
        await SeedNamedAsync(arranged, ids, names, parent: "M", "M1", "M2");
        await SeedNamedAsync(arranged, ids, names, parent: "M1", "M3");

        var response = await client.DeleteAsync($"/trees/{arranged.TreeId}/nodes/{ids["M"]}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var after = await IntegrationSeed.ReadTreeAsync(factory, arranged.TreeId);

        foreach (var removed in new[] { "M", "M1", "M2", "M3" })
        {
            Assert.DoesNotContain(after.Nodes, node => node.Id == ids[removed]);
        }

        Assert.Equal(
            ExpectedState(arranged, ids, names,
            [
                ("P", null, 0),
                ("Z", null, 1),
                ("A", "P", 0),
                ("B", "P", 1),
            ]),
            after);
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>
    /// Konto, <paramref name="objectCount"/> obiektów z własnym prefiksem kodu
    /// i puste drzewo tego konta.
    /// </summary>
    private async Task<ArrangedTree> ArrangeAsync(int objectCount)
    {
        var prefix = IntegrationSeed.NewPrefix();
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        var objects = await IntegrationSeed.SeedObjectsAsync(factory, prefix, objectCount);
        var treeId = await IntegrationSeed.SeedTreeAsync(factory, account.Id, "Drzewo testowe");

        return new ArrangedTree(account, treeId, prefix, objects);
    }

    /// <summary>Węzły obiektów o podanych indeksach pod <paramref name="parentId"/>.</summary>
    private Task<IReadOnlyList<int>> SeedAsync(ArrangedTree arranged, int? parentId, params int[] objectIndexes)
        => IntegrationSeed.SeedNodesAsync(
            factory,
            arranged.TreeId,
            parentId,
            [.. objectIndexes.Select(index => arranged.Objects[index])]);

    /// <summary>
    /// Węzły nazwane: obiekt węzła to obiekt o indeksie nazwy w
    /// <paramref name="names"/>, a identyfikator trafia do <paramref name="ids"/>.
    /// </summary>
    private async Task SeedNamedAsync(
        ArrangedTree arranged,
        Dictionary<string, int> ids,
        string[] names,
        string? parent,
        params string[] children)
    {
        var created = await SeedAsync(
            arranged,
            parent is null ? null : ids[parent],
            [.. children.Select(child => Array.IndexOf(names, child))]);

        foreach (var (child, id) in children.Zip(created))
        {
            ids[child] = id;
        }
    }

    /// <summary>
    /// Migawka oczekiwana z ręcznie wypisanych trójek (węzeł, rodzic, pozycja),
    /// w porządku migawki z bazy — po identyfikatorze.
    /// </summary>
    private static TreeStateSnapshot ExpectedState(
        ArrangedTree arranged,
        Dictionary<string, int> ids,
        string[] names,
        IEnumerable<(string Name, string? Parent, int Position)> rows)
        => new(
            "Drzewo testowe",
            [
                .. rows
                    .Select(row => new NodeRow(
                        ids[row.Name],
                        row.Parent is null ? null : ids[row.Parent],
                        arranged.Objects[Array.IndexOf(names, row.Name)],
                        row.Position))
                    .OrderBy(row => row.Id),
            ]);

    private static Task<HttpResponseMessage> AddAsync(HttpClient client, int treeId, int objectId, int? parentId)
        => client.PostAsJsonAsync($"/trees/{treeId}/nodes", new { objectId, parentId });

    private static Task<HttpResponseMessage> MoveAsync(
        HttpClient client,
        int treeId,
        int nodeId,
        int? parentId,
        int position)
        => client.PutAsJsonAsync($"/trees/{treeId}/nodes/{nodeId}", new { parentId, position });

    /// <summary>
    /// Kody z <c>context.path</c> odmowy zapętlenia. Test sprawdza wyłącznie,
    /// że ścieżka zawiera kod zapętlonego obiektu — kolejność i postać zapisu
    /// ścieżki są szczegółem implementacji, nie wymaganiem.
    /// </summary>
    private static string[] PathCodes(ErrorEnvelope error)
        => [.. error.Context
            .GetProperty(TreeResponses.PathContextKey)
            .EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString()!)];

    /// <summary>Konto z drzewem i obiektami jednego testu.</summary>
    private sealed record ArrangedTree(TestAccount Account, int TreeId, string Prefix, IReadOnlyList<int> Objects)
    {
        /// <summary>Kod obiektu o indeksie <paramref name="index"/> — zapis z <see cref="IntegrationSeed.SeedObjectsAsync"/>.</summary>
        public string Code(int index) => $"{Prefix}-{index}";
    }
}
