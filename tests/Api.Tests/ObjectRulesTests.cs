using Api.Objects;

namespace Api.Tests;

/// <summary>
/// Regresja reguł słownika obiektów — normalizacji kodu — oraz nazw pól,
/// które muszą się zgadzać po obu stronach granicy. Kształt odmowy usunięcia
/// obiektu użytego w drzewie sprawdza <see cref="TreeRulesTests"/>.
///
/// Wzorem <see cref="AuthErrorContractTests"/> testy nie podnoszą hosta ani
/// bazy. Reguły są w kodzie czystymi funkcjami (<see cref="ObjectRules"/>)
/// właśnie po to, żeby dało się je sprawdzić na danych w pamięci; transakcja,
/// klucze obce i pełna ścieżka HTTP mają weryfikację ręczną.
/// </summary>
public class ObjectRulesTests
{
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
    public void Field_names_match_the_react_router_form_field_names()
    {
        // Zgodność z atrybutami `name` formularza obiektu jest utrzymywana
        // ręcznie i nic jej nie sprawdza przy budowaniu. Ten test jest jedynym
        // miejscem, w którym jej złamanie w ogóle się odezwie.
        Assert.Equal("code", ObjectFormFields.Code);
        Assert.Equal("name", ObjectFormFields.Name);
        Assert.Equal("form", ObjectFormFields.Form);
    }
}
