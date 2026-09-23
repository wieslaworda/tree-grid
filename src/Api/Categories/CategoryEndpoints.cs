using Api.Data;
using Api.Errors;
using Microsoft.EntityFrameworkCore;

namespace Api.Categories;

/// <summary>
/// Endpointy słownika kategorii: lista, utworzenie, zmiana i usunięcie. Wzorem
/// <c>Api.Objects</c> endpoint wiąże żądanie, czyta i zapisuje w jednej
/// transakcji oraz odwzorowuje wynik reguły na kopertę błędu, a odczyt i zapis
/// funkcji agregującej zapadają w <see cref="CategoryRules"/>.
///
/// Słownik jest wspólny dla wszystkich kont, więc żaden endpoint nie filtruje
/// po właścicielu, a API nie potrzebuje tu tożsamości użytkownika.
/// </summary>
/// <remarks>
/// Każdy zapis i usunięcie otwierają transakcję <b>przed</b> pierwszym
/// odczytem stanu, na którym opierają decyzję — powód jak w
/// <c>ObjectEndpoints</c>: na SQLite <c>BeginTransaction</c> startuje od razu
/// jako transakcja zapisowa, więc drugi równoległy zapis czeka na pierwszy
/// (<c>busy_timeout</c> z <c>Program.cs</c>). Bez tego dwa równoległe żądania
/// z tym samym kodem przeszłyby kontrolę duplikatu osobno, a drugie
/// skończyłoby się wyjątkiem z unikalnego indeksu zamiast komunikatem pod
/// polem. Wyjście z metody bez <c>Commit</c> wycofuje transakcję przy jej
/// zwolnieniu.
///
/// Usunięcie jest zawsze dozwolone: do czasu S-04 nic nie odwołuje się do
/// kategorii. Odmowę i jej kod błędu doda plaster, który wprowadzi odwołania.
/// </remarks>
internal static class CategoryEndpoints
{
    private const string CategoriesPath = "/categories";

    private const string ValidationMessage = "Przesłane dane są nieprawidłowe.";

    public static WebApplication MapCategoryEndpoints(this WebApplication app)
    {
        // Ograniczenie `int` w szablonie: identyfikator, który nie jest liczbą,
        // kończy się 404 z routingu, a nie błędem wiązania w cudzym kształcie.
        app.MapGet(CategoriesPath, ListAsync);
        app.MapPost(CategoriesPath, CreateAsync);
        app.MapPut($"{CategoriesPath}/{{id:int}}", UpdateAsync);
        app.MapDelete($"{CategoriesPath}/{{id:int}}", DeleteAsync);

        return app;
    }

    /// <summary>
    /// Cały słownik posortowany po kodzie znormalizowanym porządkiem
    /// porządkowym — tym samym, którym porównuje go unikalny indeks.
    /// </summary>
    private static async Task<IResult> ListAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        var categories = await db.Categories
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var items = categories
            .OrderBy(category => category.NormalizedCode, StringComparer.Ordinal)
            .Select(CategoryResponse)
            .ToList();

        return Results.Ok(new { items });
    }

    private static async Task<IResult> CreateAsync(
        CategoryRequest? request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var input = ReadInput(request);
        var fields = ValidateFields(input);

        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        await ValidateCodeUniquenessAsync(fields, input, db, editedId: null, cancellationToken);

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        var entity = new Category
        {
            Code = input.Code,
            NormalizedCode = DictionaryCode.Normalize(input.Code),
            Name = input.Name,
            // Walidacja pól przepuszcza wyłącznie odczytaną funkcję.
            AggregateFunction = input.AggregateFunction!.Value,
        };

        db.Categories.Add(entity);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // 201 bez nagłówka `Location`: `/categories/{id}` ma tylko `PUT`
        // i `DELETE`, więc `GET` pod tym adresem dałby 405. Nagłówek wraca
        // razem z plastrem, który doda odczyt pojedynczej kategorii
        // (`context/foundation/lessons.md`, „Kontrakt API nie wyprzedza
        // emitenta").
        return Results.Json(CategoryResponse(entity), statusCode: StatusCodes.Status201Created);
    }

    /// <summary>
    /// Zastępuje kod, nazwę i funkcję agregującą. Brak funkcji w żądaniu jest
    /// błędem walidacji — API nie podstawia ani wartości domyślnej, ani
    /// dotychczasowej.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        int id,
        CategoryRequest? request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var input = ReadInput(request);
        var fields = ValidateFields(input);

        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var entity = await db.Categories.SingleOrDefaultAsync(c => c.Id == id, cancellationToken);

        // Nieistniejący zasób wygrywa z błędami pól: poprawianie formularza
        // kategorii, której nie ma, i tak niczego by nie zapisało.
        if (entity is null)
        {
            return CategoryNotFound(id);
        }

        await ValidateCodeUniquenessAsync(fields, input, db, editedId: id, cancellationToken);

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        entity.Code = input.Code;
        entity.NormalizedCode = DictionaryCode.Normalize(input.Code);
        entity.Name = input.Name;
        entity.AggregateFunction = input.AggregateFunction!.Value;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(CategoryResponse(entity));
    }

    private static async Task<IResult> DeleteAsync(int id, AppDbContext db, CancellationToken cancellationToken)
    {
        // Przed pierwszym odczytem — patrz komentarz klasy. Dziś nic nie
        // odwołuje się do kategorii, ale kontrola odwołań z S-04 ma trafić do
        // transakcji, która już tu stoi, zamiast ją dopiero wprowadzać.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var entity = await db.Categories.SingleOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (entity is null)
        {
            return CategoryNotFound(id);
        }

        db.Categories.Remove(entity);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Odpowiedź o kategorii — ten sam kształt dla elementu listy, utworzenia
    /// i zmiany, więc powstaje w jednym miejscu. Funkcja agregująca jedzie
    /// zapisem kanonicznym, tym samym co w bazie.
    /// </summary>
    private static object CategoryResponse(Category category)
        => new
        {
            id = category.Id,
            code = category.Code,
            name = category.Name,
            aggregateFunction = CategoryRules.FormatAggregateFunction(category.AggregateFunction),
        };

    private static CategoryInput ReadInput(CategoryRequest? request)
    {
        var aggregateFunctionText = request?.AggregateFunction?.Trim() ?? string.Empty;

        return new(
            request?.Code?.Trim() ?? string.Empty,
            request?.Name?.Trim() ?? string.Empty,
            aggregateFunctionText,
            CategoryRules.TryParseAggregateFunction(aggregateFunctionText, out var function) ? function : null);
    }

    /// <summary>
    /// Naruszenia, które widać bez sięgania do bazy: brak i długość kodu oraz
    /// nazwy, brak i wartość funkcji agregującej.
    /// </summary>
    private static Dictionary<string, string> ValidateFields(CategoryInput input)
    {
        var fields = new Dictionary<string, string>();

        if (input.Code.Length == 0)
        {
            fields[CategoryFormFields.Code] = "Podaj kod kategorii.";
        }
        else if (input.Code.Length > Category.CodeMaxLength)
        {
            // Sformułowanie bez odmiany rzeczownika po liczbie — jak
            // w `ObjectEndpoints`: zmiana stałej nie ma psuć komunikatu.
            fields[CategoryFormFields.Code] =
                $"Kod kategorii jest za długi (maksymalna długość: {Category.CodeMaxLength}).";
        }

        if (input.Name.Length == 0)
        {
            fields[CategoryFormFields.Name] = "Podaj nazwę kategorii.";
        }
        else if (input.Name.Length > Category.NameMaxLength)
        {
            fields[CategoryFormFields.Name] =
                $"Nazwa kategorii jest za długa (maksymalna długość: {Category.NameMaxLength}).";
        }

        if (input.AggregateFunctionText.Length == 0)
        {
            fields[CategoryFormFields.AggregateFunction] = "Wybierz funkcję agregującą.";
        }
        else if (input.AggregateFunction is null)
        {
            // Lista w komunikacie powstaje z tego samego zapisu, który
            // przyjmuje odczyt — nowa funkcja nie wymaga zmiany tekstu.
            var allowed = Enum.GetValues<AggregateFunction>().Select(CategoryRules.FormatAggregateFunction);

            fields[CategoryFormFields.AggregateFunction] =
                $"Funkcja agregująca musi być jedną z: {string.Join(", ", allowed)}.";
        }

        return fields;
    }

    /// <summary>
    /// Naruszenie, które wymaga stanu słownika: kod zajęty przez inną
    /// kategorię.
    /// </summary>
    /// <remarks>
    /// Pierwsze naruszenie pola wygrywa: formularz pokazuje pod polem jeden
    /// komunikat, więc kod, który nie przeszedł kontroli formy, nie jest już
    /// sprawdzany pod kątem duplikatu.
    /// </remarks>
    private static async Task ValidateCodeUniquenessAsync(
        Dictionary<string, string> fields,
        CategoryInput input,
        AppDbContext db,
        int? editedId,
        CancellationToken cancellationToken)
    {
        if (fields.ContainsKey(CategoryFormFields.Code))
        {
            return;
        }

        var normalizedCode = DictionaryCode.Normalize(input.Code);

        // Równość w SQLite porównuje tekst binarnie, czyli porządkowo — tak
        // samo jak unikalny indeks. Kategoria edytowana nie koliduje sama ze
        // sobą: zmiana samej wielkości liter własnego kodu jest dozwolona.
        var holderCode = await db.Categories
            .AsNoTracking()
            .Where(c => c.NormalizedCode == normalizedCode && c.Id != editedId)
            .Select(c => c.Code)
            .FirstOrDefaultAsync(cancellationToken);

        if (holderCode is not null)
        {
            fields[CategoryFormFields.Code] = $"Kategoria o kodzie „{holderCode}\" już istnieje.";
        }
    }

    private static IResult CategoryNotFound(int id)
        => Results.Json(
            ApiError.Create(ApiErrorCodes.NotFound, $"Nie znaleziono kategorii o identyfikatorze {id}."),
            statusCode: StatusCodes.Status404NotFound);

    private static IResult ValidationFailure(IReadOnlyDictionary<string, string> fields)
        => Results.Json(
            ApiError.Validation(ValidationMessage, fields),
            statusCode: StatusCodes.Status400BadRequest);

    /// <summary>
    /// Treść żądania po obcięciu spacji. Funkcja agregująca występuje dwa razy:
    /// jako tekst — żeby odróżnić jej brak od wartości spoza listy — i jako
    /// wynik odczytu, <c>null</c> dla tekstu, którego nie da się odczytać.
    /// </summary>
    private readonly record struct CategoryInput(
        string Code,
        string Name,
        string AggregateFunctionText,
        AggregateFunction? AggregateFunction);
}

/// <summary>
/// Nazwy pól w mapie naruszeń (<c>context.fields</c>).
/// </summary>
/// <remarks>
/// Muszą być identyczne z atrybutami <c>name</c> formularza kategorii po
/// stronie React Routera. Zgodność jest utrzymywana ręcznie: nie sprawdza jej
/// ani kompilator, ani <c>npm run typecheck</c>, a rozjazd nie daje żadnego
/// błędu — komunikat po prostu nie pojawia się przy polu, którego dotyczy.
///
/// Bez pola zbiorczego <c>form</c>: żaden endpoint <c>/categories</c> nie
/// emituje naruszenia spoza pól (reguła „Kontrakt API nie wyprzedza
/// emitenta", <c>context/foundation/lessons.md</c>).
/// </remarks>
internal static class CategoryFormFields
{
    public const string Code = "code";

    public const string Name = "name";

    public const string AggregateFunction = "aggregateFunction";
}

/// <summary>
/// Treść żądania utworzenia i zmiany kategorii. Pola są nullowalne, żeby ich
/// brak dawał błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie
/// frameworka. Funkcja agregująca jest tekstem, a nie enumem, z tego samego
/// powodu: nieznana nazwa ma dać komunikat pod polem, a nie 400 z wiązania.
/// </summary>
internal sealed record CategoryRequest(string? Code, string? Name, string? AggregateFunction);
