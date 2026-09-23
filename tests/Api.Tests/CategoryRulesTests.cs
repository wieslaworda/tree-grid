using System.Text.Json;
using Api.Categories;
using Api.Data;
using Api.Errors;
using Api.Objects;

namespace Api.Tests;

/// <summary>
/// Regresja reguł słownika kategorii — odczytu i zapisu funkcji agregującej,
/// wspólnej normalizacji kodu — oraz kształtu ich błędów walidacji.
///
/// Wzorem <see cref="ObjectRulesTests"/> testy nie podnoszą hosta ani bazy:
/// reguły są czystymi funkcjami (<see cref="CategoryRules"/>,
/// <see cref="DictionaryCode"/>), a transakcja, unikalny indeks i pełna
/// ścieżka HTTP mają weryfikację ręczną.
/// </summary>
public class CategoryRulesTests
{
    /// <summary>
    /// Oczekiwany zapis kanoniczny każdej funkcji. Wpisany ręcznie, a nie
    /// wyliczony z kodu — inaczej test sprawdzałby kod nim samym.
    /// </summary>
    private static readonly Dictionary<AggregateFunction, string> CanonicalNames = new()
    {
        [AggregateFunction.Sum] = "SUM",
        [AggregateFunction.Min] = "MIN",
        [AggregateFunction.Max] = "MAX",
    };

    [Theory]
    [InlineData("SUM", AggregateFunction.Sum)]
    [InlineData("min", AggregateFunction.Min)]
    [InlineData(" Max ", AggregateFunction.Max)]
    public void Aggregate_function_parses_after_trimming_regardless_of_case(string value, AggregateFunction expected)
    {
        Assert.True(CategoryRules.TryParseAggregateFunction(value, out var function));
        Assert.Equal(expected, function);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("AVG")]
    // Liczba odpada, choć `Enum.TryParse` by ją przyjął — kontraktem jest
    // wyłącznie zapis kanoniczny.
    [InlineData("1")]
    public void Values_outside_the_list_do_not_parse(string? value)
    {
        Assert.False(CategoryRules.TryParseAggregateFunction(value, out _));
    }

    [Fact]
    public void Every_aggregate_function_has_a_canonical_name_that_parses_back()
    {
        // Pętla po wszystkich wartościach enuma: nowa funkcja bez zapisu
        // kanonicznego odezwie się tutaj, a nie wyjątkiem przy zapisie do bazy.
        foreach (var function in Enum.GetValues<AggregateFunction>())
        {
            Assert.True(
                CanonicalNames.TryGetValue(function, out var expected),
                $"Funkcja {function} nie ma oczekiwanego zapisu w teście.");

            var formatted = CategoryRules.FormatAggregateFunction(function);

            Assert.Equal(expected, formatted);
            Assert.True(CategoryRules.TryParseAggregateFunction(formatted, out var parsed));
            Assert.Equal(function, parsed);
        }
    }

    [Fact]
    public void Codes_differing_in_case_and_edge_spaces_normalize_to_the_same_form()
    {
        Assert.Equal(DictionaryCode.Normalize("BIL"), DictionaryCode.Normalize(" bil "));
    }

    [Fact]
    public void Code_normalization_folds_polish_letters()
    {
        Assert.Equal("ŁÓDŹ", DictionaryCode.Normalize("łódź"));
    }

    [Fact]
    public void Object_code_normalization_delegates_to_the_shared_rule()
    {
        // Oba słowniki mają porównywać kody tą samą regułą — rozjazd
        // oznaczałby, że unikalność kodu obiektu i kategorii znaczy co innego.
        string[] codes = [" bil ", "GPZ-01", "łódź-1", "\tTemp\n"];

        foreach (var code in codes)
        {
            Assert.Equal(DictionaryCode.Normalize(code), ObjectRules.NormalizeCode(code));
        }
    }

    [Fact]
    public void Field_names_match_the_react_router_form_field_names()
    {
        // Zgodność z atrybutami `name` formularza kategorii jest utrzymywana
        // ręcznie i nic jej nie sprawdza przy budowaniu. Ten test jest jedynym
        // miejscem, w którym jej złamanie w ogóle się odezwie.
        Assert.Equal("code", CategoryFormFields.Code);
        Assert.Equal("name", CategoryFormFields.Name);
        Assert.Equal("aggregateFunction", CategoryFormFields.AggregateFunction);
    }

    [Fact]
    public void Validation_error_for_aggregate_function_has_the_contract_shape()
    {
        var error = ApiError.Validation(
            "Przesłane dane są nieprawidłowe.",
            new Dictionary<string, string>
            {
                [CategoryFormFields.AggregateFunction] = "Wybierz funkcję agregującą.",
            });

        using var document = JsonDocument.Parse(JsonSerializer.Serialize(error));

        var root = document.RootElement;
        var detail = root.GetProperty("error");

        Assert.Equal(["error"], PropertyNames(root));
        Assert.Equal(["code", "message", "context"], PropertyNames(detail));
        Assert.Equal("validation_error", detail.GetProperty("code").GetString());

        var context = detail.GetProperty("context");

        Assert.Equal([ApiErrorContextKeys.Fields], PropertyNames(context));

        var fields = context.GetProperty(ApiErrorContextKeys.Fields);

        Assert.Equal(["aggregateFunction"], PropertyNames(fields));
        Assert.Equal("Wybierz funkcję agregującą.", fields.GetProperty("aggregateFunction").GetString());
    }

    private static string[] PropertyNames(JsonElement element)
        => [.. element.EnumerateObject().Select(property => property.Name)];
}
