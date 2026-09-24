using Api.Data;
using Api.Errors;
using Api.Tree;
using Microsoft.EntityFrameworkCore;

namespace Api.Screens;

/// <summary>
/// Endpointy nazwanych ekranów użytkownika (S-06): lista własnych ekranów,
/// utworzenie, odczyt z węzłami drzewa i przypisaniami kategorii, zmiana
/// nagłówka (nazwa, ziarno, lista domyślna), zmiana kategorii jednego węzła
/// (S-04) oraz usunięcie. Wzorem <c>Api.Tree</c> endpoint wiąże żądanie, czyta i zapisuje
/// w jednej transakcji oraz odwzorowuje werdykt reguły
/// (<see cref="ScreenRules"/>) na kopertę błędu.
///
/// Ekran ma właściciela tak jak drzewo. Każdy endpoint najpierw rozstrzyga
/// tożsamość z nagłówka (<see cref="TreeIdentity"/> — tam też model zaufania),
/// a potem szuka ekranu z adresu po identyfikatorze <b>i</b> właścicielu.
/// Cudzy ekran jest dla API nieistniejący i daje 404, nie 403. Węzły czyta się
/// wyłącznie przez drzewo ekranu, który przeszedł ten filtr, a drzewo ekranu
/// jest zawsze drzewem tego samego konta — pilnuje tego tworzenie.
/// </summary>
/// <remarks>
/// Każdy zapis otwiera transakcję <b>przed</b> pierwszym odczytem, także przed
/// odczytem tożsamości — powód jak w <see cref="TreeEndpoints"/>: na SQLite
/// <c>BeginTransaction</c> startuje jako transakcja zapisowa, więc dwa
/// równoległe utworzenia ekranu o tej samej nazwie nie przejdą kontroli
/// duplikatu osobno, a drugie nie skończy się wyjątkiem z unikalnego indeksu
/// zamiast odpowiedzią w kontrakcie. Wyjście bez <c>Commit</c> (odmowa,
/// wyjątek) wycofuje transakcję przy jej zwolnieniu.
///
/// Kolejność kontroli przy tworzeniu jest częścią kontraktu: tożsamość →
/// nazwa → ziarno → lista domyślna → drzewo → istnienie kategorii →
/// unikalność nazwy. Naruszenia pól zbiera jedna mapa, a każde pole dostaje
/// co najwyżej jeden komunikat — pierwszy w tej kolejności. Zmiana nagłówka
/// idzie tą samą ścieżką bez drzewa, a nieistniejący ekran wygrywa z błędami
/// pól (jak <c>PUT /trees/{id}</c>).
/// </remarks>
internal static class ScreenEndpoints
{
    private const string ScreensPath = "/screens";

    private const string ValidationMessage = "Przesłane dane są nieprawidłowe.";

    /// <summary>
    /// Jeden komunikat na brak drzewa w żądaniu, drzewo nieistniejące i drzewo
    /// innego konta — rozróżnienie pozwalałoby sprawdzać istnienie cudzych
    /// drzew.
    /// </summary>
    private const string TreeNotOwnedMessage = "Wybierz jedno z własnych drzew.";

    private const string UnknownCategoryMessage = "Wybrana kategoria nie istnieje w słowniku.";

    public static WebApplication MapScreenEndpoints(this WebApplication app)
    {
        // Ograniczenie `int` w szablonie: identyfikator, który nie jest liczbą,
        // kończy się 404 z routingu, a nie błędem wiązania w cudzym kształcie.
        app.MapGet(ScreensPath, ListScreensAsync);
        app.MapPost(ScreensPath, CreateScreenAsync);
        app.MapGet($"{ScreensPath}/{{id:int}}", GetScreenAsync);
        app.MapPut($"{ScreensPath}/{{id:int}}", UpdateScreenAsync);
        app.MapDelete($"{ScreensPath}/{{id:int}}", DeleteScreenAsync);
        app.MapPut($"{ScreensPath}/{{id:int}}/nodes/{{nodeId:int}}/categories", SetNodeCategoriesAsync);

        return app;
    }

    /// <summary>
    /// Ekrany użytkownika z nazwą wskazanego drzewa, posortowane po nazwie
    /// znormalizowanej porządkiem porządkowym (tym samym, którym porównuje ją
    /// unikalny indeks), a przy równej — po identyfikatorze. Konto bez ekranów
    /// dostaje pustą listę.
    /// </summary>
    /// <remarks>
    /// Bez transakcji — jak <c>GET /trees</c>: lista to jedno zapytanie.
    /// </remarks>
    private static async Task<IResult> ListScreensAsync(
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        var screens = await db.Screens
            .AsNoTracking()
            .Where(screen => screen.UserId == userId)
            .Select(screen => new ScreenHeader(
                screen.Id,
                screen.Name,
                screen.NormalizedName,
                screen.TreeId,
                screen.Tree.Name,
                screen.GrainMinutes))
            .ToListAsync(cancellationToken);

        var items = screens
            .OrderBy(screen => screen.NormalizedName, StringComparer.Ordinal)
            .ThenBy(screen => screen.Id)
            .Select(screen => new
            {
                id = screen.Id,
                name = screen.Name,
                treeId = screen.TreeId,
                treeName = screen.TreeName,
                grainMinutes = screen.GrainMinutes,
            })
            .ToList();

        return Results.Ok(new { items });
    }

    /// <summary>
    /// Zakłada ekran na własnym drzewie: zapisuje listę kategorii domyślnych
    /// w podanej kolejności i przypisuje ją każdemu bieżącemu węzłowi drzewa
    /// (<see cref="ScreenRules.Materialize"/>) — wszystko jednym
    /// <c>SaveChanges</c>.
    /// </summary>
    private static async Task<IResult> CreateScreenAsync(
        ScreenRequest? request,
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        // Brak pola to pusta lista — ta sama odmowa co `[]`.
        IReadOnlyList<int> defaultCategoryIds = request?.DefaultCategoryIds ?? [];

        var fields = await ValidateHeaderAsync(
            db,
            userId,
            request?.Name,
            request?.GrainMinutes,
            defaultCategoryIds,
            editedId: null,
            cancellationToken);

        var treeId = request?.TreeId;

        if (treeId is null || !await IsOwnedTreeAsync(db, treeId.Value, userId, cancellationToken))
        {
            fields[ScreenRequestFields.TreeId] = TreeNotOwnedMessage;
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        // Wszystkie bieżące węzły drzewa, które przeszło kontrolę właściciela
        // wyżej. Ta sama transakcja, więc węzeł dodany równolegle nie wciśnie
        // się między ten odczyt a zapis.
        var nodeIds = await db.TreeNodes
            .AsNoTracking()
            .Where(node => node.TreeId == treeId!.Value)
            .Select(node => node.Id)
            .ToListAsync(cancellationToken);

        // Walidacja wyżej przepuszcza wyłącznie komplet pól; nazwa do zapisu
        // to nazwa po obcięciu spacji, tak jak w `ScreenRules.TryValidateName`.
        var name = request!.Name!.Trim();
        var screen = new Screen
        {
            UserId = userId,
            TreeId = treeId!.Value,
            Name = name,
            NormalizedName = ScreenRules.Normalize(name),
            GrainMinutes = request.GrainMinutes!.Value,
            DefaultCategories =
            [
                .. defaultCategoryIds.Select((categoryId, position) => new ScreenDefaultCategory
                {
                    CategoryId = categoryId,
                    Position = position,
                }),
            ],
            NodeCategories =
            [
                .. ScreenRules.Materialize(nodeIds, defaultCategoryIds).Select(assignment => new ScreenNodeCategory
                {
                    TreeNodeId = assignment.NodeId,
                    CategoryId = assignment.CategoryId,
                    Position = assignment.Position,
                }),
            ],
        };

        db.Screens.Add(screen);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // 201 bez nagłówka `Location` — kontrakt tego plastra go nie obiecuje
        // (`context/foundation/lessons.md`, „Kontrakt API nie wyprzedza
        // emitenta").
        return Results.Json(new { id = screen.Id }, statusCode: StatusCodes.Status201Created);
    }

    /// <summary>
    /// Zapisany ekran: nagłówek, lista kategorii domyślnych w kolejności,
    /// węzły wskazanego drzewa w kształcie <c>GET /trees/{treeId}/nodes</c>
    /// oraz przypisania kategorii per węzeł, każde w kolejności. Węzeł bez
    /// przypisań nie pojawia się w <c>assignments</c> — to węzeł z zerem
    /// kategorii.
    /// </summary>
    /// <remarks>
    /// Bez transakcji — jak <c>GET /trees/{treeId}/nodes</c>: transakcja
    /// zapisowa ustawiałaby każdy odczyt w kolejce za zapisami. Węzły są
    /// czytane przed przypisaniami, a przypisania wypisywane wyłącznie dla
    /// węzłów z tego odczytu, więc zapis między zapytaniami daje co najwyżej
    /// węzeł chwilowo bez kategorii, a nigdy przypisanie bez węzła.
    /// </remarks>
    private static async Task<IResult> GetScreenAsync(
        int id,
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
            .Select(s => new ScreenHeader(s.Id, s.Name, s.NormalizedName, s.TreeId, s.Tree.Name, s.GrainMinutes))
            .SingleOrDefaultAsync(cancellationToken);

        if (screen is null)
        {
            return ScreenNotFound(id);
        }

        // `Position` jest kluczem porządku, nie indeksem — luki po kaskadowym
        // zdjęciu kategorii nie przeszkadzają. Identyfikator rozstrzyga remis,
        // żeby kolejność była deterministyczna.
        var defaultCategoryIds = await db.ScreenDefaultCategories
            .AsNoTracking()
            .Where(entry => entry.ScreenId == id)
            .OrderBy(entry => entry.Position)
            .ThenBy(entry => entry.CategoryId)
            .Select(entry => entry.CategoryId)
            .ToListAsync(cancellationToken);

        // Ten sam porządek co `GET /trees/{treeId}/nodes`: najpierw najwyższy
        // poziom, potem po rodzicu i pozycji.
        var nodes = (await db.TreeNodes
                .AsNoTracking()
                .Where(node => node.TreeId == screen.TreeId)
                .Select(node => new { node.Id, node.ParentId, node.ObjectId, node.Position })
                .ToListAsync(cancellationToken))
            .OrderBy(node => node.ParentId.HasValue)
            .ThenBy(node => node.ParentId)
            .ThenBy(node => node.Position)
            .ThenBy(node => node.Id)
            .ToList();

        var categoriesByNode = (await db.ScreenNodeCategories
                .AsNoTracking()
                .Where(assignment => assignment.ScreenId == id)
                .Select(assignment => new { assignment.TreeNodeId, assignment.CategoryId, assignment.Position })
                .ToListAsync(cancellationToken))
            .GroupBy(assignment => assignment.TreeNodeId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderBy(assignment => assignment.Position)
                    .ThenBy(assignment => assignment.CategoryId)
                    .Select(assignment => assignment.CategoryId)
                    .ToList());

        var assignments = nodes
            .Where(node => categoriesByNode.ContainsKey(node.Id))
            .Select(node => new { nodeId = node.Id, categoryIds = categoriesByNode[node.Id] })
            .ToList();

        return Results.Ok(new
        {
            id = screen.Id,
            name = screen.Name,
            treeId = screen.TreeId,
            treeName = screen.TreeName,
            grainMinutes = screen.GrainMinutes,
            defaultCategoryIds,
            nodes = nodes.Select(node => new
            {
                id = node.Id,
                parentId = node.ParentId,
                objectId = node.ObjectId,
                position = node.Position,
            }),
            assignments,
        });
    }

    /// <summary>
    /// Zmienia nagłówek własnego ekranu: nazwę, ziarno i listę kategorii
    /// domyślnych. Drzewo ekranu się nie zmienia (FR-011), więc żądanie go nie
    /// niesie. Ta sama nazwa — także w innej wielkości liter — nie jest
    /// duplikatem: ekran nie koliduje sam ze sobą.
    /// </summary>
    /// <remarks>
    /// Zmieniona lista domyślna nadpisuje przypisania <b>wszystkich</b>
    /// bieżących węzłów drzewa (rozstrzygnięcie PRD <c>## Open Questions</c> #3
    /// z 2026-09-24) — grid wygląda wtedy tak samo jak podgląd nowego ekranu.
    /// Niezmieniona lista (<see cref="ScreenRules.DefaultsChanged"/>) zostawia
    /// przypisania nietknięte, więc zmiana samej nazwy albo ziarna nie skasuje
    /// kategorii dopasowanych pojedynczym węzłom (<c>S-04</c>). Stare wpisy
    /// znikają <c>ExecuteDelete</c> w tej samej transakcji, a nowe zapisuje
    /// jeden <c>SaveChanges</c> razem z nagłówkiem.
    /// </remarks>
    private static async Task<IResult> UpdateScreenAsync(
        int id,
        ScreenUpdateRequest? request,
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        // Śledzony, bo zmienia się nagłówek. Nieistniejący ekran wygrywa
        // z błędem pola — patrz komentarz klasy.
        var screen = await db.Screens
            .SingleOrDefaultAsync(s => s.Id == id && s.UserId == userId, cancellationToken);

        if (screen is null)
        {
            return ScreenNotFound(id);
        }

        // Brak pola to pusta lista — ta sama odmowa co `[]`.
        IReadOnlyList<int> defaultCategoryIds = request?.DefaultCategoryIds ?? [];

        var fields = await ValidateHeaderAsync(
            db,
            userId,
            request?.Name,
            request?.GrainMinutes,
            defaultCategoryIds,
            editedId: id,
            cancellationToken);

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        // Walidacja wyżej przepuszcza wyłącznie komplet pól.
        var name = request!.Name!.Trim();

        screen.Name = name;
        screen.NormalizedName = ScreenRules.Normalize(name);
        screen.GrainMinutes = request.GrainMinutes!.Value;

        // Ten sam porządek co w `GET /screens/{id}`.
        var currentDefaults = await db.ScreenDefaultCategories
            .AsNoTracking()
            .Where(entry => entry.ScreenId == id)
            .OrderBy(entry => entry.Position)
            .ThenBy(entry => entry.CategoryId)
            .Select(entry => entry.CategoryId)
            .ToListAsync(cancellationToken);

        if (ScreenRules.DefaultsChanged(currentDefaults, defaultCategoryIds))
        {
            await db.ScreenNodeCategories
                .Where(assignment => assignment.ScreenId == id)
                .ExecuteDeleteAsync(cancellationToken);
            await db.ScreenDefaultCategories
                .Where(entry => entry.ScreenId == id)
                .ExecuteDeleteAsync(cancellationToken);

            // Bieżące węzły drzewa ekranu — ta sama transakcja, więc węzeł
            // dodany równolegle nie wciśnie się między ten odczyt a zapis.
            var nodeIds = await db.TreeNodes
                .AsNoTracking()
                .Where(node => node.TreeId == screen.TreeId)
                .Select(node => node.Id)
                .ToListAsync(cancellationToken);

            db.ScreenDefaultCategories.AddRange(
                defaultCategoryIds.Select((categoryId, position) => new ScreenDefaultCategory
                {
                    ScreenId = id,
                    CategoryId = categoryId,
                    Position = position,
                }));
            db.ScreenNodeCategories.AddRange(
                ScreenRules.Materialize(nodeIds, defaultCategoryIds).Select(assignment => new ScreenNodeCategory
                {
                    ScreenId = id,
                    TreeNodeId = assignment.NodeId,
                    CategoryId = assignment.CategoryId,
                    Position = assignment.Position,
                }));
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new { id });
    }

    /// <summary>
    /// Usuwa ekran. Listy domyślnej i przypisań endpoint nie wczytuje — usuwa
    /// je kaskada klucza obcego <c>ScreenId</c> w schemacie
    /// (<see cref="AppDbContext"/>). Drzewo zostaje nietknięte.
    /// </summary>
    private static async Task<IResult> DeleteScreenAsync(
        int id,
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        var screen = await db.Screens
            .SingleOrDefaultAsync(s => s.Id == id && s.UserId == userId, cancellationToken);

        if (screen is null)
        {
            return ScreenNotFound(id);
        }

        db.Screens.Remove(screen);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Zastępuje kategorie jednego węzła własnego ekranu (<c>S-04</c>, US-02)
    /// listą z żądania, w jej kolejności. Dotyczy wyłącznie wskazanego węzła
    /// tego ekranu: inne wystąpienia tego samego obiektu w drzewie i ten sam
    /// węzeł w innym ekranie zachowują swoje przypisania. Lista domyślna ekranu
    /// się nie zmienia.
    /// </summary>
    /// <remarks>
    /// Kolejność kontroli: tożsamość → ekran konta → węzeł drzewa ekranu →
    /// forma listy (<see cref="ScreenRules.TryValidateNodeCategories"/>: co
    /// najmniej jedna, bez powtórzeń) → istnienie kategorii. Nieistniejący
    /// ekran i węzeł spoza drzewa ekranu dają 404 i wygrywają z błędem pola.
    /// Węzeł szukany jest wyłącznie w drzewie ekranu, który przeszedł filtr
    /// właściciela, więc węzeł cudzego drzewa to ten sam 404.
    ///
    /// Stare wpisy węzła znikają <c>ExecuteDelete</c>, a nowe zapisuje jeden
    /// <c>SaveChanges</c> — oba w transakcji otwartej przed pierwszym
    /// odczytem, więc równoległe usunięcie węzła nie zostawi przypisania bez
    /// węzła (klucz obcy i tak by go odrzucił, ale wyjątkiem, nie kopertą).
    /// </remarks>
    private static async Task<IResult> SetNodeCategoriesAsync(
        int id,
        int nodeId,
        ScreenNodeCategoriesRequest? request,
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        // Przed pierwszym odczytem — patrz komentarz klasy.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        var treeId = await db.Screens
            .AsNoTracking()
            .Where(s => s.Id == id && s.UserId == userId)
            .Select(s => (int?)s.TreeId)
            .SingleOrDefaultAsync(cancellationToken);

        if (treeId is null)
        {
            return ScreenNotFound(id);
        }

        var nodeInTree = await db.TreeNodes
            .AsNoTracking()
            .AnyAsync(node => node.Id == nodeId && node.TreeId == treeId.Value, cancellationToken);

        if (!nodeInTree)
        {
            return NodeNotFound(nodeId);
        }

        // Brak pola to pusta lista — ta sama odmowa co `[]`.
        IReadOnlyList<int> categoryIds = request?.CategoryIds ?? [];
        var fields = new Dictionary<string, string>();

        if (!ScreenRules.TryValidateNodeCategories(categoryIds, out var categoriesMessage))
        {
            fields[ScreenRequestFields.CategoryIds] = categoriesMessage;
        }
        else if (!await AllCategoriesExistAsync(db, categoryIds, cancellationToken))
        {
            fields[ScreenRequestFields.CategoryIds] = UnknownCategoryMessage;
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        await db.ScreenNodeCategories
            .Where(assignment => assignment.ScreenId == id && assignment.TreeNodeId == nodeId)
            .ExecuteDeleteAsync(cancellationToken);

        db.ScreenNodeCategories.AddRange(
            ScreenRules.Materialize([nodeId], categoryIds).Select(assignment => new ScreenNodeCategory
            {
                ScreenId = id,
                TreeNodeId = assignment.NodeId,
                CategoryId = assignment.CategoryId,
                Position = assignment.Position,
            }));

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Kontrola pól wspólnych dla utworzenia i zmiany ekranu, w kolejności
    /// z komentarza klasy: nazwa → ziarno → lista domyślna → istnienie
    /// kategorii → unikalność nazwy. Zwraca mapę naruszeń (pustą, gdy wszystko
    /// przeszło) — utworzenie dopisuje do niej jeszcze drzewo, ale pod własnym
    /// kluczem, więc żadne pole nie zmienia przez to komunikatu.
    /// <paramref name="editedId"/> wyłącza zmieniany ekran z kontroli
    /// duplikatu nazwy.
    /// </summary>
    private static async Task<Dictionary<string, string>> ValidateHeaderAsync(
        AppDbContext db,
        string userId,
        string? requestedName,
        int? requestedGrain,
        IReadOnlyList<int> defaultCategoryIds,
        int? editedId,
        CancellationToken cancellationToken)
    {
        var fields = new Dictionary<string, string>();

        if (!ScreenRules.TryValidateName(requestedName, out var name, out var nameMessage))
        {
            fields[ScreenRequestFields.Name] = nameMessage;
        }

        if (requestedGrain is not { } grainMinutes)
        {
            fields[ScreenRequestFields.GrainMinutes] = ScreenRules.InvalidGrainMessage;
        }
        else if (!ScreenRules.TryValidateGrain(grainMinutes, out var grainMessage))
        {
            fields[ScreenRequestFields.GrainMinutes] = grainMessage;
        }

        if (!ScreenRules.TryValidateDefaultCategories(defaultCategoryIds, out var categoriesMessage))
        {
            fields[ScreenRequestFields.DefaultCategoryIds] = categoriesMessage;
        }

        // Istnienie w słowniku sprawdza się tylko na liście, która przeszła
        // kontrolę formy — pod polem stoi jeden komunikat. Słownik jest
        // wspólny, więc filtra po właścicielu tu nie ma.
        if (!fields.ContainsKey(ScreenRequestFields.DefaultCategoryIds)
            && !await AllCategoriesExistAsync(db, defaultCategoryIds, cancellationToken))
        {
            fields[ScreenRequestFields.DefaultCategoryIds] = UnknownCategoryMessage;
        }

        // Nazwa, która nie przeszła kontroli formy, nie jest już sprawdzana pod
        // kątem duplikatu.
        if (!fields.ContainsKey(ScreenRequestFields.Name)
            && await FindNameHolderAsync(db, userId, name, editedId, cancellationToken) is { } holder)
        {
            fields[ScreenRequestFields.Name] = $"Ekran o nazwie „{holder}” już istnieje.";
        }

        return fields;
    }

    /// <summary>
    /// Czy drzewo <paramref name="treeId"/> należy do konta
    /// <paramref name="userId"/>. Cudze drzewo i drzewo, którego nie ma, dają
    /// ten sam <c>false</c>.
    /// </summary>
    private static async Task<bool> IsOwnedTreeAsync(
        AppDbContext db,
        int treeId,
        string userId,
        CancellationToken cancellationToken)
        => await db.Trees
            .AsNoTracking()
            .AnyAsync(tree => tree.Id == treeId && tree.UserId == userId, cancellationToken);

    /// <summary>
    /// Czy każda kategoria z listy (już bez powtórzeń) istnieje w słowniku.
    /// </summary>
    private static async Task<bool> AllCategoriesExistAsync(
        AppDbContext db,
        IReadOnlyList<int> categoryIds,
        CancellationToken cancellationToken)
    {
        var known = await db.Categories
            .AsNoTracking()
            .Where(category => categoryIds.Contains(category.Id))
            .CountAsync(cancellationToken);

        return known == categoryIds.Count;
    }

    /// <summary>
    /// Nazwa ekranu tego samego konta, który zajmuje nazwę
    /// <paramref name="name"/> po normalizacji, albo <c>null</c>. Równość
    /// w SQLite porównuje tekst binarnie, czyli porządkowo — tak samo jak
    /// unikalny indeks. Ekrany innych kont nie wchodzą do porównania, a ekran
    /// <paramref name="editedId"/> (zmieniany) — też nie.
    /// </summary>
    private static async Task<string?> FindNameHolderAsync(
        AppDbContext db,
        string userId,
        string name,
        int? editedId,
        CancellationToken cancellationToken)
    {
        var normalizedName = ScreenRules.Normalize(name);

        return await db.Screens
            .AsNoTracking()
            .Where(screen => screen.UserId == userId
                && screen.NormalizedName == normalizedName
                && screen.Id != editedId)
            .Select(screen => screen.Name)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static IResult ScreenNotFound(int id)
        => Results.Json(
            ApiError.Create(ApiErrorCodes.NotFound, $"Nie znaleziono ekranu o identyfikatorze {id}."),
            statusCode: StatusCodes.Status404NotFound);

    /// <summary>
    /// Węzeł, którego nie ma w drzewie ekranu — ten sam komunikat co
    /// <c>NodeNotFound</c> w <see cref="TreeEndpoints"/>, bo dla użytkownika to
    /// ta sama sytuacja (węzeł usunięty np. w drugiej karcie).
    /// </summary>
    private static IResult NodeNotFound(int nodeId)
        => Results.Json(
            ApiError.Create(ApiErrorCodes.NotFound, $"Nie znaleziono węzła drzewa o identyfikatorze {nodeId}."),
            statusCode: StatusCodes.Status404NotFound);

    private static IResult ValidationFailure(IReadOnlyDictionary<string, string> fields)
        => Results.Json(
            ApiError.Validation(ValidationMessage, fields),
            statusCode: StatusCodes.Status400BadRequest);

    private sealed record ScreenHeader(
        int Id,
        string Name,
        string NormalizedName,
        int TreeId,
        string TreeName,
        int GrainMinutes);
}

/// <summary>
/// Nazwy pól w mapie naruszeń (<c>context.fields</c>) — te same co pola ciała
/// żądań <c>POST /screens</c>, <c>PUT /screens/{id}</c>
/// i <c>PUT /screens/{id}/nodes/{nodeId}/categories</c>.
/// </summary>
/// <remarks>
/// Muszą być identyczne z nazwami, pod którymi formularz nowego ekranu po
/// stronie React Routera wysyła pola i czyta naruszenia. Zgodność jest
/// utrzymywana ręcznie: nie sprawdza jej ani kompilator, ani
/// <c>npm run typecheck</c>, a rozjazd nie daje żadnego błędu — komunikat po
/// prostu nie trafia tam, gdzie powinien.
/// </remarks>
internal static class ScreenRequestFields
{
    /// <summary>Nazwa ekranu: brak, pusta, za długa albo zajęta przez inny ekran tego samego konta.</summary>
    public const string Name = "name";

    /// <summary>Wskazane drzewo: brak pola, drzewo nieistniejące albo drzewo innego konta.</summary>
    public const string TreeId = "treeId";

    /// <summary>Ziarno czasowe: brak pola albo wartość spoza 5 / 15 / 60.</summary>
    public const string GrainMinutes = "grainMinutes";

    /// <summary>
    /// Lista kategorii domyślnych: brak pola, lista pusta, powtórzona kategoria
    /// albo kategoria, której nie ma w słowniku.
    /// </summary>
    public const string DefaultCategoryIds = "defaultCategoryIds";

    /// <summary>
    /// Kategorie jednego węzła (<c>PUT /screens/{id}/nodes/{nodeId}/categories</c>):
    /// brak pola, lista pusta, powtórzona kategoria albo kategoria, której nie
    /// ma w słowniku.
    /// </summary>
    public const string CategoryIds = "categoryIds";
}

/// <summary>
/// Treść żądania utworzenia ekranu. Pola są nullowalne, żeby ich brak dawał
/// błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie frameworka.
/// Kolejność <c>DefaultCategoryIds</c> jest kolejnością kategorii na ekranie.
/// </summary>
internal sealed record ScreenRequest(string? Name, int? TreeId, int? GrainMinutes, int[]? DefaultCategoryIds);

/// <summary>
/// Treść żądania zmiany nagłówka ekranu (<c>PUT /screens/{id}</c>) — bez
/// drzewa, bo drzewo ekranu ustala się przy tworzeniu. Pola nullowalne z tego
/// samego powodu co w <see cref="ScreenRequest"/>.
/// </summary>
internal sealed record ScreenUpdateRequest(string? Name, int? GrainMinutes, int[]? DefaultCategoryIds);

/// <summary>
/// Treść żądania zmiany kategorii jednego węzła ekranu — pełna lista w
/// kolejności wierszy węzła, nie przyrost. Pole nullowalne z tego samego
/// powodu co w <see cref="ScreenRequest"/>.
/// </summary>
internal sealed record ScreenNodeCategoriesRequest(int[]? CategoryIds);
