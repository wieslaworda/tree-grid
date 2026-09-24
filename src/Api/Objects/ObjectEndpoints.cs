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
/// po właścicielu, a API nie potrzebuje tu tożsamości użytkownika. Obiekt to
/// wyłącznie kod i nazwa — relacji między obiektami słownik nie niesie.
/// </summary>
/// <remarks>
/// Każdy zapis otwiera transakcję <b>przed</b> pierwszym odczytem stanu, na
/// którym opiera decyzję, i zatwierdza ją dopiero po <c>SaveChanges</c>. Na
/// SQLite <c>BeginTransaction</c> startuje od razu jako transakcja zapisowa
/// (<c>BEGIN IMMEDIATE</c>), więc drugi równoległy zapis czeka na pierwszy
/// (<c>busy_timeout</c> z <c>Program.cs</c>), zamiast czytać ten sam stan.
/// Odczyt przed transakcją pozwoliłby dwóm zapisom tego samego kodu przejść
/// kontrolę duplikatu osobno i skończyć się wyjątkiem z unikalnego indeksu,
/// a usunięciu obiektu — minąć się z równoległym dodaniem go do drzewa.
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
    /// Cały słownik posortowany po kodzie znormalizowanym porządkiem
    /// porządkowym — tym samym, którym porównuje go unikalny indeks.
    /// </summary>
    private static async Task<IResult> ListAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var catalog = await LoadCatalogAsync(db, cancellationToken);

        var items = catalog.Values
            .OrderBy(entry => entry.NormalizedCode, StringComparer.Ordinal)
            .Select(entry => ObjectResponse(entry.Id, entry.Code, entry.Name))
            .ToList();

        return Results.Ok(new { items });
    }

    /// <summary>Zakłada obiekt.</summary>
    private static async Task<IResult> CreateAsync(
        ObjectRequest? request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var input = ReadInput(request);
        var fields = ValidateFields(input);

        // Transakcja także tutaj: kontrola duplikatu kodu ma czytać ten sam
        // stan, na który trafi zapis — inaczej równoległe utworzenie tego
        // samego kodu kończy się wyjątkiem z indeksu.
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

        db.CatalogObjects.Add(entity);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Created(
            $"{ObjectsPath}/{entity.Id}",
            ObjectResponse(entity.Id, entity.Code, entity.Name));
    }

    /// <summary>Zastępuje kod i nazwę obiektu.</summary>
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

        var entity = await db.CatalogObjects.SingleOrDefaultAsync(o => o.Id == id, cancellationToken);

        // Nieistniejący zasób wygrywa z błędami pól: poprawianie formularza
        // obiektu, którego nie ma, i tak niczego by nie zapisało.
        if (entity is null)
        {
            return ObjectNotFound(id);
        }

        var catalog = await LoadCatalogAsync(db, cancellationToken);

        ValidateAgainstCatalog(fields, input, catalog, editedId: id);

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        entity.Code = input.Code;
        entity.NormalizedCode = ObjectRules.NormalizeCode(input.Code);
        entity.Name = input.Name;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(ObjectResponse(entity.Id, entity.Code, entity.Name));
    }

    /// <summary>
    /// Usuwa obiekt bez wystąpień w drzewach. O drzewach interfejs nie wie
    /// (są prywatne), więc tę odmowę widzi dopiero po odpowiedzi API.
    /// </summary>
    private static async Task<IResult> DeleteAsync(int id, AppDbContext db, CancellationToken cancellationToken)
    {
        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var entity = await db.CatalogObjects.SingleOrDefaultAsync(o => o.Id == id, cancellationToken);

        if (entity is null)
        {
            return ObjectNotFound(id);
        }

        // Wystąpienia w drzewach — w tej samej transakcji: węzeł dodany
        // równolegle między kontrolą a usunięciem zamieniłby odmowę w błąd
        // klucza obcego (`Restrict` w `AppDbContext`). Zapytanie celowo nie
        // filtruje po właścicielu — liczy się każde drzewo — i celowo nie
        // oddaje nic poza faktem użycia.
        if (await db.TreeNodes.AnyAsync(node => node.ObjectId == id, cancellationToken))
        {
            return Results.Json(
                ObjectResponses.DescribeTreeUsageRefusal(entity.Code),
                statusCode: StatusCodes.Status409Conflict);
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
    private static object ObjectResponse(int id, string code, string name)
        => new { id, code, name };

    private static ObjectInput ReadInput(ObjectRequest? request) => new(
        request?.Code?.Trim() ?? string.Empty,
        request?.Name?.Trim() ?? string.Empty);

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
    /// Naruszenie, które wymaga stanu słownika: kod zajęty przez inny obiekt.
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
        if (fields.ContainsKey(ObjectFormFields.Code))
        {
            return;
        }

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

    private static async Task<Dictionary<int, CatalogEntry>> LoadCatalogAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
        => await db.CatalogObjects
            .AsNoTracking()
            .Select(o => new CatalogEntry(o.Id, o.Code, o.NormalizedCode, o.Name))
            .ToDictionaryAsync(entry => entry.Id, cancellationToken);

    private static IResult ObjectNotFound(int id)
        => Results.Json(
            ApiError.Create(ApiErrorCodes.NotFound, $"Nie znaleziono obiektu o identyfikatorze {id}."),
            statusCode: StatusCodes.Status404NotFound);

    private static IResult ValidationFailure(IReadOnlyDictionary<string, string> fields)
        => Results.Json(
            ApiError.Validation(ValidationMessage, fields),
            statusCode: StatusCodes.Status400BadRequest);

    /// <summary>Treść żądania po obcięciu spacji.</summary>
    private readonly record struct ObjectInput(string Code, string Name);

    private sealed record CatalogEntry(int Id, string Code, string NormalizedCode, string Name);
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
    /// Pole zbiorcze na naruszenia, które nie dotyczą żadnego konkretnego pola
    /// formularza — ta sama rola co <c>AuthFormFields.Form</c>.
    /// </summary>
    /// <remarks>
    /// Zarezerwowane: żaden endpoint <c>/objects</c> go dziś nie emituje, a
    /// <c>FormularzObiektu.tsx</c> czyta je na zapas. Pierwsze naruszenie spoza
    /// pól ma trafić właśnie tutaj, zamiast wprowadzać drugą nazwę. Świadomy
    /// wyjątek od reguły „Kontrakt API nie wyprzedza emitenta"
    /// (<c>context/foundation/lessons.md</c>, impl-review F6).
    /// </remarks>
    public const string Form = "form";
}

/// <summary>
/// Odpowiedzi błędne słownika, które niosą regułę, a nie tylko tekst.
/// Wydzielone z <see cref="ObjectEndpoints"/> wzorem <c>AuthResponses</c>:
/// kształt odmowy ma być sprawdzalny bez potoku HTTP.
/// </summary>
internal static class ObjectResponses
{
    /// <summary>
    /// Odmowa usunięcia obiektu <paramref name="code"/>, który stoi
    /// w czyimkolwiek drzewie roboczym — 409 z
    /// <see cref="ApiErrorCodes.ObjectInTree"/>.
    /// </summary>
    /// <remarks>
    /// <c>context</c> jest pusty, a komunikat nie mówi, czyje to drzewo ani
    /// ile w nim wystąpień: słownik jest wspólny, drzewa prywatne, więc odmowa
    /// nie może zdradzać cudzej struktury.
    /// </remarks>
    public static ApiError DescribeTreeUsageRefusal(string code)
        => ApiError.Create(
            ApiErrorCodes.ObjectInTree,
            $"Obiekt „{code}\" jest użyty w strukturze drzewa i nie można go usunąć.");
}

/// <summary>
/// Treść żądania utworzenia i zmiany obiektu. Pola są nullowalne, żeby ich
/// brak dawał błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie
/// frameworka.
/// </summary>
internal sealed record ObjectRequest(string? Code, string? Name);
