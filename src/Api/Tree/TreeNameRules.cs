using Api.Data;

namespace Api.Tree;

/// <summary>
/// Reguły nazwy drzewa jako czyste funkcje: bez bazy, bez hosta i bez encji EF
/// — wzorem <c>CategoryRules</c>. Endpointy (<see cref="TreeEndpoints"/>) czytają
/// drzewa konta i odwzorowują wynik na kopertę błędu, a walidacja i postać
/// porównywana zapadają tutaj, dzięki czemu sprawdza je test jednostkowy.
/// </summary>
internal static class TreeNameRules
{
    /// <summary>Komunikat dla braku nazwy, pustej nazwy i nazwy z samych spacji.</summary>
    internal const string MissingNameMessage = "Podaj nazwę drzewa.";

    /// <summary>
    /// Postać nazwy, po której drzewa jednego konta są porównywane: bez spacji
    /// na brzegach i wielkimi literami. Jedno źródło dla kontroli duplikatu
    /// w endpoincie i dla kolumny <see cref="UserTree.NormalizedName"/>
    /// z unikalnym indeksem.
    /// </summary>
    /// <remarks>
    /// Ta sama reguła co <see cref="DictionaryCode.Normalize"/>, ale celowo
    /// osobna funkcja: unikalność kodu słownika jest globalna, a nazwy drzewa —
    /// w obrębie konta, więc to dwie niezależne decyzje i każda może się
    /// zmienić bez skutków dla drugiej. Z tych samych powodów co tam: nigdy
    /// kolacja bazy (<c>NOCASE</c> nie składa polskich liter) i
    /// <c>ToUpperInvariant</c>, bo tożsamość nazwy nie może zależeć od ustawień
    /// regionalnych maszyny.
    /// </remarks>
    internal static string Normalize(string name) => name.Trim().ToUpperInvariant();

    /// <summary>
    /// Sprawdza nazwę z żądania. Zwraca <c>true</c> i nazwę do zapisu (po
    /// obcięciu spacji na brzegach) albo <c>false</c> i komunikat pod pole.
    /// Długość jest liczona po obcięciu.
    /// </summary>
    internal static bool TryValidate(string? value, out string name, out string? message)
    {
        name = value?.Trim() ?? string.Empty;

        if (name.Length == 0)
        {
            message = MissingNameMessage;

            return false;
        }

        if (name.Length > UserTree.NameMaxLength)
        {
            // Sformułowanie bez odmiany rzeczownika po liczbie — wzorem
            // komunikatów długości w słownikach.
            message = $"Nazwa drzewa jest za długa (maksymalna długość: {UserTree.NameMaxLength}).";

            return false;
        }

        message = null;

        return true;
    }
}
