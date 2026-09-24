using Api.Data;

namespace Api.Categories;

/// <summary>
/// Reguły słownika kategorii jako czyste funkcje: bez bazy, bez hosta i bez
/// encji EF — wzorem <c>ObjectRules</c>. Endpointy
/// (<see cref="CategoryEndpoints"/>) czytają stan i odwzorowują wynik na
/// odpowiedź, a odczyt i zapis funkcji agregującej zapadają tutaj, dzięki
/// czemu sprawdza je test jednostkowy.
/// </summary>
internal static class CategoryRules
{
    /// <summary>
    /// Odczytuje funkcję agregującą z tekstu żądania: <c>SUM</c>, <c>MIN</c>
    /// albo <c>MAX</c> po obcięciu spacji na brzegach, bez rozróżniania
    /// wielkości liter. Wszystko inne — pusty tekst, <c>null</c>, nieznana
    /// nazwa, liczba — daje <c>false</c>.
    /// </summary>
    /// <remarks>
    /// Celowo nie <c>Enum.TryParse</c>: ten przyjmuje także wartość liczbową
    /// (<c>"1"</c>) i nazwę składowej enuma, a kontraktem jest wyłącznie zapis
    /// kanoniczny. Porównanie idzie po <see cref="FormatAggregateFunction"/>,
    /// więc odczyt i zapis nie mogą się rozjechać.
    /// </remarks>
    internal static bool TryParseAggregateFunction(string? value, out AggregateFunction function)
    {
        var candidate = value?.Trim();

        foreach (var known in Enum.GetValues<AggregateFunction>())
        {
            if (string.Equals(FormatAggregateFunction(known), candidate, StringComparison.OrdinalIgnoreCase))
            {
                function = known;

                return true;
            }
        }

        function = default;

        return false;
    }

    /// <summary>
    /// Zapis kanoniczny funkcji agregującej — ten sam, który trafia do kolumny
    /// bazy (konwersja wartości w <see cref="AppDbContext"/>) i do odpowiedzi
    /// API. Plik bazy ma być czytelny bez kodu, stąd tekst, a nie liczba.
    /// </summary>
    /// <remarks>
    /// Wartość enuma bez zapisu rzuca wyjątkiem zamiast zwrócić cokolwiek
    /// zastępczego — test przechodzący po wszystkich wartościach enuma
    /// odezwie się, zanim taka wartość trafi do bazy.
    /// </remarks>
    internal static string FormatAggregateFunction(AggregateFunction function) => function switch
    {
        AggregateFunction.Sum => "SUM",
        AggregateFunction.Min => "MIN",
        AggregateFunction.Max => "MAX",
        _ => throw new ArgumentOutOfRangeException(
            nameof(function),
            function,
            "Funkcja agregująca nie ma zapisu kanonicznego."),
    };

    /// <summary>
    /// Odczytuje kolor kategorii: <c>#</c> i dokładnie sześć cyfr
    /// szesnastkowych po obcięciu spacji na brzegach, bez rozróżniania
    /// wielkości liter. Wynik jest postacią kanoniczną — wielkimi literami —
    /// więc <c>#1677ff</c> i <c>#1677FF</c> zapisują się tak samo. Skrót
    /// <c>#RGB</c>, kanał przezroczystości i nazwy kolorów dają <c>false</c>.
    /// </summary>
    internal static bool TryNormalizeColor(string? value, out string color)
    {
        var candidate = value?.Trim() ?? string.Empty;

        if (candidate.Length == Category.ColorLength
            && candidate[0] == '#'
            && candidate.Skip(1).All(char.IsAsciiHexDigit))
        {
            color = candidate.ToUpperInvariant();

            return true;
        }

        color = string.Empty;

        return false;
    }
}
