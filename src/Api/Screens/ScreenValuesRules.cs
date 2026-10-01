using System.Globalization;

namespace Api.Screens;

/// <summary>
/// Reguły prezentacji ekranu (<c>S-05</c>) jako czyste funkcje: bez bazy i bez
/// hosta — wzorem <see cref="ScreenRules"/>. Jedno miejsce wiedzy o dobie:
/// rozpoznanie doby z adresu, punkty czasowe rzeczywistej doby w strefie
/// produktu dla ziarna ekranu oraz deterministyczna wartość punktu. Endpoint
/// (<see cref="ScreenValuesEndpoints"/>) rozstrzyga tylko tożsamość,
/// właściciela ekranu i dobę, a odpowiedź składa stąd.
/// </summary>
/// <remarks>
/// Doba to <c>[północ lokalna D, północ lokalna D+1)</c> przeliczone na UTC,
/// więc w dniu zmiany czasu ma 23 albo 25 godzin, a liczba punktów to długość
/// doby podzielona przez ziarno — nie stałe 288 / 96 / 24
/// (<c>context/changes/prezentacja-ekranu/plan.md</c>, „Critical Implementation
/// Details").
/// </remarks>
internal static class ScreenValuesRules
{
    /// <summary>
    /// Strefa produktu po identyfikatorze IANA. Nigdy <c>TimeZoneInfo.Local</c>:
    /// testy i API mają liczyć tę samą oś niezależnie od ustawień maszyny.
    /// </summary>
    internal const string ProductTimeZoneId = "Europe/Warsaw";

    /// <summary>Format doby w adresie i w odpowiedzi.</summary>
    internal const string DayFormat = "yyyy-MM-dd";

    /// <summary>Komunikat dla braku doby, złego formatu i daty, której nie ma w kalendarzu.</summary>
    internal const string InvalidDayMessage = "Doba musi być datą w formacie RRRR-MM-DD.";

    /// <summary>
    /// Etykieta końca ostatniego punktu doby — koniec równy północy kolejnej
    /// doby to <c>24:00</c>, a nie <c>00:00</c>.
    /// </summary>
    internal const string EndOfDayLabel = "24:00";

    /// <summary>
    /// Strefa produktu rozwiązana raz na proces. Na Windows identyfikator IANA
    /// działa w .NET 6+ dzięki ICU.
    /// </summary>
    internal static readonly TimeZoneInfo ProductTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById(ProductTimeZoneId);

    /// <summary>
    /// Rozpoznaje dobę z adresu: wyłącznie <c>RRRR-MM-DD</c> w kulturze
    /// niezmiennej, bez spacji na brzegach. Data spoza kalendarza
    /// (<c>2026-02-30</c>) i miesiąc albo dzień jedną cyfrą (<c>2026-1-5</c>)
    /// to odmowa z <see cref="InvalidDayMessage"/>.
    /// </summary>
    internal static bool TryParseDay(string? value, out DateOnly day)
        => DateOnly.TryParseExact(
            value,
            DayFormat,
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out day);

    /// <summary>
    /// Punkty czasowe doby <paramref name="day"/> w strefie
    /// <paramref name="zone"/> dla ziarna <paramref name="grainMinutes"/>,
    /// w kolejności czasu.
    /// </summary>
    /// <remarks>
    /// Przedział <c>[start, koniec)</c> w UTC dostaje etykietę z czasu
    /// lokalnego końca liczonego przesunięciem obowiązującym na
    /// <b>początku</b> przedziału. Czyste <c>TimeZoneInfo.ConvertTime(koniec)</c>
    /// dałoby w październiku przedziałowi 02:45–03:00 CEST etykietę
    /// <c>02:00</c> CET, a w marcu przedziałowi 01:45–02:00 CET etykietę
    /// <c>03:00</c> CEST. To samo przesunięcie jedzie w
    /// <see cref="ScreenTimePoint.UtcOffsetMinutes"/>. Powtórzeniem jest
    /// etykieta, która w tej dobie już wystąpiła — flagę dostaje tylko drugie
    /// wystąpienie, pierwsze nie.
    /// </remarks>
    /// <exception cref="ArgumentOutOfRangeException">
    /// Ziarno spoza <see cref="ScreenRules.AllowedGrainMinutes"/> — zapis ekranu
    /// takiego nie przepuszcza, więc to błąd programu, a nie danych.
    /// </exception>
    internal static IReadOnlyList<ScreenTimePoint> BuildPoints(DateOnly day, int grainMinutes, TimeZoneInfo zone)
    {
        if (!ScreenRules.AllowedGrainMinutes.Contains(grainMinutes))
        {
            throw new ArgumentOutOfRangeException(
                nameof(grainMinutes),
                grainMinutes,
                ScreenRules.InvalidGrainMessage);
        }

        // Północ lokalna nie wypada w Europe/Warsaw w luce ani w powtórzeniu —
        // zmiana czasu jest o 02:00/03:00 — więc przeliczenie jest jednoznaczne.
        var dayStartUtc = LocalMidnightUtc(day, zone);
        var dayEndUtc = LocalMidnightUtc(day.AddDays(1), zone);
        var grain = TimeSpan.FromMinutes(grainMinutes);

        var points = new List<ScreenTimePoint>();
        var seenLabels = new HashSet<string>(StringComparer.Ordinal);

        for (var startUtc = dayStartUtc; startUtc < dayEndUtc; startUtc += grain)
        {
            var endUtc = startUtc + grain;
            var offset = zone.GetUtcOffset(startUtc);

            var label = endUtc == dayEndUtc
                ? EndOfDayLabel
                : (endUtc + offset).ToString("HH:mm", CultureInfo.InvariantCulture);

            // `Add` zwraca false dla etykiety, która już była.
            var repeated = !seenLabels.Add(label);

            points.Add(new ScreenTimePoint(label, repeated, (int)offset.TotalMinutes, endUtc));
        }

        return points;
    }

    /// <summary>
    /// Wartość punktu dla pary obiekt × kategoria: liczba z zakresu
    /// <c>0.0</c>–<c>999.9</c> z jednym miejscem po przecinku, losowa z wyglądu,
    /// ale powtarzalna — ta sama para i ten sam koniec punktu dają zawsze tę
    /// samą liczbę, także w dwóch gałęziach drzewa i po restarcie API.
    /// </summary>
    /// <remarks>
    /// Własne mieszanie (SplitMix64), a nie <c>HashCode</c>: ten w .NET jest
    /// losowany per proces, więc wartości zmieniałyby się po każdym restarcie.
    /// Chwila końca punktu wchodzi w minutach UTC od epoki Uniksa — dwa punkty
    /// o tej samej etykiecie w październiku (CEST i CET) dostają różne liczby.
    /// </remarks>
    /// <exception cref="ArgumentException"><paramref name="endUtc"/> nie jest czasem UTC.</exception>
    internal static double Value(int objectId, int categoryId, DateTime endUtc)
    {
        if (endUtc.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("Koniec punktu musi być czasem UTC.", nameof(endUtc));
        }

        var minutes = (endUtc - DateTime.UnixEpoch).Ticks / TimeSpan.TicksPerMinute;

        var state = Mix((ulong)(uint)objectId);
        state = Mix(state ^ (uint)categoryId);
        state = Mix(state ^ (ulong)minutes);

        // 0..9999 dziesiątych części, czyli 0.0..999.9.
        return (state % 10_000) / 10.0;
    }

    private static DateTime LocalMidnightUtc(DateOnly day, TimeZoneInfo zone)
        => TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), zone);

    /// <summary>
    /// Krok SplitMix64 (stała złotego podziału i finalizator z mnożeniami) —
    /// standardowe mieszanie 64-bitowe, deterministyczne na każdej maszynie.
    /// </summary>
    private static ulong Mix(ulong value)
    {
        unchecked
        {
            var z = value + 0x9E3779B97F4A7C15UL;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;

            return z ^ (z >> 31);
        }
    }
}

/// <summary>
/// Jeden punkt czasowy doby. <see cref="Label"/> — koniec przedziału jako
/// <c>GG:MI</c> w strefie tego przedziału (<c>24:00</c> dla końca doby);
/// <see cref="Repeated"/> — etykieta już wystąpiła w tej dobie (październikowa
/// zmiana czasu); <see cref="UtcOffsetMinutes"/> — przesunięcie strefy na
/// początku przedziału; <see cref="EndUtc"/> — koniec przedziału w UTC, wejście
/// <see cref="ScreenValuesRules.Value"/>.
/// </summary>
internal readonly record struct ScreenTimePoint(string Label, bool Repeated, int UtcOffsetMinutes, DateTime EndUtc);
