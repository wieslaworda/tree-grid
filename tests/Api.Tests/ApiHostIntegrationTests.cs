using System.Net;
using System.Text.Json;
using Api.Errors;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Api.Tests;

/// <summary>
/// Szpica hosta testowego: dowód, zanim powstanie jakikolwiek test domenowy,
/// że <see cref="TestApiFactory"/> podnosi API na własnym pliku tymczasowym,
/// z włączonymi kluczami obcymi, i że nagłówek tożsamości działa w potoku HTTP.
///
/// Każda z tych własności psuje się po cichu. Host na bazie deweloperskiej
/// przechodziłby testy, niszcząc dane dewelopera; host bez kluczy obcych
/// przechodziłby testy kaskad ekranu, bo osierocone wiersze ukrywa odczyt
/// przez <c>GET</c>. Dlatego to są osobne testy, a nie założenie.
/// </summary>
public class ApiHostIntegrationTests(TestApiFactory factory) : IClassFixture<TestApiFactory>
{
    [Fact]
    public async Task Health_endpoint_answers_ok()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ok", document.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Host_database_is_the_factory_temporary_file()
    {
        await using (factory.CreateDbScope(out var db))
        {
            var dataSource = new SqliteConnectionStringBuilder(db.Database.GetConnectionString()).DataSource;

            Assert.Equal(factory.DatabasePath, Path.GetFullPath(dataSource), ignoreCase: true);
            Assert.StartsWith(Path.GetFullPath(Path.GetTempPath()), dataSource, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(
                Path.Combine("src", "Api", "db"),
                Path.GetFullPath(dataSource),
                StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Foreign_keys_are_enforced_on_the_host_connection()
    {
        await using (factory.CreateDbScope(out var db))
        {
            await db.Database.OpenConnectionAsync();

            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "PRAGMA foreign_keys;";

            Assert.Equal(1L, await command.ExecuteScalarAsync());
        }
    }

    [Fact]
    public async Task Trees_request_without_identity_header_is_refused_in_the_error_contract()
    {
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/trees");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var error = await IntegrationSeed.ReadErrorAsync(response);
        Assert.Equal(ApiErrorCodes.Unauthorized, error.Code);
    }

    [Fact]
    public async Task Trees_request_with_a_seeded_account_header_is_answered()
    {
        var account = await IntegrationSeed.CreateAccountAsync(factory);
        using var client = account.Client;

        var response = await client.GetAsync("/trees");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
