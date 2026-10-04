using System.Net;
using System.Text;
using Api.Errors;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Api.Tests;

/// <summary>
/// Wymaganie logowania błędów API do pliku (PRD, NFR; plaster S-11) na
/// prawdziwym potoku HTTP: nieobsłużony wyjątek żądania ląduje w pliku
/// <c>api-*.log</c> razem z <c>requestId</c>, który klient dostał w kopercie 500,
/// a odmowy 4xx i wpisy informacyjne do pliku nie trafiają.
///
/// Plik leży w katalogu tymczasowym fabryki (<see cref="TestApiFactory.LogDirectory"/>),
/// nie w <c>src/Api/Log/</c>. Testy „czego w pliku nie ma" po swoim żądaniu
/// wywołują jeszcze 500 i sprawdzają, że ten wpis już jest — zapis jest
/// synchroniczny i po kolei, więc brak wcześniejszego wpisu znaczy, że go nie
/// było, a nie że plik jeszcze nie powstał.
/// </summary>
public class FileLoggingIntegrationTests(TestApiFactory factory) : IClassFixture<TestApiFactory>
{
    /// <summary>Fragment komunikatu wyjątku z <c>GET /health?fail=true</c>.</summary>
    private const string ForcedFailureMessage = "Wymuszona ścieżka błędna endpointu /health";

    [Fact]
    public async Task Unhandled_exception_is_written_to_the_log_file_with_the_request_id()
    {
        using var client = factory.CreateClient();

        var requestId = await TriggerUnhandledExceptionAsync(client);

        var log = ReadLog();
        Assert.Contains(requestId, log);
        Assert.Contains(ForcedFailureMessage, log);
        Assert.Contains("[ERR]", log);
    }

    [Fact]
    public async Task Not_found_response_is_not_written_to_the_log_file()
    {
        using var client = factory.CreateClient();
        var path = $"/nie-ma-takiej-trasy-{Guid.NewGuid():N}";

        var response = await client.GetAsync(path);

        await IntegrationSeed.AssertRefusedAsync(response, HttpStatusCode.NotFound, ApiErrorCodes.NotFound);

        var requestId = await TriggerUnhandledExceptionAsync(client);

        var log = ReadLog();
        Assert.Contains(requestId, log);
        Assert.DoesNotContain(path, log);
    }

    [Fact]
    public async Task Information_and_warning_entries_are_not_written_to_the_log_file()
    {
        // Ruch, który na pewno produkuje wpisy informacyjne: seed konta przez
        // kontekst hosta i odczyt drzew — oba wykonują zapytania SQL logowane
        // na poziomie Information.
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        using var client = account.Client;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/trees")).StatusCode);

        // Wpisy, które filtr kategorii hosta przepuszcza do wszystkich dostawców —
        // zatrzymać może je wyłącznie minimalny poziom loggera plikowego.
        var marker = Guid.NewGuid().ToString("N");
        var logger = factory.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Api.Tests.FileLogging");
        logger.LogInformation("Wpis informacyjny {Marker}", marker);
        logger.LogWarning("Ostrzeżenie {Marker}", marker);

        var requestId = await TriggerUnhandledExceptionAsync(client);

        var log = ReadLog();
        Assert.Contains(requestId, log);
        Assert.DoesNotContain(marker, log);
        Assert.DoesNotContain("[INF]", log);
        Assert.DoesNotContain("[WRN]", log);
    }

    // --- Pomocnicze ----------------------------------------------------------

    /// <summary>
    /// <c>GET /health?fail=true</c>: sprawdza odpowiedź 500 <c>internal_error</c>
    /// i zwraca <c>context.requestId</c> z koperty.
    /// </summary>
    private static async Task<string> TriggerUnhandledExceptionAsync(HttpClient client)
    {
        var response = await client.GetAsync("/health?fail=true");

        var error = await IntegrationSeed.AssertRefusedAsync(
            response, HttpStatusCode.InternalServerError, ApiErrorCodes.InternalError);

        Assert.True(
            error.Context.TryGetProperty("requestId", out var requestId)
                && !string.IsNullOrEmpty(requestId.GetString()),
            "Koperta 500 bez 'context.requestId'.");

        return requestId.GetString()!;
    }

    /// <summary>
    /// Treść wszystkich plików <c>api-*.log</c> katalogu fabryki (przejście
    /// przez północ daje drugi plik). Odczyt z <see cref="FileShare.ReadWrite"/>,
    /// bo logger trzyma plik otwarty do zwolnienia hosta.
    /// </summary>
    private string ReadLog()
    {
        Assert.True(
            Directory.Exists(factory.LogDirectory),
            $"Katalog logu '{factory.LogDirectory}' nie powstał.");

        var files = Directory.GetFiles(factory.LogDirectory, "api-*.log").Order().ToList();
        Assert.NotEmpty(files);

        var content = new StringBuilder();

        foreach (var file in files)
        {
            using var stream = new FileStream(
                file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(stream, Encoding.UTF8);

            content.Append(reader.ReadToEnd());
        }

        return content.ToString();
    }
}
