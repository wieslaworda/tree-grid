using System.Net;
using System.Net.Http.Json;
using Api.Errors;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Api.Tests;

/// <summary>
/// Ryzyko #2 test-planu w części „błąd API": nieudany zapis ekranu niczego
/// nie zostawia w połowie. Dotyczy zapisów, w których stare przypisania
/// znikają przez <c>ExecuteDelete</c> <b>przed</b> <c>SaveChanges</c> —
/// <c>PUT /screens/{id}</c> ze zmianą listy domyślnej albo drzewa
/// i <c>PUT /screens/{id}/nodes/{nodeId}/categories</c>. Tam jedyną ochroną
/// atomowości jest transakcja: bez niej awaria <c>SaveChanges</c> zostawiłaby
/// ekran ze skasowanymi przypisaniami i bez nowych.
///
/// Awarię wstrzykuje <see cref="FailingSaveChangesApiFactory"/>: interceptor
/// rzuca przy najbliższym <c>SaveChanges</c> po uzbrojeniu. <c>ExecuteDelete</c>
/// go nie wyzwala (to nie <c>SaveChanges</c>), więc kasowanie wykonuje się
/// naprawdę, a dopiero zapis nowych wierszy pada — dokładnie ten przypadek.
/// Każdy test: migawka ekranu (nagłówek, lista domyślna, przypisania) przed →
/// uzbrojenie → żądanie → 500 <c>internal_error</c> w kopercie →
/// migawka po identyczna. Kontrola sensu: ten sam zapis bez uzbrojenia
/// przechodzi i zmienia stan — dowód, że interceptor nie psuje ścieżki
/// szczęśliwej, a żądanie naprawdę zmieniłoby dane.
/// </summary>
public class ScreenWriteFailureIntegrationTests(ScreenWriteFailureIntegrationTests.FailingSaveChangesApiFactory factory)
    : IClassFixture<ScreenWriteFailureIntegrationTests.FailingSaveChangesApiFactory>
{
    private const string ScreenName = "Ekran testowy";

    private const int Grain = 15;

    /// <summary>Zapis ekranu, w którym <c>ExecuteDelete</c> działa przed <c>SaveChanges</c>.</summary>
    public enum ScreenWrite
    {
        /// <summary><c>PUT /screens/{id}</c> ze zmienioną listą domyślną.</summary>
        DefaultListChange,

        /// <summary><c>PUT /screens/{id}</c> ze zmienionym drzewem.</summary>
        TreeChange,

        /// <summary><c>PUT /screens/{id}/nodes/{nodeId}/categories</c>.</summary>
        NodeCategories,
    }

    [Theory]
    [InlineData(ScreenWrite.DefaultListChange)]
    [InlineData(ScreenWrite.TreeChange)]
    [InlineData(ScreenWrite.NodeCategories)]
    public async Task Failed_save_after_the_delete_answers_500_and_leaves_the_screen_unchanged(ScreenWrite write)
    {
        var arranged = await ArrangeAsync();
        using var client = arranged.Account.Client;

        var before = await IntegrationSeed.ReadScreenAsync(factory, arranged.ScreenId);

        HttpResponseMessage response;
        factory.Failure.Arm();

        try
        {
            response = await SendAsync(client, arranged, write);
        }
        finally
        {
            factory.Failure.Disarm();
        }

        // Interceptor zadziałał dokładnie raz — inaczej 500 pochodziłoby
        // z czegoś innego, a migawka niczego by nie dowodziła.
        Assert.Equal(1, factory.Failure.FiredCount);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(FailingSaveChangesInterceptor.Marker, body);

        var error = await IntegrationSeed.ReadErrorAsync(response);
        Assert.Equal(ApiErrorCodes.InternalError, error.Code);
        Assert.True(
            error.Context.TryGetProperty("requestId", out var requestId)
                && !string.IsNullOrEmpty(requestId.GetString()),
            $"Koperta 500 bez 'context.requestId': {body}");

        Assert.Equal(before, await IntegrationSeed.ReadScreenAsync(factory, arranged.ScreenId));
    }

    [Theory]
    [InlineData(ScreenWrite.DefaultListChange, HttpStatusCode.OK)]
    [InlineData(ScreenWrite.TreeChange, HttpStatusCode.OK)]
    [InlineData(ScreenWrite.NodeCategories, HttpStatusCode.NoContent)]
    public async Task Same_write_without_injected_failure_succeeds_and_changes_the_screen(
        ScreenWrite write,
        HttpStatusCode expectedStatus)
    {
        var arranged = await ArrangeAsync();
        using var client = arranged.Account.Client;

        var before = await IntegrationSeed.ReadScreenAsync(factory, arranged.ScreenId);
        var firedBefore = factory.Failure.FiredCount;

        var response = await SendAsync(client, arranged, write);

        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Equal(firedBefore, factory.Failure.FiredCount);
        Assert.NotEqual(before, await IntegrationSeed.ReadScreenAsync(factory, arranged.ScreenId));
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>
    /// Konto, drzewo T1 (o0 → [o2], o1) z ekranem o liście domyślnej
    /// [k0, k1] i węzłem o1 dopasowanym do [k2, k0], oraz własne drzewo T2 (o3)
    /// — cel zmiany drzewa. Seed idzie przed uzbrojeniem, bo interceptor
    /// obejmuje każdy kontekst hosta, także ten z seedu.
    /// </summary>
    private async Task<ArrangedWrite> ArrangeAsync()
    {
        var prefix = IntegrationSeed.NewPrefix();
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        var objects = await IntegrationSeed.SeedObjectsAsync(factory, prefix, 4);
        IReadOnlyList<int> categories = [.. (await IntegrationSeed.SeedCategoriesAsync(factory, prefix, 3)).Order()];

        var t1 = await IntegrationSeed.SeedTreeAsync(factory, account.Id, "Drzewo pierwsze");
        var t1Top = await IntegrationSeed.SeedNodesAsync(factory, t1, null, [objects[0], objects[1]]);
        await IntegrationSeed.SeedNodesAsync(factory, t1, t1Top[0], [objects[2]]);

        var t2 = await IntegrationSeed.SeedTreeAsync(factory, account.Id, "Drzewo drugie");
        await IntegrationSeed.SeedNodesAsync(factory, t2, null, [objects[3]]);

        var screenId = await IntegrationSeed.SeedScreenAsync(
            factory, account.Id, t1, ScreenName, Grain, [categories[0], categories[1]]);
        await IntegrationSeed.SetNodeCategoriesAsync(factory, screenId, t1Top[1], [categories[2], categories[0]]);

        return new ArrangedWrite(account, screenId, t1, t2, t1Top[0], categories);
    }

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, ArrangedWrite arranged, ScreenWrite write)
    {
        var (k0, k1, k2) = (arranged.Categories[0], arranged.Categories[1], arranged.Categories[2]);

        return write switch
        {
            ScreenWrite.DefaultListChange => client.PutAsJsonAsync(
                $"/screens/{arranged.ScreenId}",
                new { name = ScreenName, treeId = arranged.TreeId, grainMinutes = Grain, defaultCategoryIds = new[] { k1, k2 } }),
            ScreenWrite.TreeChange => client.PutAsJsonAsync(
                $"/screens/{arranged.ScreenId}",
                new { name = ScreenName, treeId = arranged.OtherTreeId, grainMinutes = Grain, defaultCategoryIds = new[] { k0, k1 } }),
            ScreenWrite.NodeCategories => client.PutAsJsonAsync(
                $"/screens/{arranged.ScreenId}/nodes/{arranged.NodeId}/categories",
                new { categoryIds = new[] { k2 } }),
            _ => throw new ArgumentOutOfRangeException(nameof(write), write, null),
        };
    }

    /// <summary>Ekran jednego testu i cele zapisów.</summary>
    private sealed record ArrangedWrite(
        TestAccount Account,
        int ScreenId,
        int TreeId,
        int OtherTreeId,
        int NodeId,
        IReadOnlyList<int> Categories);

    /// <summary>
    /// <see cref="TestApiFactory"/> z interceptorem awarii dołożonym do opcji
    /// <c>AppDbContext</c> hosta przez punkt rozszerzenia fabryki — opcje
    /// z <c>Program.cs</c> (plik, <c>SqliteBusyTimeoutInterceptor</c>) zostają.
    /// </summary>
    public sealed class FailingSaveChangesApiFactory : TestApiFactory
    {
        /// <summary>Interceptor wspólny dla wszystkich kontekstów tego hosta.</summary>
        public FailingSaveChangesInterceptor Failure { get; } = new();

        protected override void ConfigureAppDbContext(DbContextOptionsBuilder options)
            => options.AddInterceptors(Failure);
    }

    /// <summary>
    /// Jednorazowo uzbrajana awaria <c>SaveChanges</c>: po <see cref="Arm"/>
    /// najbliższe <c>SavingChanges</c>/<c>SavingChangesAsync</c> rzuca wyjątek
    /// i rozbraja interceptor. Nieuzbrojony nic nie robi.
    /// </summary>
    public sealed class FailingSaveChangesInterceptor : SaveChangesInterceptor
    {
        /// <summary>
        /// Treść wstrzykniętego wyjątku — wyłącznie ASCII, żeby kodowanie JSON
        /// nie ukryło jej przed asercją „brak komunikatu wyjątku w odpowiedzi".
        /// </summary>
        public const string Marker = "injected-savechanges-failure";

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
            FailIfArmed();

            return base.SavingChanges(eventData, result);
        }

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            FailIfArmed();

            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }

        private void FailIfArmed()
        {
            if (Interlocked.Exchange(ref _armed, 0) == 1)
            {
                Interlocked.Increment(ref _firedCount);

                throw new InvalidOperationException(Marker);
            }
        }
    }
}
