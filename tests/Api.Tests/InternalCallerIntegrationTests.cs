using System.Net;
using System.Net.Http.Json;
using Api.Auth;
using Api.Errors;
using Api.Tree;
using Microsoft.Extensions.Configuration;

namespace Api.Tests;

/// <summary>
/// Bramka wspólnego sekretu Node→API (<see cref="InternalCaller"/>, plan
/// <c>context/changes/hosting-monsterasp/plan.md</c>, Faza 2) na prawdziwym
/// potoku HTTP: żądanie bez nagłówka <c>X-TreeGrid-Internal</c> albo ze złym
/// sekretem dostaje 401 <c>caller_unauthenticated</c>, zanim wykona się
/// endpoint — także <c>/internal/session-signing-key</c> — a jedynym wyjątkiem
/// jest <c>GET /health</c> bez parametru <c>fail</c>.
///
/// Klient z <see cref="TestApiFactory"/> niesie poprawny sekret domyślnie, więc
/// testy zdejmują albo podmieniają nagłówek na własnym kliencie. Dwa testy
/// mają własne hosty, bo sprawdzają stan całego hosta: pusty plik logu
/// (<see cref="FreshLogApiFactory"/>) i okno limitu rejestracji
/// (<see cref="RateLimitedApiFactory"/>).
///
/// Wyrocznią jest plan, nie kod pod testem: nazwa nagłówka, kod błędu i próg
/// 32 znaków są wpisane w testach literałami.
/// </summary>
public class InternalCallerIntegrationTests(
    TestApiFactory factory,
    InternalCallerIntegrationTests.FreshLogApiFactory freshLogFactory,
    InternalCallerIntegrationTests.RateLimitedApiFactory rateLimitedFactory)
    : IClassFixture<TestApiFactory>,
        IClassFixture<InternalCallerIntegrationTests.FreshLogApiFactory>,
        IClassFixture<InternalCallerIntegrationTests.RateLimitedApiFactory>
{
    private const string CallerUnauthenticated = "caller_unauthenticated";

    /// <summary>Hasło spełniające reguły złożoności Identity z <c>Program.cs</c>.</summary>
    private const string Password = "Haslo-Testowe-1";

    /// <summary>Fragment komunikatu wyjątku z <c>GET /health?fail=true</c>.</summary>
    private const string ForcedFailureMessage = "Wymuszona ścieżka błędna endpointu /health";

    // --- Odmowa bez sekretu -------------------------------------------------

    [Theory]
    [InlineData("/trees")]
    [InlineData("/objects")]
    [InlineData("/categories")]
    [InlineData("/internal/session-signing-key")]
    public async Task Request_without_the_secret_header_is_refused_with_caller_unauthenticated(string path)
    {
        using var client = ClientWithoutSecret(factory);

        var response = await client.GetAsync(path);

        await AssertCallerRefusedAsync(response);
    }

    [Theory]
    [InlineData("/trees")]
    [InlineData("/objects")]
    [InlineData("/categories")]
    [InlineData("/internal/session-signing-key")]
    public async Task Request_with_a_wrong_secret_is_refused_with_caller_unauthenticated(string path)
    {
        using var client = ClientWithoutSecret(factory);
        client.DefaultRequestHeaders.Add("X-TreeGrid-Internal", $"zly-sekret-{Guid.NewGuid():N}{Guid.NewGuid():N}");

        var response = await client.GetAsync(path);

        await AssertCallerRefusedAsync(response);
    }

    [Fact]
    public async Task Signing_key_response_without_the_secret_does_not_carry_the_key()
    {
        using var client = ClientWithoutSecret(factory);

        var response = await client.GetAsync("/internal/session-signing-key");

        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.DoesNotContain("\"key\"", body);
    }

    [Fact]
    public async Task Identity_header_of_an_existing_account_without_the_secret_is_refused()
    {
        // Atak z publicznego hostname'u: identyfikator cudzego konta podany
        // wprost, bez przechodzenia przez sesję serwera React Routera.
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        account.Client.Dispose();

        using var client = ClientWithoutSecret(factory);
        client.DefaultRequestHeaders.Add(TreeIdentity.UserHeader, account.Id);

        var response = await client.GetAsync("/trees");

        await AssertCallerRefusedAsync(response);
    }

    [Fact]
    public async Task Request_with_the_secret_header_repeated_is_refused()
    {
        using var client = factory.CreateClient();

        // Drugi wpis obok poprawnego z fabryki: serwer React Routera wysyła
        // dokładnie jeden, więc dwa oznaczają żądanie z innego źródła.
        client.DefaultRequestHeaders.Add("X-TreeGrid-Internal", "druga-wartosc");

        var response = await client.GetAsync("/objects");

        await AssertCallerRefusedAsync(response);
    }

    [Fact]
    public async Task Unknown_path_without_the_secret_is_refused_rather_than_not_found()
    {
        using var client = ClientWithoutSecret(factory);

        var response = await client.GetAsync($"/nie-ma-takiej-trasy-{Guid.NewGuid():N}");

        await AssertCallerRefusedAsync(response);
    }

    // --- Wyjątek /health ----------------------------------------------------

    [Fact]
    public async Task Health_without_the_secret_answers_ok()
    {
        using var client = ClientWithoutSecret(factory);

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Forced_health_failure_without_the_secret_is_refused_and_leaves_no_log_entry()
    {
        using (var client = ClientWithoutSecret(freshLogFactory))
        {
            // Każdy zapis parametru — wiązanie `bool? fail` nie rozróżnia
            // wielkości liter, a pusta wartość to nadal ścieżka z parametrem.
            foreach (var query in new[] { "?fail=true", "?FAIL=true", "?fail=", "?fail=false" })
            {
                await AssertCallerRefusedAsync(await client.GetAsync("/health" + query));
            }
        }

        Assert.Equal(string.Empty, ReadLogOrEmpty(freshLogFactory));

        // Wpis z poprawnym sekretem jest — dopiero wtedy brak wcześniejszego
        // cokolwiek znaczy: zapis jest synchroniczny, więc pusty plik przed
        // tym żądaniem znaczy, że odmowy nic nie zapisały.
        using var authorized = freshLogFactory.CreateClient();
        var response = await authorized.GetAsync("/health?fail=true");
        await IntegrationSeed.AssertRefusedAsync(
            response, HttpStatusCode.InternalServerError, ApiErrorCodes.InternalError);

        Assert.Contains(ForcedFailureMessage, ReadLogOrEmpty(freshLogFactory));
    }

    // --- Kolejność względem limitera ----------------------------------------

    [Fact]
    public async Task Registration_without_the_secret_does_not_use_up_the_rate_limit_window()
    {
        using (var client = ClientWithoutSecret(rateLimitedFactory))
        {
            // Więcej odmów niż okno — gdyby bramka stała za limiterem, ostatnia
            // z nich byłaby już 429, a kolejne poprawne żądania nie przeszłyby.
            for (var request = 0; request <= RateLimitedApiFactory.PermitLimit; request++)
            {
                await AssertCallerRefusedAsync(await RegisterAsync(client, NewLogin()));
            }
        }

        using var authorized = rateLimitedFactory.CreateClient();

        for (var request = 1; request <= RateLimitedApiFactory.PermitLimit; request++)
        {
            Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(authorized, NewLogin())).StatusCode);
        }

        // Limiter w tym hoście naprawdę działa — bez tego test niczego by nie dowodził.
        await IntegrationSeed.AssertRefusedAsync(
            await RegisterAsync(authorized, NewLogin()),
            HttpStatusCode.TooManyRequests,
            ApiErrorCodes.RateLimited);
    }

    // --- Nazwy i konfiguracja -----------------------------------------------

    [Fact]
    public void Secret_header_matches_the_react_router_client()
    {
        // Literał musi być identyczny z `INTERNAL_HEADER` w `app/lib/api.server.ts`;
        // rozjazd daje 401 na każdym wywołaniu API, bez żadnego błędu budowania.
        Assert.Equal("X-TreeGrid-Internal", InternalCaller.Header);
        Assert.Equal(CallerUnauthenticated, ApiErrorCodes.CallerUnauthenticated);
    }

    [Fact]
    public void Missing_internal_secret_is_a_start_problem_named_by_key()
    {
        var secrets = Secrets(internalApiSecret: null);

        Assert.Contains("Brak wartości konfiguracji 'Auth:InternalApiSecret'.", secrets.FindProblems());
        Assert.Null(secrets.FindInternalApiSecret());
    }

    [Fact]
    public void Blank_internal_secret_is_a_start_problem()
    {
        var secrets = Secrets(internalApiSecret: "   ");

        Assert.Contains("Brak wartości konfiguracji 'Auth:InternalApiSecret'.", secrets.FindProblems());
        Assert.Null(secrets.FindInternalApiSecret());
    }

    [Fact]
    public void Too_short_internal_secret_is_a_start_problem_without_its_value()
    {
        var value = new string('s', 31);
        var secrets = Secrets(internalApiSecret: value);

        var problems = secrets.FindProblems();

        Assert.Contains("Wartość konfiguracji 'Auth:InternalApiSecret' jest krótsza niż 32 znaków.", problems);
        Assert.All(problems, problem => Assert.DoesNotContain(value, problem));
        Assert.Null(secrets.FindInternalApiSecret());
    }

    [Theory]
    [InlineData(" ssssssssssssssssssssssssssssssss")]
    [InlineData("ssssssssssssssss\nssssssssssssssss")]
    [InlineData("ssssssssssssssssąssssssssssssssss")]
    public void Internal_secret_with_characters_outside_visible_ascii_is_a_start_problem_without_its_value(string value)
    {
        var secrets = Secrets(internalApiSecret: value);

        var problems = secrets.FindProblems();

        Assert.Contains(problems, problem => problem.Contains("zawiera znaki spoza widocznego ASCII"));
        Assert.All(problems, problem => Assert.DoesNotContain(value, problem));
        Assert.Null(secrets.FindInternalApiSecret());
    }

    [Fact]
    public void Internal_secret_of_32_characters_is_not_a_problem()
    {
        var value = new string('s', 32);
        var secrets = Secrets(internalApiSecret: value);

        Assert.Empty(secrets.FindProblems());
        Assert.Equal(value, secrets.FindInternalApiSecret());
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>Klient fabryki ze zdjętym nagłówkiem sekretu.</summary>
    private static HttpClient ClientWithoutSecret(TestApiFactory host)
    {
        var client = host.CreateClient();
        client.DefaultRequestHeaders.Remove("X-TreeGrid-Internal");

        return client;
    }

    /// <summary>401, kod <c>caller_unauthenticated</c> i pusty <c>context</c>.</summary>
    private static async Task AssertCallerRefusedAsync(HttpResponseMessage response)
    {
        var error = await IntegrationSeed.AssertRefusedAsync(
            response, HttpStatusCode.Unauthorized, CallerUnauthenticated);

        Assert.Empty(error.Context.EnumerateObject());
    }

    /// <summary>
    /// Sekrety z konfiguracji w pamięci: poprawny klucz podpisu i wskazany
    /// wspólny sekret, żeby problemy dotyczyły wyłącznie tego drugiego.
    /// </summary>
    private static AuthSecrets Secrets(string? internalApiSecret)
        => AuthSecrets.FromConfiguration(new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:SessionSigningKey"] = new string('k', 64),
                ["Auth:InternalApiSecret"] = internalApiSecret,
            })
            .Build());

    /// <summary>Losowy login w dozwolonym zestawie znaków, 13 znaków.</summary>
    private static string NewLogin() => $"t{Guid.NewGuid():N}"[..13];

    private static Task<HttpResponseMessage> RegisterAsync(HttpClient client, string login)
        => client.PostAsJsonAsync("/auth/register", new { login, email = $"{login}@test.local", password = Password });

    /// <summary>
    /// Treść plików logu hosta albo pusty napis, gdy logger jeszcze niczego nie
    /// zapisał (katalog powstaje dopiero przy pierwszym wpisie).
    /// </summary>
    private static string ReadLogOrEmpty(TestApiFactory host)
        => Directory.Exists(host.LogDirectory) ? IntegrationSeed.ReadLog(host) : string.Empty;

    /// <summary>Host z własnym, pustym na starcie katalogiem logu.</summary>
    public sealed class FreshLogApiFactory : TestApiFactory;

    /// <summary>Host z limitem tempa kroku 1 obniżonym do <see cref="PermitLimit"/>.</summary>
    public sealed class RateLimitedApiFactory : TestApiFactory
    {
        public const int PermitLimit = 2;

        protected override int RegistrationPermitLimit => PermitLimit;
    }
}
