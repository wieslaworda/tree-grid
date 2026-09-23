using Api.Data;
using Api.Errors;
using Microsoft.EntityFrameworkCore;

namespace Api.Objects;

/// <summary>
/// Endpointy słownika obiektów: lista, utworzenie, zmiana i usunięcie. Wzorem
/// <c>Api.Auth</c> mieszkają poza <c>Program.cs</c>, a reguły, na których
/// stoją, są czystymi funkcjami w <see cref="ObjectRules"/>. Endpoint robi
/// trzy rzeczy: wiąże żądanie, czyta i zapisuje w jednej transakcji oraz
/// odwzorowuje wynik reguły na kopertę błędu.
///
/// Słownik jest wspólny dla wszystkich kont, więc żaden endpoint nie filtruje
/// po właścicielu, a API nie potrzebuje tu tożsamości użytkownika.
/// </summary>
/// <remarks>
/// Każdy zapis otwiera transakcję <b>przed</b> pierwszym odczytem stanu, na
/// którym opiera decyzję, i zatwierdza ją dopiero po <c>SaveChanges</c>. Na
/// SQLite <c>BeginTransaction</c> startuje od razu jako transakcja zapisowa
/// (<c>BEGIN IMMEDIATE</c>), więc drugi równoległy zapis czeka na pierwszy
/// (<c>busy_timeout</c> z <c>Program.cs</c>), zamiast czytać ten sam stan
/// grafu. Odczyt przed transakcją pozwoliłby dwóm zapisom — A dostaje
/// podobiekt B, B jednocześnie dostaje A — przejść kontrolę cyklu osobno
/// i razem zapisać cykl, czyli dokładnie ten stan, którego reguła zabrania.
/// Wyjście z metody bez <c>Commit</c> (odmowa, wyjątek) wycofuje transakcję
/// przy jej zwolnieniu.
/// </remarks>
internal static class ObjectEndpoints
{
    private const string ObjectsPath = "/objects";

    private const string ValidationMessage = "Przesłane dane są nieprawidłowe.";

    public static WebApplication MapObjectEndpoints(this WebApplication app)
    {
        // Ograniczenie `int` w szablonie: identyfikator, który nie jest liczbą,
        // kończy się 404 z routingu, a nie błędem wiązania w cudzym kształcie.
        app.MapGet(ObjectsPath, ListAsync);
        app.MapPost(ObjectsPath, CreateAsync);
        app.MapPut($"{ObjectsPath}/{{id:int}}", UpdateAsync);
        app.MapDelete($"{ObjectsPath}/{{id:int}}", DeleteAsync);

        return app;
    }

    /// <summary>
    /// Cały słownik z relacjami, posortowany po kodzie znormalizowanym
    /// porządkiem porządkowym — tym samym, którym porównuje go unikalny indeks.
    /// </summary>
    private static async Task<IResult> ListAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var catalog = await LoadCatalogAsync(db, cancellationToken);

        // Obiekty i relacje to dwa zapytania bez wspólnej transakcji —
        // transakcja zapisowa ustawiałaby każdy odczyt listy w kolejce za
        // zapisami. Zapis wchodzący między oba zapytania może zostawić relację
        // do obiektu, którego lista nie zawiera; taka relacja jest pomijana,
        // żeby odpowiedź nigdy nie wskazywała identyfikatora spoza `items`.
        var links = (await LoadLinksAsync(db, cancellationToken))
            .Where(link => catalog.ContainsKey(link.ParentId) && catalog.ContainsKey(link.ChildId))
            .ToList();

        var childrenByParent = links.ToLookup(link => link.ParentId, link => link.ChildId);
        var parentsByChild = links.ToLookup(link => link.ChildId, link => link.ParentId);

        var items = catalog.Values
            .OrderBy(entry => entry.NormalizedCode, StringComparer.Ordinal)
            .Select(entry => ObjectResponse(
                entry.Id,
                entry.Code,
                entry.Name,
                [.. childrenByParent[entry.Id].Order()],
                [.. parentsByChild[entry.Id].Order()]))
            .ToList();

        return Results.Ok(new { items });
    }

    /// <summary>
    /// Zakłada obiekt. Kontroli cyklu tu nie ma i być nie musi: do obiektu,
    /// którego jeszcze nie ma, nic nie prowadzi, więc jego podobiekty nie mogą
    /// zamknąć pętli.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        ObjectRequest? request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var input = ReadInput(request);
        var fields = ValidateFields(input);

        // Transakcja także tutaj: kontrola duplikatu kodu i istnienia
        // podobiektów ma czytać ten sam stan, na który trafi zapis — inaczej
        // równoległe usunięcie podobiektu kończy się błędem klucza obcego,
        // a równoległe utworzenie tego samego kodu — wyjątkiem z indeksu.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var catalog = await LoadCatalogAsync(db, cancellationToken);

        ValidateAgainstCatalog(fields, input, catalog, editedId: null);

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        var entity = new CatalogObject
        {
            Code = input.Code,
            NormalizedCode = ObjectRules.NormalizeCode(input.Code),
            Name = input.Name,
        };

        foreach (var childId in input.ChildIds)
        {
            entity.Children.Add(new CatalogObjectLink { ChildId = childId });
        }

        db.CatalogObjects.Add(entity);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created(
            $"{ObjectsPath}/{entity.Id}",
            ObjectResponse(entity.Id, entity.Code, entity.Name, input.ChildIds, parentIds: []));
    }

    /// <summary>
    /// Zastępuje kod, nazwę i <b>cały</b> zestaw podobiektów. To jedyna
    /// ścieżka, na której może powstać cykl.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        int id,
        ObjectRequest? request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var input = ReadInput(request);
        var fields = ValidateFields(input);

        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var entity = await db.CatalogObjects
            .Include(o => o.Children)
            .SingleOrDefaultAsync(o => o.Id == id, cancellationToken);

        // Nieistniejący zasób wygrywa z błędami pól: poprawianie formularza
        // obiektu, którego nie ma, i tak niczego by nie zapisało.
        if (entity is null)
        {
            return ObjectNotFound(id);
        }

        var catalog = await LoadCatalogAsync(db, cancellationToken);
        var links = await LoadLinksAsync(db, cancellationToken);

        ValidateAgainstCatalog(fields, input, catalog, editedId: id);

        if (!fields.ContainsKey(ObjectFormFields.ChildIds))
        {
            if (input.ChildIds.Contains(id))
            {
                fields[ObjectFormFields.ChildIds] = "Obiekt nie może być własnym podobiektem.";
            }
            else if (ObjectRules.FindCycle(id, input.ChildIds, ChildrenByParent(links)) is { } cycle)
            {
                // Wszystkie węzły ścieżki są w `catalog`: podobiekty przeszły
                // kontrolę istnienia, a resztę wskazują relacje z kluczami
                // obcymi, odczytane w tej samej transakcji.
                var codes = cycle.Select(node => catalog[node].Code);

                fields[ObjectFormFields.ChildIds] =
                    $"Zapisanie tych podobiektów utworzyłoby zapętlenie: {string.Join(" → ", codes)}.";
            }
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        entity.Code = input.Code;
        entity.NormalizedCode = ObjectRules.NormalizeCode(input.Code);
        entity.Name = input.Name;

        // Różnica zestawów, a nie „usuń wszystkie, dodaj od nowa": relacje,
        // które zostają, nie są ruszane wcale. Relacja jest usuwana jako
        // encja, a nie wyjmowana z kolekcji — przy `Restrict` odcięcie
        // wymaganej relacji od rodzica rzuca wyjątkiem zamiast ją usunąć.
        var currentChildIds = entity.Children.Select(link => link.ChildId).ToHashSet();

        foreach (var link in entity.Children.Where(link => !input.ChildIds.Contains(link.ChildId)).ToList())
        {
            db.CatalogObjectLinks.Remove(link);
        }

        foreach (var childId in input.ChildIds.Where(childId => !currentChildIds.Contains(childId)))
        {
            entity.Children.Add(new CatalogObjectLink { ChildId = childId });
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var parentIds = links
            .Where(link => link.ChildId == id)
            .Select(link => link.ParentId)
            .Order()
            .ToList();

        return Results.Ok(ObjectResponse(entity.Id, entity.Code, entity.Name, input.ChildIds, parentIds));
    }

    /// <summary>
    /// Usuwa obiekt bez powiązań. Odmowa dotyczy także żądania wysłanego
    /// z pominięciem interfejsu, który przycisk usuwania i tak wyłącza.
    /// </summary>
    private static async Task<IResult> DeleteAsync(int id, AppDbContext db, CancellationToken cancellationToken)
    {
        // Przed pierwszym odczytem — patrz komentarz klasy. Bez tego relacja
        // dopisana równolegle między kontrolą a usunięciem zamieniłaby czytelną
        // odmowę w błąd klucza obcego.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var entity = await db.CatalogObjects.SingleOrDefaultAsync(o => o.Id == id, cancellationToken);

        if (entity is null)
        {
            return ObjectNotFound(id);
        }

        var parentCodes = SortCodes(await db.CatalogObjectLinks
            .Where(link => link.ChildId == id)
            .Select(link => new CodeEntry(link.Parent.Code, link.Parent.NormalizedCode))
            .ToListAsync(cancellationToken));

        var childCodes = SortCodes(await db.CatalogObjectLinks
            .Where(link => link.ParentId == id)
            .Select(link => new CodeEntry(link.Child.Code, link.Child.NormalizedCode))
            .ToListAsync(cancellationToken));

        if (ObjectResponses.DescribeDeletionRefusal(entity.Code, parentCodes, childCodes) is { } refusal)
        {
            return Results.Json(refusal, statusCode: StatusCodes.Status409Conflict);
        }

        db.CatalogObjects.Remove(entity);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Odpowiedź o obiekcie — ten sam kształt dla elementu listy, utworzenia
    /// i zmiany, więc powstaje w jednym miejscu.
    /// </summary>
    private static object ObjectResponse(
        int id,
        string code,
        string name,
        IReadOnlyList<int> childIds,
        IReadOnlyList<int> parentIds)
        => new { id, code, name, childIds, parentIds };

    private static ObjectInput ReadInput(ObjectRequest? request) => new(
        request?.Code?.Trim() ?? string.Empty,
        request?.Name?.Trim() ?? string.Empty,
        // Powtórzony identyfikator jest scalany, a nie odrzucany: zestaw
        // podobiektów jest zbiorem, a relacja o tej samej parze i tak nie
        // zmieściłaby się w kluczu złożonym. Brak pola to pusty zestaw.
        [.. (request?.ChildIds ?? []).Distinct().Order()]);

    /// <summary>
    /// Naruszenia, które widać bez sięgania do bazy: brak i długość pól.
    /// </summary>
    private static Dictionary<string, string> ValidateFields(ObjectInput input)
    {
        var fields = new Dictionary<string, string>();

        if (input.Code.Length == 0)
        {
            fields[ObjectFormFields.Code] = "Podaj kod obiektu.";
        }
        else if (input.Code.Length > CatalogObject.CodeMaxLength)
        {
            // Sformułowanie bez odmiany rzeczownika po liczbie: „32 znaki",
            // ale „30 znaków" — zmiana stałej nie ma psuć komunikatu.
            fields[ObjectFormFields.Code] =
                $"Kod obiektu jest za długi (maksymalna długość: {CatalogObject.CodeMaxLength}).";
        }

        if (input.Name.Length == 0)
        {
            fields[ObjectFormFields.Name] = "Podaj nazwę obiektu.";
        }
        else if (input.Name.Length > CatalogObject.NameMaxLength)
        {
            fields[ObjectFormFields.Name] =
                $"Nazwa obiektu jest za długa (maksymalna długość: {CatalogObject.NameMaxLength}).";
        }

        return fields;
    }

    /// <summary>
    /// Naruszenia, które wymagają stanu słownika: kod zajęty przez inny obiekt
    /// i nieistniejący podobiekt.
    /// </summary>
    /// <remarks>
    /// Pierwsze naruszenie pola wygrywa: formularz pokazuje pod polem jeden
    /// komunikat, więc kod, który nie przeszedł kontroli formy, nie jest już
    /// sprawdzany pod kątem duplikatu.
    /// </remarks>
    private static void ValidateAgainstCatalog(
        Dictionary<string, string> fields,
        ObjectInput input,
        IReadOnlyDictionary<int, CatalogEntry> catalog,
        int? editedId)
    {
        if (!fields.ContainsKey(ObjectFormFields.Code))
        {
            var normalizedCode = ObjectRules.NormalizeCode(input.Code);

            // Porównanie porządkowe, tak jak porównuje unikalny indeks. Obiekt
            // edytowany nie koliduje sam ze sobą — zmiana samej wielkości liter
            // własnego kodu jest dozwolona.
            var holder = catalog.Values.FirstOrDefault(entry =>
                entry.Id != editedId
                && string.Equals(entry.NormalizedCode, normalizedCode, StringComparison.Ordinal));

            if (holder is not null)
            {
                fields[ObjectFormFields.Code] = $"Obiekt o kodzie „{holder.Code}\" już istnieje.";
            }
        }

        var missing = input.ChildIds.Where(childId => !catalog.ContainsKey(childId)).ToList();

        if (missing.Count > 0)
        {
            fields.TryAdd(
                ObjectFormFields.ChildIds,
                missing.Count == 1
                    ? $"Podobiekt o identyfikatorze {missing[0]} nie istnieje."
                    : $"Podobiekty o identyfikatorach {string.Join(", ", missing)} nie istnieją.");
        }
    }

    private static async Task<Dictionary<int, CatalogEntry>> LoadCatalogAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
        => await db.CatalogObjects
            .AsNoTracking()
            .Select(o => new CatalogEntry(o.Id, o.Code, o.NormalizedCode, o.Name))
            .ToDictionaryAsync(entry => entry.Id, cancellationToken);

    private static async Task<List<LinkEntry>> LoadLinksAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
        => await db.CatalogObjectLinks
            .AsNoTracking()
            .Select(link => new LinkEntry(link.ParentId, link.ChildId))
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Graf sąsiedztwa w kształcie, który przyjmuje
    /// <see cref="ObjectRules.FindCycle"/>. Dzieci posortowane, żeby ścieżka
    /// cyklu w komunikacie nie zależała od kolejności wierszy w bazie.
    /// </summary>
    private static Dictionary<int, IReadOnlyCollection<int>> ChildrenByParent(IEnumerable<LinkEntry> links)
        => links
            .GroupBy(link => link.ParentId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<int>)group.Select(link => link.ChildId).Order().ToList());

    private static List<string> SortCodes(IEnumerable<CodeEntry> entries)
        => [.. entries
            .OrderBy(entry => entry.NormalizedCode, StringComparer.Ordinal)
            .Select(entry => entry.Code)];

    private static IResult ObjectNotFound(int id)
        => Results.Json(
            ApiError.Create(ApiErrorCodes.NotFound, $"Nie znaleziono obiektu o identyfikatorze {id}."),
            statusCode: StatusCodes.Status404NotFound);

    private static IResult ValidationFailure(IReadOnlyDictionary<string, string> fields)
        => Results.Json(
            ApiError.Validation(ValidationMessage, fields),
            statusCode: StatusCodes.Status400BadRequest);

    /// <summary>Treść żądania po obcięciu spacji i scaleniu powtórzeń.</summary>
    private readonly record struct ObjectInput(string Code, string Name, IReadOnlyList<int> ChildIds);

    private sealed record CatalogEntry(int Id, string Code, string NormalizedCode, string Name);

    private sealed record LinkEntry(int ParentId, int ChildId);

    private sealed record CodeEntry(string Code, string NormalizedCode);
}

/// <summary>
/// Nazwy pól w mapie naruszeń (<c>context.fields</c>).
/// </summary>
/// <remarks>
/// Muszą być identyczne z atrybutami <c>name</c> formularza obiektu po stronie
/// React Routera (<c>app/components/FormularzObiektu.tsx</c>). Zgodność jest
/// utrzymywana ręcznie: nie sprawdza jej ani kompilator, ani
/// <c>npm run typecheck</c>, a rozjazd nie daje żadnego błędu — komunikat po
/// prostu nie pojawia się przy polu, którego dotyczy.
/// </remarks>
internal static class ObjectFormFields
{
    public const string Code = "code";

    public const string Name = "name";

    /// <summary>
    /// Zestaw podobiektów. Pod tym polem lądują trzy naruszenia: nieistniejący
    /// podobiekt, obiekt jako własny podobiekt i zapętlenie.
    /// </summary>
    public const string ChildIds = "childIds";

    /// <summary>
    /// Pole zbiorcze na naruszenia, które nie dotyczą żadnego konkretnego pola
    /// formularza — ta sama rola co <c>AuthFormFields.Form</c>.
    /// </summary>
    public const string Form = "form";
}

/// <summary>
/// Odpowiedzi błędne słownika, które niosą regułę, a nie tylko tekst.
/// Wydzielone z <see cref="ObjectEndpoints"/> wzorem <c>AuthResponses</c>:
/// kształt odmowy ma być sprawdzalny bez potoku HTTP.
/// </summary>
internal static class ObjectResponses
{
    /// <summary>Klucz w <c>context</c> z kodami obiektów nadrzędnych.</summary>
    internal const string ParentsContextKey = "parents";

    /// <summary>Klucz w <c>context</c> z kodami podobiektów.</summary>
    internal const string ChildrenContextKey = "children";

    /// <summary>
    /// Odmowa usunięcia obiektu <paramref name="code"/> albo <c>null</c>, gdy
    /// usunięcie jest dozwolone (<see cref="ObjectRules.CanDelete"/>).
    /// Odpowiedzią odmowy jest 409 z <see cref="ApiErrorCodes.ObjectHasRelations"/>.
    /// </summary>
    /// <remarks>
    /// Komunikat wymienia kody powiązanych obiektów, bo użytkownik musi
    /// wiedzieć, które relacje zdjąć, zanim spróbuje ponownie. W
    /// <c>context</c> oba klucze są zawsze obecne, także z pustą listą — klient
    /// nie musi rozróżniać „brak pola" od „brak powiązań".
    /// </remarks>
    public static ApiError? DescribeDeletionRefusal(
        string code,
        IReadOnlyList<string> parentCodes,
        IReadOnlyList<string> childCodes)
    {
        if (ObjectRules.CanDelete(parentCodes.Count, childCodes.Count))
        {
            return null;
        }

        var relations = new List<string>();

        if (parentCodes.Count > 0)
        {
            relations.Add($"obiekty nadrzędne: {string.Join(", ", parentCodes)}");
        }

        if (childCodes.Count > 0)
        {
            relations.Add($"podobiekty: {string.Join(", ", childCodes)}");
        }

        return ApiError.Create(
            ApiErrorCodes.ObjectHasRelations,
            $"Nie można usunąć obiektu „{code}\", bo ma powiązania — {string.Join("; ", relations)}.",
            new Dictionary<string, object?>
            {
                [ParentsContextKey] = parentCodes,
                [ChildrenContextKey] = childCodes,
            });
    }
}

/// <summary>
/// Treść żądania utworzenia i zmiany obiektu. Pola są nullowalne, żeby ich
/// brak dawał błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie
/// frameworka.
/// </summary>
internal sealed record ObjectRequest(string? Code, string? Name, int[]? ChildIds);
