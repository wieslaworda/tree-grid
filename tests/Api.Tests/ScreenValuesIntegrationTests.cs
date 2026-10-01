using System.Net;
using System.Text.Json;
using Api.Errors;
using Api.Screens;

namespace Api.Tests;

/// <summary>
/// <c>GET /screens/{id}/values?day=</c> (<c>S-05</c>) na prawdziwym SQLite:
/// własny ekran daje oś czasu ziarna ekranu i dokładnie jedną serię na parę
/// obiekt × kategoria z przypisań bieżących węzłów, także gdy ten sam obiekt
/// stoi w dwóch gałęziach; cudzy i nieistniejący ekran to 404 bez danych, zła
/// doba — 400 pod polem <see cref="ScreenRequestFields.Day"/>, brak
/// tożsamości — 401.
///
/// Wyrocznią jest plan <c>context/changes/prezentacja-ekranu/plan.md</c>
/// (Faza 1, „Endpoint wartości ekranu"; doba zwykła 2026-10-01 z ziarnem
/// 15 min to 96 punktów od <c>00:15</c> do <c>24:00</c>) oraz wymóg testu
/// izolacji kont dla nowego endpointu (<c>test-plan.md:43</c>). Oczekiwane
/// pary są wypisane w teście, a nie liczone z przypisań. Samą oś czasu wokół
/// zmian czasu przypina <see cref="ScreenValuesRulesTests"/>.
///
/// Testy w klasie dzielą jeden host i plik bazy (<see cref="TestApiFactory"/>),
/// więc każdy zakłada własne konto, obiekty i kategorie z unikalnym prefiksem.
/// </summary>
public class ScreenValuesIntegrationTests(TestApiFactory factory) : IClassFixture<TestApiFactory>
{
    private const string Day = "2026-10-01";

    private const int Grain = 15;

    // --- Własny ekran -------------------------------------------------------

    [Fact]
    public async Task Own_screen_gives_the_grain_points_and_one_series_per_object_and_category_pair()
    {
        // P(o0) → A(o1), Q(o2) → A(o1); A pod Q z kategoriami [k1, k2],
        // reszta z listą domyślną [k0, k1]. N(o3) dołożony po zapisie ekranu —
        // bez kategorii, więc bez serii.
        const int P = 0, A = 1, Q = 2, N = 3;
        var arranged = await ArrangeAsync(objectCount: 4, categoryCount: 3);
        using var client = arranged.Account.Client;
        var (o0, o1, o2) = (arranged.Objects[P], arranged.Objects[A], arranged.Objects[Q]);
        var (k0, k1, k2) = (arranged.K(0), arranged.K(1), arranged.K(2));

        var top = await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, P, Q);
        await SeedNodesAsync(arranged, arranged.TreeId, parentId: top[0], A);
        var aUnderQ = (await SeedNodesAsync(arranged, arranged.TreeId, parentId: top[1], A))[0];

        var screenId = await IntegrationSeed.SeedScreenAsync(
            factory, arranged.Account.Id, arranged.TreeId, "Ekran prezentacji", Grain, [k0, k1]);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, screenId, aUnderQ, [k1, k2]);
        await SeedNodesAsync(arranged, arranged.TreeId, parentId: top[0], N);

        var response = await client.GetAsync(ValuesUrl(screenId, Day));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;

        Assert.Equal(screenId, root.GetProperty("screenId").GetInt32());
        Assert.Equal(Day, root.GetProperty("day").GetString());
        Assert.Equal(Grain, root.GetProperty("grainMinutes").GetInt32());

        var points = root.GetProperty("points").EnumerateArray().ToList();
        Assert.Equal(96, points.Count);
        Assert.Equal("00:15", points[0].GetProperty("label").GetString());
        Assert.Equal("24:00", points[^1].GetProperty("label").GetString());
        Assert.All(points, point => Assert.False(point.GetProperty("repeated").GetBoolean()));
        Assert.All(points, point => Assert.Equal(120, point.GetProperty("utcOffsetMinutes").GetInt32()));

        var series = root.GetProperty("series").EnumerateArray().ToList();

        // A w dwóch gałęziach daje jedną serię na kategorię: k1 z obu wystąpień
        // tylko raz. Po obiekcie, potem po kategorii.
        Assert.Equal(
            [(o0, k0), (o0, k1), (o1, k0), (o1, k1), (o1, k2), (o2, k0), (o2, k1)],
            series.Select(entry => (
                entry.GetProperty("objectId").GetInt32(),
                entry.GetProperty("categoryId").GetInt32())));
        Assert.All(series, entry => Assert.Equal(96, entry.GetProperty("values").GetArrayLength()));
    }

    [Fact]
    public async Task Repeated_request_for_the_same_screen_and_day_gives_identical_values()
    {
        var arranged = await ArrangeAsync(objectCount: 2, categoryCount: 2);
        using var client = arranged.Account.Client;

        await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, 0, 1);
        var screenId = await SeedScreenAsync(arranged);

        var first = await client.GetStringAsync(ValuesUrl(screenId, Day));
        var second = await client.GetStringAsync(ValuesUrl(screenId, Day));

        Assert.Equal(first, second);
    }

    // --- Izolacja kont i brak ekranu ----------------------------------------

    [Theory]
    [InlineData("2026-10-01")]
    [InlineData("2026-02-30")]
    public async Task Another_account_screen_is_not_found_and_reveals_nothing_even_with_a_bad_day(string day)
    {
        // Ekran wygrywa z dobą: odmowa doby dla cudzego ekranu zdradzałaby,
        // że pod tym identyfikatorem coś jest.
        var owner = await ArrangeAsync(objectCount: 1, categoryCount: 1);
        owner.Account.Client.Dispose();
        await SeedNodesAsync(owner, owner.TreeId, parentId: null, 0);
        var foreignScreen = await SeedScreenAsync(owner);

        var stranger = await IntegrationSeed.CreateAccountAsync(factory);
        using var client = stranger.Client;

        var response = await client.GetAsync(ValuesUrl(foreignScreen, day));

        var error = await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.NotFound, ApiErrorCodes.NotFound);
        Assert.Empty(error.Context.EnumerateObject());
    }

    [Fact]
    public async Task Missing_screen_is_not_found()
    {
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        using var client = account.Client;

        var response = await client.GetAsync(ValuesUrl(int.MaxValue, Day));

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.NotFound, ApiErrorCodes.NotFound);
    }

    // --- Doba ---------------------------------------------------------------

    [Theory]
    [InlineData("2026-02-30")]
    [InlineData("2026-1-5")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Bad_or_missing_day_is_a_validation_error_under_the_day_field(string? day)
    {
        var arranged = await ArrangeAsync(objectCount: 1, categoryCount: 1);
        using var client = arranged.Account.Client;

        await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, 0);
        var screenId = await SeedScreenAsync(arranged);

        var response = await client.GetAsync(ValuesUrl(screenId, day));

        var error = await IntegrationSeed.AssertRefusedAsync(
            response,
            HttpStatusCode.BadRequest,
            ApiErrorCodes.ValidationError);
        Assert.True(
            error.Context.GetProperty(ApiErrorContextKeys.Fields).TryGetProperty(ScreenRequestFields.Day, out _),
            $"Odmowa bez błędu pola '{ScreenRequestFields.Day}': {error.Context}");
    }

    // --- Tożsamość ----------------------------------------------------------

    [Fact]
    public async Task Request_without_the_identity_header_is_unauthorized()
    {
        var arranged = await ArrangeAsync(objectCount: 1, categoryCount: 1);
        arranged.Account.Client.Dispose();

        await SeedNodesAsync(arranged, arranged.TreeId, parentId: null, 0);
        var screenId = await SeedScreenAsync(arranged);

        using var anonymous = factory.CreateClient();

        var response = await anonymous.GetAsync(ValuesUrl(screenId, Day));

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.Unauthorized, ApiErrorCodes.Unauthorized);
    }

    // --- Pomocnicze ---------------------------------------------------------

    /// <summary>
    /// Konto, obiekty i kategorie z własnym prefiksem kodu oraz puste drzewo
    /// tego konta. Obiekty i kategorie mają identyfikatory rosnące w kolejności
    /// indeksów — porządek serii w asercjach na tym stoi.
    /// </summary>
    private async Task<ArrangedValues> ArrangeAsync(int objectCount, int categoryCount)
    {
        var prefix = IntegrationSeed.NewPrefix();
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        var objects = await IntegrationSeed.SeedObjectsAsync(factory, prefix, objectCount);
        var categories = await IntegrationSeed.SeedCategoriesAsync(factory, prefix, categoryCount);
        var treeId = await IntegrationSeed.SeedTreeAsync(factory, account.Id, "Drzewo testowe");

        return new ArrangedValues(account, treeId, [.. objects.Order()], [.. categories.Order()]);
    }

    /// <summary>Węzły obiektów o podanych indeksach pod <paramref name="parentId"/> drzewa <paramref name="treeId"/>.</summary>
    private Task<IReadOnlyList<int>> SeedNodesAsync(
        ArrangedValues arranged,
        int treeId,
        int? parentId,
        params int[] objectIndexes)
        => IntegrationSeed.SeedNodesAsync(
            factory,
            treeId,
            parentId,
            [.. objectIndexes.Select(index => arranged.Objects[index])]);

    /// <summary>Ekran na drzewie konta z ziarnem <see cref="Grain"/> i wszystkimi kategoriami testu jako listą domyślną.</summary>
    private Task<int> SeedScreenAsync(ArrangedValues arranged)
        => IntegrationSeed.SeedScreenAsync(
            factory,
            arranged.Account.Id,
            arranged.TreeId,
            "Ekran prezentacji",
            Grain,
            arranged.Categories);

    /// <summary>Adres wartości ekranu; <c>null</c> — bez parametru <c>day</c>.</summary>
    private static string ValuesUrl(int screenId, string? day)
        => day is null
            ? $"/screens/{screenId}/values"
            : $"/screens/{screenId}/values?{ScreenRequestFields.Day}={Uri.EscapeDataString(day)}";

    private sealed record ArrangedValues(
        TestAccount Account,
        int TreeId,
        IReadOnlyList<int> Objects,
        IReadOnlyList<int> Categories)
    {
        public int K(int index) => Categories[index];
    }
}
