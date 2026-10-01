using System.Globalization;
using System.Text.RegularExpressions;
using Api.Screens;

namespace Api.Tests;

/// <summary>
/// Regresja osi czasu doby i wartości prezentacji ekranu (<c>S-05</c>):
/// liczba punktów rzeczywistej doby Europe/Warsaw dla ziarna 5 / 15 / 60,
/// etykiety końca przedziału wokół obu zmian czasu z flagą powtórzenia
/// i przesunięciem, rozpoznanie doby z adresu oraz zakres i powtarzalność
/// wartości.
///
/// Wyrocznią jest plan <c>context/changes/prezentacja-ekranu/plan.md</c>
/// (<c>## Desired End State</c> i <c>## Critical Implementation Details</c>):
/// 2026-10-01 to doba zwykła (CEST, 24 h), 2026-03-29 — 23 h (po <c>02:00</c>
/// CET następuje <c>03:15</c> CEST), 2026-10-25 — 25 h (<c>02:15</c>–<c>03:00</c>
/// dwa razy, drugi raz w CET z <c>repeated</c>). Oczekiwane etykiety i liczby
/// są wpisane ręcznie, a nie liczone przez <see cref="ScreenValuesRules"/>.
///
/// Wzorem <see cref="ScreenRulesTests"/> testy nie podnoszą hosta ani bazy —
/// endpoint, kontrolę właściciela i serie per para obiekt × kategoria sprawdza
/// <see cref="ScreenValuesIntegrationTests"/>.
/// </summary>
public class ScreenValuesRulesTests
{
    private static readonly DateOnly RegularDay = new(2026, 10, 1);

    private static readonly DateOnly MarchChangeDay = new(2026, 3, 29);

    private static readonly DateOnly OctoberChangeDay = new(2026, 10, 25);

    private const int CestMinutes = 120, CetMinutes = 60;

    // --- Liczba punktów -----------------------------------------------------

    [Theory]
    [InlineData("2026-10-01", 5, 288)]
    [InlineData("2026-10-01", 15, 96)]
    [InlineData("2026-10-01", 60, 24)]
    [InlineData("2026-03-29", 5, 276)]
    [InlineData("2026-03-29", 15, 92)]
    [InlineData("2026-03-29", 60, 23)]
    [InlineData("2026-10-25", 5, 300)]
    [InlineData("2026-10-25", 15, 100)]
    [InlineData("2026-10-25", 60, 25)]
    public void Point_count_is_the_real_day_length_divided_by_the_grain(string day, int grainMinutes, int expected)
    {
        Assert.Equal(expected, Points(Day(day), grainMinutes).Count);
    }

    [Theory]
    [InlineData("2026-10-01", 5, "00:05")]
    [InlineData("2026-10-01", 15, "00:15")]
    [InlineData("2026-10-01", 60, "01:00")]
    [InlineData("2026-03-29", 5, "00:05")]
    [InlineData("2026-03-29", 15, "00:15")]
    [InlineData("2026-03-29", 60, "01:00")]
    [InlineData("2026-10-25", 5, "00:05")]
    [InlineData("2026-10-25", 15, "00:15")]
    [InlineData("2026-10-25", 60, "01:00")]
    public void First_label_is_the_end_of_the_first_interval_and_the_last_is_midnight_as_24_00(
        string day,
        int grainMinutes,
        string expectedFirst)
    {
        var points = Points(Day(day), grainMinutes);

        Assert.Equal(expectedFirst, points[0].Label);
        Assert.Equal("24:00", points[^1].Label);
    }

    // --- Doba zwykła --------------------------------------------------------

    [Fact]
    public void Regular_day_has_every_quarter_hour_from_00_15_to_24_00_in_summer_time_without_repeats()
    {
        // Oczekiwany ciąg z arytmetyki kwadransów, nie z reguły pod testem:
        // i-ty punkt kończy się po (i + 1) × 15 minutach od północy.
        var expected = Enumerable.Range(1, 96)
            .Select(i => $"{i * 15 / 60:00}:{i * 15 % 60:00}")
            .ToList();

        var points = Points(RegularDay, 15);

        Assert.Equal(expected, points.Select(point => point.Label));
        Assert.All(points, point => Assert.False(point.Repeated));
        Assert.All(points, point => Assert.Equal(CestMinutes, point.UtcOffsetMinutes));
    }

    [Fact]
    public void Points_end_at_the_utc_instants_of_the_local_day()
    {
        // 2026-10-01 00:00 CEST = 2026-09-30 22:00 UTC; koniec doby —
        // 2026-10-01 22:00 UTC.
        var points = Points(RegularDay, 15);

        Assert.Equal(new DateTime(2026, 9, 30, 22, 15, 0, DateTimeKind.Utc), points[0].EndUtc);
        Assert.Equal(new DateTime(2026, 10, 1, 22, 0, 0, DateTimeKind.Utc), points[^1].EndUtc);
        Assert.All(points, point => Assert.Equal(DateTimeKind.Utc, point.EndUtc.Kind));
    }

    // --- Październikowa zmiana czasu (25 h) ---------------------------------

    [Fact]
    public void October_change_day_has_one_hundred_quarter_hours_with_repeated_labels_marked()
    {
        var points = Points(OctoberChangeDay, 15);

        Assert.Equal(100, points.Count);

        // Punkty 8.–17.: po 02:00 … 03:00 w CEST te same cztery etykiety
        // drugi raz w CET, z flagą powtórzenia, potem 03:15.
        Assert.Equal(
            [
                ("02:00", false, CestMinutes),
                ("02:15", false, CestMinutes),
                ("02:30", false, CestMinutes),
                ("02:45", false, CestMinutes),
                ("03:00", false, CestMinutes),
                ("02:15", true, CetMinutes),
                ("02:30", true, CetMinutes),
                ("02:45", true, CetMinutes),
                ("03:00", true, CetMinutes),
                ("03:15", false, CetMinutes),
            ],
            Tuples(points.Skip(7).Take(10)));

        Assert.Equal(4, points.Count(point => point.Repeated));
        Assert.Equal(CestMinutes, points[0].UtcOffsetMinutes);
        Assert.Equal(("24:00", false, CetMinutes), AsTuple(points[^1]));
    }

    [Fact]
    public void October_change_day_by_the_hour_has_03_00_twice_and_only_the_second_is_repeated()
    {
        var points = Points(OctoberChangeDay, 60);

        Assert.Equal(25, points.Count);
        Assert.Equal(
            [
                ("01:00", false, CestMinutes),
                ("02:00", false, CestMinutes),
                ("03:00", false, CestMinutes),
                ("03:00", true, CetMinutes),
                ("04:00", false, CetMinutes),
            ],
            Tuples(points.Take(5)));
    }

    [Theory]
    [InlineData(5, 12)]
    [InlineData(15, 4)]
    [InlineData(60, 1)]
    public void October_change_day_repeats_exactly_the_points_of_the_doubled_hour(int grainMinutes, int expected)
    {
        // Godzina 02:00–03:00 występuje dwa razy: 60 / ziarno powtórzonych
        // etykiet.
        Assert.Equal(expected, Points(OctoberChangeDay, grainMinutes).Count(point => point.Repeated));
    }

    // --- Marcowa zmiana czasu (23 h) ----------------------------------------

    [Fact]
    public void March_change_day_skips_the_missing_hour_after_02_00_in_winter_time()
    {
        var points = Points(MarchChangeDay, 15);

        Assert.Equal(92, points.Count);

        // Punkty 7.–10.: 02:00 to koniec ostatniego przedziału w CET, a kolejny
        // przedział zaczyna się o 03:00 CEST.
        Assert.Equal(
            [
                ("01:45", false, CetMinutes),
                ("02:00", false, CetMinutes),
                ("03:15", false, CestMinutes),
                ("03:30", false, CestMinutes),
            ],
            Tuples(points.Skip(6).Take(4)));

        string[] missing = ["02:15", "02:30", "02:45", "03:00"];
        Assert.DoesNotContain(points, point => missing.Contains(point.Label));
        Assert.DoesNotContain(points, point => point.Repeated);
    }

    [Fact]
    public void March_change_day_by_the_hour_goes_from_02_00_straight_to_04_00()
    {
        var points = Points(MarchChangeDay, 60);

        Assert.Equal(23, points.Count);
        Assert.Equal(
            [
                ("01:00", false, CetMinutes),
                ("02:00", false, CetMinutes),
                ("04:00", false, CestMinutes),
                ("05:00", false, CestMinutes),
            ],
            Tuples(points.Take(4)));
        Assert.DoesNotContain(points, point => point.Label == "03:00");
    }

    // --- Ziarno -------------------------------------------------------------

    [Theory]
    [InlineData(0)]
    [InlineData(30)]
    [InlineData(-15)]
    public void Grain_outside_the_product_grains_is_a_programming_error(int grainMinutes)
    {
        // Zapis ekranu przepuszcza wyłącznie 5 / 15 / 60 — inne ziarno w osi
        // to błąd programu, nie cicho przycięta doba.
        Assert.Throws<ArgumentOutOfRangeException>(() => Points(RegularDay, grainMinutes));
    }

    // --- Doba z adresu ------------------------------------------------------

    [Fact]
    public void Day_in_the_iso_format_is_accepted()
    {
        Assert.True(ScreenValuesRules.TryParseDay("2026-10-25", out var day));
        Assert.Equal(new DateOnly(2026, 10, 25), day);
    }

    [Theory]
    [InlineData("2026-02-30")]
    [InlineData("2026-1-5")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData(" 2026-10-25")]
    [InlineData("25.10.2026")]
    [InlineData("2026-10-25T00:00")]
    public void Day_that_is_not_an_existing_date_in_the_iso_format_is_rejected(string? value)
    {
        Assert.False(ScreenValuesRules.TryParseDay(value, out _));
    }

    [Fact]
    public void Day_refusal_message_names_the_expected_format()
    {
        Assert.Equal("Doba musi być datą w formacie RRRR-MM-DD.", ScreenValuesRules.InvalidDayMessage);
    }

    [Fact]
    public void Day_is_parsed_the_same_way_regardless_of_the_machine_culture()
    {
        // Kultura z innym kalendarzem nie może zmienić znaczenia cyfr w adresie.
        var original = CultureInfo.CurrentCulture;

        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("th-TH");

            Assert.True(ScreenValuesRules.TryParseDay("2026-10-25", out var day));
            Assert.Equal(new DateOnly(2026, 10, 25), day);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    // --- Wartości -----------------------------------------------------------

    [Fact]
    public void Values_lie_between_0_0_and_999_9_with_one_decimal_place()
    {
        var oneDecimal = new Regex(@"^\d{1,3}(\.\d)?$");
        var points = Points(OctoberChangeDay, 5);

        for (var objectId = 1; objectId <= 20; objectId++)
        {
            for (var categoryId = 1; categoryId <= 5; categoryId++)
            {
                foreach (var point in points)
                {
                    var value = ScreenValuesRules.Value(objectId, categoryId, point.EndUtc);

                    Assert.InRange(value, 0.0, 999.9);
                    Assert.Matches(oneDecimal, value.ToString("R", CultureInfo.InvariantCulture));
                }
            }
        }
    }

    [Fact]
    public void Same_object_category_and_point_always_give_the_same_value()
    {
        var endUtc = new DateTime(2026, 10, 25, 1, 0, 0, DateTimeKind.Utc);

        Assert.Equal(
            ScreenValuesRules.Value(3, 5, endUtc),
            ScreenValuesRules.Value(3, 5, endUtc));
    }

    [Fact]
    public void Another_object_category_or_point_usually_gives_another_value()
    {
        // „Zwykle" — skrót ma 10 000 wartości, więc pojedyncza kolizja jest
        // możliwa; asercja dotyczy całej doby, nie jednej liczby.
        var points = Points(RegularDay, 5);

        var series = Series(3, 5, points);

        Assert.NotEqual(series, Series(4, 5, points));
        Assert.NotEqual(series, Series(3, 6, points));
        Assert.True(
            series.Distinct().Count() > 250,
            $"Seria doby ma za mało różnych wartości: {series.Distinct().Count()} z {series.Count}.");
    }

    [Fact]
    public void The_two_03_00_points_of_the_october_change_day_get_their_own_values()
    {
        // Ta sama etykieta, inna chwila UTC — wartość idzie za chwilą, nie za
        // etykietą.
        var points = Points(OctoberChangeDay, 60);

        Assert.NotEqual(
            ScreenValuesRules.Value(3, 5, points[2].EndUtc),
            ScreenValuesRules.Value(3, 5, points[3].EndUtc));
    }

    // --- Pomocnicze ---------------------------------------------------------

    private static IReadOnlyList<ScreenTimePoint> Points(DateOnly day, int grainMinutes)
        => ScreenValuesRules.BuildPoints(day, grainMinutes, ScreenValuesRules.ProductTimeZone);

    private static DateOnly Day(string value)
        => DateOnly.ParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static List<double> Series(int objectId, int categoryId, IEnumerable<ScreenTimePoint> points)
        => [.. points.Select(point => ScreenValuesRules.Value(objectId, categoryId, point.EndUtc))];

    private static (string Label, bool Repeated, int UtcOffsetMinutes) AsTuple(ScreenTimePoint point)
        => (point.Label, point.Repeated, point.UtcOffsetMinutes);

    private static List<(string Label, bool Repeated, int UtcOffsetMinutes)> Tuples(IEnumerable<ScreenTimePoint> points)
        => [.. points.Select(AsTuple)];
}
