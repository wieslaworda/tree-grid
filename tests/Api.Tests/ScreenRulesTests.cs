using System.Globalization;
using Api.Data;
using Api.Screens;

namespace Api.Tests;

/// <summary>
/// Regresja reguł ekranu — walidacji nazwy, ziarna i listy kategorii
/// domyślnych, materializacji przypisań kategorii do węzłów — oraz nazw pól,
/// które muszą się zgadzać po obu stronach granicy.
///
/// Wzorem <see cref="TreeNameRulesTests"/> i <see cref="TreeRulesTests"/> testy
/// nie podnoszą hosta ani bazy: reguły są czystymi funkcjami
/// (<see cref="ScreenRules"/>), a transakcja, kaskady, izolacja kont i pełna
/// ścieżka HTTP mają weryfikację ręczną.
/// </summary>
public class ScreenRulesTests
{
    // Kategorie nazwane tak, jak w opisach przypadków w planie.
    private const int Q = 21, P = 22, U = 23;

    private const int A = 11, B = 12;

    // --- Nazwa --------------------------------------------------------------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t \n")]
    public void Missing_empty_or_blank_name_asks_for_a_name(string? value)
    {
        Assert.False(ScreenRules.TryValidateName(value, out _, out var message));
        Assert.Equal("Podaj nazwę ekranu.", message);
    }

    [Fact]
    public void Name_of_the_maximum_length_is_accepted()
    {
        var value = new string('a', 200);

        Assert.True(ScreenRules.TryValidateName(value, out var name, out var message));
        Assert.Equal(value, name);
        Assert.Empty(message);
    }

    [Fact]
    public void Name_over_the_maximum_length_is_rejected_with_the_limit_in_the_message()
    {
        Assert.False(ScreenRules.TryValidateName(new string('a', 201), out _, out var message));
        Assert.Equal("Nazwa ekranu jest za długa (maksymalna długość: 200).", message);
    }

    [Fact]
    public void Length_is_counted_after_trimming()
    {
        var core = new string('a', 200);

        Assert.True(ScreenRules.TryValidateName($"  {core}  ", out var name, out _));
        Assert.Equal(core, name);
    }

    [Fact]
    public void Edge_spaces_are_trimmed_and_inner_spaces_kept()
    {
        Assert.True(ScreenRules.TryValidateName("  Ekran  dyspozytora \t", out var name, out _));
        Assert.Equal("Ekran  dyspozytora", name);
    }

    [Fact]
    public void Maximum_length_matches_the_entity_constant()
    {
        // Komunikat i test mówią „200"; stała encji jest metadanymi kolumny.
        // Rozjazd oznaczałby, że walidacja i schemat liczą inny limit.
        Assert.Equal(200, ScreenRules.MaxNameLength);
        Assert.Equal(Screen.NameMaxLength, ScreenRules.MaxNameLength);
    }

    [Fact]
    public void Normalization_ignores_case_and_edge_spaces()
    {
        Assert.Equal(ScreenRules.Normalize("Ekran dobowy"), ScreenRules.Normalize("  EKRAN dobowy "));
        Assert.Equal("EKRAN DOBOWY", ScreenRules.Normalize("Ekran dobowy"));
    }

    [Fact]
    public void Normalization_folds_polish_letters()
    {
        Assert.Equal(ScreenRules.Normalize("Łódź"), ScreenRules.Normalize("ŁÓDŹ"));
        Assert.Equal("ŁÓDŹ", ScreenRules.Normalize("łódź"));
    }

    [Fact]
    public void Normalization_does_not_depend_on_the_machine_culture()
    {
        // Turecka kultura zamienia „i" na „İ" (I z kropką) przy `ToUpper`, więc
        // nazwa z „i" dostałaby na takiej maszynie inną postać porównywaną.
        var original = CultureInfo.CurrentCulture;

        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("tr-TR");

            Assert.Equal("LINIA", ScreenRules.Normalize("linia"));
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    // --- Ziarno -------------------------------------------------------------

    [Theory]
    [InlineData(5)]
    [InlineData(15)]
    [InlineData(60)]
    public void Product_grains_are_accepted(int grainMinutes)
    {
        Assert.True(ScreenRules.TryValidateGrain(grainMinutes, out var message));
        Assert.Empty(message);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(10)]
    [InlineData(30)]
    [InlineData(-5)]
    [InlineData(61)]
    public void Other_grains_are_rejected_with_the_allowed_values_in_the_message(int grainMinutes)
    {
        // 30 dzieli dobę, ale nie jest ziarnem produktu — przypadek brzegowy
        // z planu.
        Assert.False(ScreenRules.TryValidateGrain(grainMinutes, out var message));
        Assert.Equal("Ziarno czasowe musi wynosić 5, 15 albo 60 minut.", message);
    }

    // --- Lista kategorii domyślnych -----------------------------------------

    [Fact]
    public void Empty_default_list_asks_for_at_least_one_category()
    {
        Assert.False(ScreenRules.TryValidateDefaultCategories([], out var message));
        Assert.Equal("Wybierz co najmniej jedną kategorię domyślną.", message);
    }

    [Fact]
    public void Default_list_with_a_repeated_category_is_rejected()
    {
        Assert.False(ScreenRules.TryValidateDefaultCategories([Q, P, Q], out var message));
        Assert.Equal("Kategoria domyślna nie może się powtarzać.", message);
    }

    [Fact]
    public void Valid_default_list_keeps_the_input_order()
    {
        int[] categories = [Q, P, U];

        Assert.True(ScreenRules.TryValidateDefaultCategories(categories, out var message));
        Assert.Empty(message);
        Assert.Equal([Q, P, U], categories);
    }

    // --- Materializacja przypisań -------------------------------------------

    [Fact]
    public void Two_nodes_get_every_default_category_in_list_order()
    {
        var assignments = ScreenRules.Materialize([A, B], [Q, P, U]).ToList();

        Assert.Equal(
            [
                new ScreenAssignment(A, Q, 0),
                new ScreenAssignment(A, P, 1),
                new ScreenAssignment(A, U, 2),
                new ScreenAssignment(B, Q, 0),
                new ScreenAssignment(B, P, 1),
                new ScreenAssignment(B, U, 2),
            ],
            assignments);
    }

    [Fact]
    public void Tree_without_nodes_gives_no_assignments()
    {
        Assert.Empty(ScreenRules.Materialize([], [Q, P, U]));
    }

    [Fact]
    public void Single_new_node_gets_the_default_categories_in_list_order()
    {
        var assignments = ScreenRules.Materialize([B], [U, Q, P]).ToList();

        Assert.Equal([U, Q, P], assignments.Select(assignment => assignment.CategoryId));
        Assert.Equal([0, 1, 2], assignments.Select(assignment => assignment.Position));
        Assert.All(assignments, assignment => Assert.Equal(B, assignment.NodeId));
    }

    // --- Nazwy po obu stronach granicy --------------------------------------

    [Fact]
    public void Request_field_names_match_the_react_router_client()
    {
        Assert.Equal("name", ScreenRequestFields.Name);
        Assert.Equal("treeId", ScreenRequestFields.TreeId);
        Assert.Equal("grainMinutes", ScreenRequestFields.GrainMinutes);
        Assert.Equal("defaultCategoryIds", ScreenRequestFields.DefaultCategoryIds);
    }
}
