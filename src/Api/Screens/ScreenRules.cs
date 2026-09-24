using Api.Data;

namespace Api.Screens;

/// <summary>
/// Reguły ekranu jako czyste funkcje: bez bazy, bez hosta i bez encji EF —
/// wzorem <c>Api.Tree.TreeNameRules</c> i <c>Api.Tree.TreeRules</c>. Endpointy
/// (<see cref="ScreenEndpoints"/>) czytają drzewa, słownik kategorii i ekrany
/// konta i odwzorowują werdykt na kopertę błędu, a walidacja wejścia i wyliczenie
/// przypisań kategorii do węzłów zapadają tutaj, dzięki czemu sprawdza je test
/// jednostkowy.
/// </summary>
internal static class ScreenRules
{
    /// <summary>
    /// Najdłuższa dopuszczalna nazwa ekranu, po obcięciu spacji na brzegach —
    /// ta sama stała, która opisuje kolumnę w schemacie.
    /// </summary>
    internal const int MaxNameLength = Screen.NameMaxLength;

    /// <summary>Komunikat dla braku nazwy, pustej nazwy i nazwy z samych spacji.</summary>
    internal const string MissingNameMessage = "Podaj nazwę ekranu.";

    /// <summary>Komunikat dla braku ziarna i wartości spoza <see cref="AllowedGrainMinutes"/>.</summary>
    internal const string InvalidGrainMessage = "Ziarno czasowe musi wynosić 5, 15 albo 60 minut.";

    /// <summary>Komunikat dla braku listy kategorii domyślnych i listy pustej.</summary>
    internal const string MissingDefaultCategoriesMessage = "Wybierz co najmniej jedną kategorię domyślną.";

    /// <summary>Komunikat dla listy domyślnej, na której ta sama kategoria stoi dwa razy.</summary>
    internal const string DuplicateDefaultCategoryMessage = "Kategoria domyślna nie może się powtarzać.";

    /// <summary>
    /// Ziarna czasowe produktu w minutach — doba dzieli się na 288, 96 albo 24
    /// kolumny. Inne dzielniki doby (np. 30) nie są ziarnem produktu.
    /// </summary>
    internal static readonly IReadOnlySet<int> AllowedGrainMinutes = new HashSet<int> { 5, 15, 60 };

    /// <summary>
    /// Postać nazwy, po której ekrany jednego konta są porównywane: bez spacji
    /// na brzegach i wielkimi literami. Jedno źródło dla kontroli duplikatu
    /// w endpoincie i dla kolumny <see cref="Screen.NormalizedName"/>
    /// z unikalnym indeksem.
    /// </summary>
    /// <remarks>
    /// Ta sama reguła co <c>Api.Tree.TreeNameRules.Normalize</c>, ale celowo
    /// osobna funkcja: unikalność nazwy ekranu i nazwy drzewa to dwie
    /// niezależne decyzje. Z tych samych powodów co tam: nigdy kolacja bazy
    /// (<c>NOCASE</c> nie składa polskich liter) i <c>ToUpperInvariant</c>, bo
    /// tożsamość nazwy nie może zależeć od ustawień regionalnych maszyny.
    /// </remarks>
    internal static string Normalize(string name) => name.Trim().ToUpperInvariant();

    /// <summary>
    /// Sprawdza nazwę z żądania. Zwraca <c>true</c> i nazwę do zapisu (po
    /// obcięciu spacji na brzegach) albo <c>false</c> i komunikat pod pole.
    /// Długość jest liczona po obcięciu. Przy <c>true</c>
    /// <paramref name="message"/> jest pusty.
    /// </summary>
    internal static bool TryValidateName(string? value, out string name, out string message)
    {
        name = value?.Trim() ?? string.Empty;

        if (name.Length == 0)
        {
            message = MissingNameMessage;

            return false;
        }

        if (name.Length > MaxNameLength)
        {
            // Sformułowanie bez odmiany rzeczownika po liczbie — wzorem
            // komunikatu długości nazwy drzewa.
            message = $"Nazwa ekranu jest za długa (maksymalna długość: {MaxNameLength}).";

            return false;
        }

        message = string.Empty;

        return true;
    }

    /// <summary>
    /// Sprawdza ziarno czasowe: dozwolone wyłącznie
    /// <see cref="AllowedGrainMinutes"/>. Przy <c>true</c>
    /// <paramref name="message"/> jest pusty.
    /// </summary>
    internal static bool TryValidateGrain(int grainMinutes, out string message)
    {
        if (AllowedGrainMinutes.Contains(grainMinutes))
        {
            message = string.Empty;

            return true;
        }

        message = InvalidGrainMessage;

        return false;
    }

    /// <summary>
    /// Sprawdza formę listy kategorii domyślnych: co najmniej jedna i bez
    /// powtórzeń. Istnienia kategorii w słowniku reguła nie zna — to
    /// sprawdza endpoint. Kolejność listy jest kolejnością wierszy, więc reguła
    /// jej nie zmienia i nie sortuje. Przy <c>true</c>
    /// <paramref name="message"/> jest pusty.
    /// </summary>
    internal static bool TryValidateDefaultCategories(IReadOnlyList<int> categoryIds, out string message)
    {
        if (categoryIds.Count == 0)
        {
            message = MissingDefaultCategoriesMessage;

            return false;
        }

        if (categoryIds.Distinct().Count() != categoryIds.Count)
        {
            message = DuplicateDefaultCategoryMessage;

            return false;
        }

        message = string.Empty;

        return true;
    }

    /// <summary>
    /// Przypisania kategorii domyślnych do węzłów: każdy węzeł dostaje całą
    /// listę, a <see cref="ScreenAssignment.Position"/> jest indeksem kategorii
    /// na liście domyślnej. Kolejność wyniku: węzeł po węźle w kolejności
    /// wejścia, w obrębie węzła — kolejność listy. Zero węzłów daje zero
    /// przypisań.
    /// </summary>
    /// <remarks>
    /// Jedno źródło dla zapisu nowego ekranu (wszystkie bieżące węzły drzewa)
    /// i dla węzła dodanego do drzewa, które ekran już wskazuje.
    /// </remarks>
    internal static IEnumerable<ScreenAssignment> Materialize(
        IEnumerable<int> nodeIds,
        IReadOnlyList<int> defaultCategoryIds)
    {
        foreach (var nodeId in nodeIds)
        {
            for (var position = 0; position < defaultCategoryIds.Count; position++)
            {
                yield return new ScreenAssignment(nodeId, defaultCategoryIds[position], position);
            }
        }
    }
}

/// <summary>
/// Jedno przypisanie kategorii do węzła w obrębie ekranu, przed zapisem jako
/// <see cref="ScreenNodeCategory"/>. <see cref="Position"/> — klucz porządku
/// kategorii w obrębie węzła.
/// </summary>
internal readonly record struct ScreenAssignment(int NodeId, int CategoryId, int Position);
