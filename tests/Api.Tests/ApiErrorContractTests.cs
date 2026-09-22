using System.Text.Json;
using Api.Errors;

namespace Api.Tests;

/// <summary>
/// Regresja kontraktu odpowiedzi błędnej z CLAUDE.md:
/// <c>{ "error": { "code", "message", "context" } }</c>.
///
/// Sprawdzany jest kształt po serializacji, a nie właściwości typu w C# —
/// kontraktem jest JSON, który widzi klient, a nie nazwy pól w kodzie. Test
/// celowo nie podnosi hosta (`WebApplicationFactory`): pilnuje kształtu, a nie
/// potoku HTTP, a ten drugi weryfikowany jest ręcznie w ramach fazy.
/// </summary>
public class ApiErrorContractTests
{
    /// <summary>
    /// Pola <c>ProblemDetails</c> (RFC 9457) — domyślny kształt błędu w ASP.NET
    /// Core i dokładnie ten dryf, przed którym broni zapis w CLAUDE.md.
    /// </summary>
    private static readonly string[] ProblemDetailsFields = ["type", "title", "status", "detail"];

    [Fact]
    public void Serialized_error_has_exactly_the_contract_shape()
    {
        using var document = Serialize(ApiError.Create("not_found", "Nie znaleziono zasobu."));

        var root = document.RootElement;

        Assert.Equal(JsonValueKind.Object, root.ValueKind);
        Assert.Equal(["error"], PropertyNames(root));

        var error = root.GetProperty("error");

        Assert.Equal(JsonValueKind.Object, error.ValueKind);
        Assert.Equal(["code", "message", "context"], PropertyNames(error));
        Assert.Equal("not_found", error.GetProperty("code").GetString());
        Assert.Equal("Nie znaleziono zasobu.", error.GetProperty("message").GetString());
    }

    [Fact]
    public void Serialized_error_carries_no_problem_details_fields()
    {
        using var document = Serialize(ApiError.Create("internal_error", "Błąd serwera."));

        var root = document.RootElement;
        var error = root.GetProperty("error");

        foreach (var field in ProblemDetailsFields)
        {
            Assert.False(root.TryGetProperty(field, out _), $"Korzeń odpowiedzi zawiera pole '{field}'.");
            Assert.False(error.TryGetProperty(field, out _), $"Obiekt błędu zawiera pole '{field}'.");
        }
    }

    [Fact]
    public void Context_is_an_empty_object_when_no_data_is_supplied()
    {
        using var document = Serialize(ApiError.Create("internal_error", "Błąd serwera."));

        var context = document.RootElement.GetProperty("error").GetProperty("context");

        // Pusty obiekt, nigdy pominięte pole ani null — klient czytający
        // `error.context` nie musi wtedy rozróżniać trzech przypadków.
        Assert.Equal(JsonValueKind.Object, context.ValueKind);
        Assert.Empty(context.EnumerateObject());
    }

    [Fact]
    public void Context_keeps_supplied_data_untouched()
    {
        var error = ApiError.Create(
            "not_found",
            "Nie znaleziono zasobu.",
            new Dictionary<string, object?>
            {
                ["status"] = 404,
                ["path"] = "/nie-ma",
            });

        using var document = Serialize(error);

        var context = document.RootElement.GetProperty("error").GetProperty("context");

        Assert.Equal(404, context.GetProperty("status").GetInt32());
        Assert.Equal("/nie-ma", context.GetProperty("path").GetString());
    }

    [Fact]
    public void Contract_names_do_not_depend_on_the_serializer_naming_policy()
    {
        var error = ApiError.Create("internal_error", "Błąd serwera.");

        // Polityka nazewnictwa jest ustawieniem hosta i da się ją zmienić spoza
        // typu. Gdyby kształt od niej zależał, kontrakt zmieniałby się po cichu
        // razem z konfiguracją — nazwy pól są więc przypięte atrybutami.
        var snakeUpper = JsonSerializer.Serialize(
            error,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseUpper });

        Assert.Equal(JsonSerializer.Serialize(error), snakeUpper);
    }

    private static JsonDocument Serialize(ApiError error)
        => JsonDocument.Parse(JsonSerializer.Serialize(error));

    private static string[] PropertyNames(JsonElement element)
        => [.. element.EnumerateObject().Select(property => property.Name)];
}
