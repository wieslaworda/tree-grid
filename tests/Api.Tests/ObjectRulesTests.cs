using System.Text.Json;
using Api.Errors;
using Api.Objects;

namespace Api.Tests;

/// <summary>
/// Regresja reguł słownika obiektów — normalizacji kodu, wykrywania cyklu
/// i warunku usunięcia — oraz kształtu odmowy usunięcia.
///
/// Wzorem <see cref="AuthErrorContractTests"/> testy nie podnoszą hosta ani
/// bazy. Reguły są w kodzie czystymi funkcjami (<see cref="ObjectRules"/>)
/// właśnie po to, żeby dało się je sprawdzić na danych w pamięci; transakcja,
/// klucze obce i pełna ścieżka HTTP mają weryfikację ręczną.
/// </summary>
public class ObjectRulesTests
{
    /// <summary>
    /// Pola <c>ProblemDetails</c> (RFC 9457) — domyślny kształt błędu w ASP.NET
    /// Core i dokładnie ten dryf, przed którym broni zapis w CLAUDE.md.
    /// </summary>
    private static readonly string[] ProblemDetailsFields = ["type", "title", "status", "detail"];

    // Identyfikatory nazwane tak, jak w opisach przypadków (A→B→C→A).
    private const int A = 1, B = 2, C = 3, D = 4;

    private static readonly IReadOnlyDictionary<int, IReadOnlyCollection<int>> EmptyGraph =
        new Dictionary<int, IReadOnlyCollection<int>>();

    [Fact]
    public void Codes_differing_in_case_and_edge_spaces_normalize_to_the_same_form()
    {
        Assert.Equal(ObjectRules.NormalizeCode("GPZ-01"), ObjectRules.NormalizeCode(" gpz-01 "));
    }

    [Fact]
    public void Code_normalization_folds_polish_letters()
    {
        // Kolacja `NOCASE` w SQLite zostawiłaby „ł" i „Ł" jako różne znaki —
        // ten przypadek jest dowodem, że normalizacja od niej nie zależy.
        Assert.Equal("ŁÓDŹ-1", ObjectRules.NormalizeCode("łódź-1"));
    }

    [Fact]
    public void Empty_graph_has_no_cycle()
    {
        Assert.Null(ObjectRules.FindCycle(A, [], EmptyGraph));
        Assert.Null(ObjectRules.FindCycle(A, [B], EmptyGraph));
    }

    [Fact]
    public void Flat_graph_has_no_cycle()
    {
        // D jest rodzicem B i C, a A dostaje te same B i C — żadna ścieżka nie
        // wraca do A.
        var graph = new Dictionary<int, IReadOnlyCollection<int>> { [D] = [B, C] };

        Assert.Null(ObjectRules.FindCycle(A, [B, C], graph));
    }

    [Fact]
    public void Object_as_its_own_child_is_a_cycle_of_length_one()
    {
        var cycle = ObjectRules.FindCycle(A, [A], EmptyGraph);

        Assert.NotNull(cycle);
        Assert.Equal([A, A], cycle);
    }

    [Fact]
    public void Direct_cycle_between_two_objects_is_found()
    {
        // B już ma podobiekt A; nadanie A podobiektu B zamyka A↔B.
        var graph = new Dictionary<int, IReadOnlyCollection<int>> { [B] = [A] };

        var cycle = ObjectRules.FindCycle(A, [B], graph);

        Assert.NotNull(cycle);
        Assert.Equal([A, B, A], cycle);
    }

    [Fact]
    public void Indirect_cycle_is_reported_as_a_path_in_order()
    {
        var graph = new Dictionary<int, IReadOnlyCollection<int>> { [B] = [C], [C] = [A] };

        var cycle = ObjectRules.FindCycle(A, [B], graph);

        // Kolejność jest częścią wyniku: z niej powstaje komunikat
        // „A → B → C → A" pod polem podobiektów.
        Assert.NotNull(cycle);
        Assert.Equal([A, B, C, A], cycle);
    }

    [Fact]
    public void Diamond_is_not_a_cycle()
    {
        // A→B, A→C, B→D, C→D: do D prowadzą dwie ścieżki, ale żadna nie wraca.
        var graph = new Dictionary<int, IReadOnlyCollection<int>> { [B] = [D], [C] = [D] };

        Assert.Null(ObjectRules.FindCycle(A, [B, C], graph));
    }

    [Fact]
    public void Replacing_children_removes_a_cycle_that_existed_only_in_the_old_set()
    {
        // Graf niesie stary zestaw dzieci A (B), który razem z B→A byłby
        // cyklem. Nowy zestaw (C) go zastępuje — wpis A w grafie nie może
        // wziąć udziału w przejściu.
        var graph = new Dictionary<int, IReadOnlyCollection<int>> { [A] = [B], [B] = [A] };

        Assert.Null(ObjectRules.FindCycle(A, [C], graph));
    }

    [Fact]
    public void Object_without_relations_can_be_deleted()
    {
        Assert.True(ObjectRules.CanDelete(parentCount: 0, childCount: 0));
        Assert.Null(ObjectResponses.DescribeDeletionRefusal("L1", [], []));
    }

    [Fact]
    public void Object_with_only_a_parent_cannot_be_deleted()
    {
        Assert.False(ObjectRules.CanDelete(parentCount: 1, childCount: 0));
        Assert.NotNull(ObjectResponses.DescribeDeletionRefusal("L1", ["GPZ-01"], []));
    }

    [Fact]
    public void Object_with_only_a_child_cannot_be_deleted()
    {
        Assert.False(ObjectRules.CanDelete(parentCount: 0, childCount: 1));
        Assert.NotNull(ObjectResponses.DescribeDeletionRefusal("GPZ-01", [], ["L1"]));
    }

    [Fact]
    public void Deletion_refusal_has_the_contract_shape_with_parents_and_children()
    {
        var refusal = ObjectResponses.DescribeDeletionRefusal("L1", ["GPZ-01"], ["L2", "L3"]);

        Assert.NotNull(refusal);

        using var document = Serialize(refusal);

        var root = document.RootElement;
        var error = root.GetProperty("error");

        Assert.Equal(["error"], PropertyNames(root));
        Assert.Equal(["code", "message", "context"], PropertyNames(error));
        Assert.Equal(ApiErrorCodes.ObjectHasRelations, error.GetProperty("code").GetString());
        Assert.Equal("object_has_relations", error.GetProperty("code").GetString());

        // Komunikat nazywa powiązane obiekty — użytkownik musi wiedzieć, które
        // relacje zdjąć, zanim spróbuje ponownie.
        var message = error.GetProperty("message").GetString();

        Assert.Contains("GPZ-01", message);
        Assert.Contains("L2", message);
        Assert.Contains("L3", message);

        var context = error.GetProperty("context");

        Assert.Equal(["parents", "children"], PropertyNames(context));
        Assert.Equal(["GPZ-01"], StringValues(context.GetProperty(ObjectResponses.ParentsContextKey)));
        Assert.Equal(["L2", "L3"], StringValues(context.GetProperty(ObjectResponses.ChildrenContextKey)));
    }

    [Fact]
    public void Deletion_refusal_keeps_both_context_keys_when_one_side_is_empty()
    {
        var refusal = ObjectResponses.DescribeDeletionRefusal("L1", ["GPZ-01"], []);

        Assert.NotNull(refusal);

        using var document = Serialize(refusal);

        var context = document.RootElement.GetProperty("error").GetProperty("context");

        // Pusta lista, nigdy pominięty klucz — klient nie rozróżnia dwóch
        // przypadków.
        Assert.Equal(["parents", "children"], PropertyNames(context));
        Assert.Empty(StringValues(context.GetProperty(ObjectResponses.ChildrenContextKey)));
    }

    [Fact]
    public void Deletion_refusal_carries_no_problem_details_fields()
    {
        var refusal = ObjectResponses.DescribeDeletionRefusal("L1", ["GPZ-01"], ["L2"]);

        Assert.NotNull(refusal);

        using var document = Serialize(refusal);

        var root = document.RootElement;
        var error = root.GetProperty("error");

        foreach (var field in ProblemDetailsFields)
        {
            Assert.False(root.TryGetProperty(field, out _), $"Korzeń odpowiedzi zawiera pole '{field}'.");
            Assert.False(error.TryGetProperty(field, out _), $"Obiekt błędu zawiera pole '{field}'.");
        }
    }

    [Fact]
    public void Field_names_match_the_react_router_form_field_names()
    {
        // Zgodność z atrybutami `name` formularza obiektu jest utrzymywana
        // ręcznie i nic jej nie sprawdza przy budowaniu. Ten test jest jedynym
        // miejscem, w którym jej złamanie w ogóle się odezwie.
        Assert.Equal("code", ObjectFormFields.Code);
        Assert.Equal("name", ObjectFormFields.Name);
        Assert.Equal("childIds", ObjectFormFields.ChildIds);
        Assert.Equal("form", ObjectFormFields.Form);
    }

    private static JsonDocument Serialize(ApiError error)
        => JsonDocument.Parse(JsonSerializer.Serialize(error));

    private static string[] PropertyNames(JsonElement element)
        => [.. element.EnumerateObject().Select(property => property.Name)];

    // `null` z elementu JSON `null` przechodzi dalej i przegrywa porównanie
    // z oczekiwanym kodem — wykrzyknik ucisza wyłącznie ostrzeżenie typu.
    private static string[] StringValues(JsonElement array)
        => [.. array.EnumerateArray().Select(item => item.GetString()!)];
}
