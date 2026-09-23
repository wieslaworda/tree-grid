using System.Globalization;
using Api.Data;
using Api.Tree;

namespace Api.Tests;

/// <summary>
/// Regresja reguł nazwy drzewa — walidacji z przycinaniem spacji i postaci,
/// po której liczona jest unikalność nazwy w obrębie konta.
///
/// Wzorem <see cref="CategoryRulesTests"/> testy nie podnoszą hosta ani bazy:
/// reguły są czystymi funkcjami (<see cref="TreeNameRules"/>), a transakcja,
/// unikalny indeks <c>(UserId, NormalizedName)</c> i pełna ścieżka HTTP mają
/// weryfikację ręczną.
/// </summary>
public class TreeNameRulesTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t \n")]
    public void Missing_empty_or_blank_name_asks_for_a_name(string? value)
    {
        Assert.False(TreeNameRules.TryValidate(value, out _, out var message));
        Assert.Equal("Podaj nazwę drzewa.", message);
    }

    [Fact]
    public void Name_of_the_maximum_length_is_accepted()
    {
        var value = new string('a', 200);

        Assert.True(TreeNameRules.TryValidate(value, out var name, out var message));
        Assert.Equal(value, name);
        Assert.Null(message);
    }

    [Fact]
    public void Name_over_the_maximum_length_is_rejected_with_the_limit_in_the_message()
    {
        Assert.False(TreeNameRules.TryValidate(new string('a', 201), out _, out var message));
        Assert.Equal("Nazwa drzewa jest za długa (maksymalna długość: 200).", message);
    }

    [Fact]
    public void Length_is_counted_after_trimming()
    {
        var core = new string('a', 200);

        Assert.True(TreeNameRules.TryValidate($"  {core}  ", out var name, out _));
        Assert.Equal(core, name);
    }

    [Fact]
    public void Edge_spaces_are_trimmed_and_inner_spaces_kept()
    {
        Assert.True(TreeNameRules.TryValidate("  Drzewo  robocze \t", out var name, out _));
        Assert.Equal("Drzewo  robocze", name);
    }

    [Fact]
    public void Maximum_length_matches_the_entity_constant()
    {
        // Komunikat i test mówią „200"; stała encji jest metadanymi kolumny.
        // Rozjazd oznaczałby, że walidacja i schemat liczą inny limit.
        Assert.Equal(200, UserTree.NameMaxLength);
    }

    [Fact]
    public void Normalization_ignores_case_and_edge_spaces()
    {
        Assert.Equal(TreeNameRules.Normalize("Drzewo robocze"), TreeNameRules.Normalize("  DRZEWO robocze "));
        Assert.Equal("DRZEWO ROBOCZE", TreeNameRules.Normalize("Drzewo robocze"));
    }

    [Fact]
    public void Normalization_folds_polish_letters()
    {
        Assert.Equal(TreeNameRules.Normalize("Łódź"), TreeNameRules.Normalize("ŁÓDŹ"));
        Assert.Equal("ŁÓDŹ", TreeNameRules.Normalize("łódź"));
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

            Assert.Equal("LINIA", TreeNameRules.Normalize("linia"));
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }
}
