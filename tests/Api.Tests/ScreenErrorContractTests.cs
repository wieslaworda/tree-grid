using System.Text.Json;
using Api.Categories;
using Api.Errors;
using Api.Tree;

namespace Api.Tests;

/// <summary>
/// Kształt odmów, które ekran (S-06) wprowadza do istniejących obszarów:
/// usunięcia drzewa wskazywanego przez ekran i usunięcia kategorii, która jest
/// jedyną domyślną jakiegoś ekranu.
///
/// Wzorem kopert w <see cref="TreeRulesTests"/> testy nie podnoszą hosta ani
/// bazy: odmowy powstają w <see cref="TreeResponses"/>
/// i <see cref="CategoryResponses"/>, a sama kontrola w transakcji, kaskady
/// i pełna ścieżka HTTP mają weryfikację ręczną.
/// </summary>
public class ScreenErrorContractTests
{
    /// <summary>
    /// Pola <c>ProblemDetails</c> (RFC 9457) — domyślny kształt błędu w ASP.NET
    /// Core i dokładnie ten dryf, przed którym broni zapis w CLAUDE.md.
    /// </summary>
    private static readonly string[] ProblemDetailsFields = ["type", "title", "status", "detail"];

    [Fact]
    public void Tree_in_screen_refusal_names_the_tree_and_its_screens_alphabetically()
    {
        // Nazwy podane nie po kolei — sortuje odmowa, nie wywołujący. „Łódź"
        // po normalizacji ma „Ł" (U+0141), więc stoi za „Zachód" porządkiem
        // porządkowym, tak jak w `GET /screens`.
        using var document = Serialize(
            TreeResponses.InScreen("Sieć północ", ["Zachód", "łódź", "doba", "Awaria"]));

        var error = AssertEnvelope(document, "tree_in_screen", ApiErrorCodes.TreeInScreen);

        Assert.Equal(
            "Drzewo „Sieć północ” jest wskazywane przez ekrany: Awaria, doba, Zachód, łódź. "
                + "Usuń najpierw te ekrany.",
            error.GetProperty("message").GetString());
        Assert.Empty(PropertyNames(error.GetProperty("context")));
    }

    [Fact]
    public void Tree_in_screen_refusal_ignores_case_when_ordering_screen_names()
    {
        using var document = Serialize(TreeResponses.InScreen("T", ["beta", "Alfa"]));

        Assert.Equal(
            "Drzewo „T” jest wskazywane przez ekrany: Alfa, beta. Usuń najpierw te ekrany.",
            document.RootElement.GetProperty("error").GetProperty("message").GetString());
    }

    [Fact]
    public void Category_sole_screen_default_refusal_has_an_empty_context_without_owner_information()
    {
        using var document = Serialize(CategoryResponses.SoleScreenDefault("Q"));

        var error = AssertEnvelope(
            document,
            "category_sole_screen_default",
            ApiErrorCodes.CategorySoleScreenDefault);

        Assert.Equal(
            "Kategoria „Q” jest jedyną kategorią domyślną co najmniej jednego ekranu i nie można jej usunąć.",
            error.GetProperty("message").GetString());

        // Słownik jest wspólny, ekrany prywatne — odmowa nie niesie niczego
        // o cudzym ekranie.
        Assert.Empty(PropertyNames(error.GetProperty("context")));
    }

    // --- Pomocnicze ---------------------------------------------------------

    private static JsonElement AssertEnvelope(JsonDocument document, string expectedCode, string constant)
    {
        var root = document.RootElement;
        var error = root.GetProperty("error");

        Assert.Equal(["error"], PropertyNames(root));
        Assert.Equal(["code", "message", "context"], PropertyNames(error));
        Assert.Equal(expectedCode, constant);
        Assert.Equal(expectedCode, error.GetProperty("code").GetString());

        foreach (var field in ProblemDetailsFields)
        {
            Assert.False(root.TryGetProperty(field, out _), $"Korzeń odpowiedzi zawiera pole '{field}'.");
            Assert.False(error.TryGetProperty(field, out _), $"Obiekt błędu zawiera pole '{field}'.");
        }

        return error;
    }

    private static JsonDocument Serialize(ApiError error)
        => JsonDocument.Parse(JsonSerializer.Serialize(error));

    private static string[] PropertyNames(JsonElement element)
        => [.. element.EnumerateObject().Select(property => property.Name)];
}
