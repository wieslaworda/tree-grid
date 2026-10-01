using System.Globalization;
using Api.Data;
using Api.Tree;
using Microsoft.EntityFrameworkCore;

namespace Api.Screens;

/// <summary>
/// Wartości zapisanego ekranu dla jednej doby (<c>S-05</c>): oś czasu
/// rzeczywistej doby w strefie produktu i jedna seria wartości na parę obiekt ×
/// kategoria. Jedno żądanie na (ekran, dobę), a nie na kolumnę ani wiersz
/// (<c>context/foundation/infrastructure.md</c>). Oś i wartości liczy
/// <see cref="ScreenValuesRules"/> — endpoint rozstrzyga tylko tożsamość,
/// właściciela ekranu i dobę.
/// </summary>
/// <remarks>
/// Kolejność kontroli jak w <c>GET /screens/{id}</c>: tożsamość → ekran po
/// identyfikatorze <b>i</b> właścicielu (cudzy jest nieistniejący — 404, nie
/// 403) → doba (400 pod polem <see cref="ScreenRequestFields.Day"/>).
/// Nieistniejący ekran wygrywa z błędem doby, więc zła doba nie zdradza, czy
/// cudzy ekran istnieje.
///
/// Wartości nie są przechowywane: są funkcją pary obiekt × kategoria i końca
/// punktu, dlatego ten sam obiekt w dwóch gałęziach drzewa daje jedną serię,
/// a widok rozdaje ją obu wierszom.
/// </remarks>
internal static class ScreenValuesEndpoints
{
    public static WebApplication MapScreenValuesEndpoints(this WebApplication app)
    {
        // Ograniczenie `int` jak w `ScreenEndpoints`: identyfikator, który nie
        // jest liczbą, kończy się 404 z routingu. Doba wiązana jako tekst, a nie
        // `DateOnly` — zły format ma dać błąd pola w kontrakcie, nie błąd
        // wiązania w kształcie frameworka.
        app.MapGet("/screens/{id:int}/values", GetScreenValuesAsync);

        return app;
    }

    /// <summary>
    /// Oś czasu doby <paramref name="day"/> dla ziarna ekranu i serie wartości:
    /// jedna na różną parę (<c>objectId</c>, <c>categoryId</c>) z przypisań
    /// bieżących węzłów drzewa ekranu, po <c>objectId</c>, potem
    /// <c>categoryId</c>. Każda seria ma tyle wartości, ile jest punktów. Węzeł
    /// bez kategorii nie daje serii.
    /// </summary>
    /// <remarks>
    /// Bez transakcji — jak <c>GET /screens/{id}</c>. Przypisania są łączone
    /// z węzłami drzewa ekranu w jednym zapytaniu, więc przypisanie bez węzła
    /// tego drzewa nie wejdzie do serii.
    /// </remarks>
    private static async Task<IResult> GetScreenValuesAsync(
        int id,
        string? day,
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        var screen = await db.Screens
            .AsNoTracking()
            .Where(s => s.Id == id && s.UserId == userId)
            .Select(s => new { s.Id, s.TreeId, s.GrainMinutes })
            .SingleOrDefaultAsync(cancellationToken);

        if (screen is null)
        {
            return ScreenEndpoints.ScreenNotFound(id);
        }

        if (!ScreenValuesRules.TryParseDay(day, out var parsedDay))
        {
            return ScreenEndpoints.ValidationFailure(new Dictionary<string, string>
            {
                [ScreenRequestFields.Day] = ScreenValuesRules.InvalidDayMessage,
            });
        }

        var points = ScreenValuesRules.BuildPoints(
            parsedDay,
            screen.GrainMinutes,
            ScreenValuesRules.ProductTimeZone);

        var pairs = (await db.ScreenNodeCategories
                .AsNoTracking()
                .Where(assignment => assignment.ScreenId == id && assignment.Node.TreeId == screen.TreeId)
                .Select(assignment => new { assignment.Node.ObjectId, assignment.CategoryId })
                .Distinct()
                .ToListAsync(cancellationToken))
            .OrderBy(pair => pair.ObjectId)
            .ThenBy(pair => pair.CategoryId)
            .ToList();

        return Results.Ok(new
        {
            screenId = screen.Id,
            day = parsedDay.ToString(ScreenValuesRules.DayFormat, CultureInfo.InvariantCulture),
            grainMinutes = screen.GrainMinutes,
            points = points.Select(point => new
            {
                label = point.Label,
                repeated = point.Repeated,
                utcOffsetMinutes = point.UtcOffsetMinutes,
            }),
            series = pairs.Select(pair => new
            {
                objectId = pair.ObjectId,
                categoryId = pair.CategoryId,
                values = points
                    .Select(point => ScreenValuesRules.Value(pair.ObjectId, pair.CategoryId, point.EndUtc))
                    .ToArray(),
            }),
        });
    }
}
