using Api.Data;
using Api.Errors;
using Microsoft.EntityFrameworkCore;

namespace Api.Tree;

/// <summary>
/// Endpointy drzewa roboczego (S-03): odczyt drzewa i trzy polecenia na
/// węzłach — dodanie, przeniesienie, usunięcie. Wzorem <c>Api.Objects</c>
/// endpoint wiąże żądanie, czyta i zapisuje w jednej transakcji oraz
/// odwzorowuje werdykt reguły (<see cref="TreeRules"/>) na kopertę błędu.
///
/// W odróżnieniu od słowników drzewo ma właściciela. Każdy endpoint najpierw
/// rozstrzyga tożsamość z nagłówka (<see cref="TreeIdentity"/> — tam też model
/// zaufania), a każde zapytanie o węzły filtruje po <c>UserId</c>: węzeł
/// cudzego drzewa jest dla API nieistniejący i daje 404, nie 403 — odpowiedź
/// nie potwierdza, że taki węzeł w ogóle jest.
/// </summary>
/// <remarks>
/// Każde polecenie otwiera transakcję <b>przed</b> pierwszym odczytem —
/// także przed odczytem tożsamości — i zatwierdza ją dopiero po
/// <c>SaveChanges</c>. Na SQLite <c>BeginTransaction</c> startuje od razu jako
/// transakcja zapisowa (<c>BEGIN IMMEDIATE</c>), więc drugie równoległe
/// polecenie tego samego użytkownika (np. z drugiej karty) czeka na pierwsze
/// (<c>busy_timeout</c> z <c>Program.cs</c>), zamiast czytać ten sam stan
/// drzewa. Bez tego dwa dodania przeszłyby kontrolę duplikatu albo zapętlenia
/// osobno i razem zapisały dokładnie stan, którego reguły zabraniają. Wyjście
/// bez <c>Commit</c> (odmowa, wyjątek) wycofuje transakcję przy jej zwolnieniu.
///
/// Każde polecenie wczytuje całe drzewo użytkownika: limit
/// <see cref="TreeNode.MaxNodesPerTree"/> trzyma je w rozmiarze, przy którym
/// reguły w pamięci kosztują pojedyncze milisekundy, a pozycje rodzeństwa da
/// się przenumerować bez osobnych zapytań.
///
/// Kolejność kontroli jest częścią kontraktu: tożsamość → wejście → duplikat
/// rodzeństwa → zapętlenie → rozmiar. Klient pokazuje jeden komunikat, więc
/// przy kilku naruszeniach wygrywa pierwsze w tej kolejności.
/// </remarks>
internal static class TreeEndpoints
{
    private const string TreePath = "/tree";

    private const string NodesPath = "/tree/nodes";

    private const string ValidationMessage = "Przesłane dane są nieprawidłowe.";

    public static WebApplication MapTreeEndpoints(this WebApplication app)
    {
        // Ograniczenie `int` w szablonie: identyfikator, który nie jest liczbą,
        // kończy się 404 z routingu, a nie błędem wiązania w cudzym kształcie.
        app.MapGet(TreePath, GetTreeAsync);
        app.MapPost(NodesPath, AddNodeAsync);
        app.MapPut($"{NodesPath}/{{id:int}}", MoveNodeAsync);
        app.MapDelete($"{NodesPath}/{{id:int}}", DeleteNodeAsync);

        return app;
    }

    /// <summary>
    /// Całe drzewo użytkownika jako płaska lista, posortowana po rodzicu
    /// (najpierw najwyższy poziom) i pozycji. Świeże konto dostaje pustą listę.
    /// </summary>
    /// <remarks>
    /// Bez transakcji — jak <c>GET /objects</c>: węzły to jedno zapytanie,
    /// a transakcja zapisowa ustawiałaby każdy odczyt w kolejce za zapisami.
    /// Tożsamość czytana osobno jest bezpieczna, bo kont się nie usuwa.
    /// </remarks>
    private static async Task<IResult> GetTreeAsync(
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        var entries = await LoadEntriesAsync(db.TreeNodes.AsNoTracking(), userId, cancellationToken);

        var nodes = entries
            .OrderBy(node => node.ParentId.HasValue)
            .ThenBy(node => node.ParentId)
            .ThenBy(node => node.Position)
            .ThenBy(node => node.Id)
            .Select(node => new
            {
                id = node.Id,
                parentId = node.ParentId,
                objectId = node.ObjectId,
                position = node.Position,
            })
            .ToList();

        return Results.Ok(new { nodes });
    }

    /// <summary>
    /// Dodaje obiekt — sam albo z całą gałęzią ze słownika — na koniec dzieci
    /// <c>parentId</c> (<c>null</c> — najwyższy poziom). Gałąź jest kopią
    /// struktury słownika z tej chwili.
    /// </summary>
    private static async Task<IResult> AddNodeAsync(
        AddTreeNodeRequest? request,
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

        var fields = new Dictionary<string, string>();
        var objectId = request?.ObjectId;
        var parentId = request?.ParentId;
        var includeBranch = request?.IncludeBranch;

        if (objectId is null)
        {
            fields[TreeRequestFields.ObjectId] = "Wskaż obiekt do dodania.";
        }

        // Brak flagi jest błędem, a nie domyślnym „tylko obiekt": FR-005 każe
        // o zakres pytać, więc API nie zgaduje odpowiedzi za użytkownika.
        if (includeBranch is null)
        {
            fields[TreeRequestFields.IncludeBranch] = "Określ, czy dołączyć gałąź podrzędną obiektu.";
        }

        var catalog = await LoadCatalogAsync(db, cancellationToken);

        if (objectId is { } requestedObjectId && !catalog.ContainsKey(requestedObjectId))
        {
            fields[TreeRequestFields.ObjectId] =
                $"Obiekt o identyfikatorze {requestedObjectId} nie istnieje w słowniku.";
        }

        var tree = new TreeSnapshot(
            await LoadEntriesAsync(db.TreeNodes.AsNoTracking(), userId, cancellationToken));

        if (parentId is { } requestedParentId && !tree.Contains(requestedParentId))
        {
            fields[TreeRequestFields.ParentId] = ParentNotInTreeMessage(requestedParentId);
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        // Walidacja wyżej przepuszcza wyłącznie komplet pól.
        var addedObjectId = objectId!.Value;
        var withBranch = includeBranch!.Value;

        if (TreeRules.HasDuplicateSibling(tree.ChildrenOf(parentId), addedObjectId, exceptNodeId: null))
        {
            return Conflict(TreeResponses.DuplicateSibling(
                catalog[addedObjectId].Code,
                ParentCode(tree, catalog, parentId)));
        }

        // Relacje słownika są potrzebne tylko do gałęzi — „tylko obiekt" ich
        // nie czyta.
        var catalogChildren = withBranch
            ? TreeRules.CatalogChildrenInCodeOrder(
                await LoadLinksAsync(db, cancellationToken),
                catalog.ToDictionary(pair => pair.Key, pair => pair.Value.NormalizedCode))
            : new Dictionary<int, IReadOnlyList<int>>();

        if (TreeRules.FindConflictOnAdd(
                tree.AncestorObjectPath(parentId),
                addedObjectId,
                withBranch,
                catalogChildren) is { } conflict)
        {
            return Conflict(TreeResponses.Cycle(
                TreeOperation.Add,
                catalog[addedObjectId].Code,
                Codes(conflict, catalog)));
        }

        var expansion = TreeRules.ExpandBranch(
            addedObjectId,
            withBranch,
            catalogChildren,
            budget: TreeNode.MaxNodesPerTree - tree.Count);

        if (expansion.IsTooLarge)
        {
            return Conflict(TreeResponses.TooLarge(TreeNode.MaxNodesPerTree, tree.Count, expansion.NodeCount));
        }

        // Nowy węzeł staje na końcu grupy rodzeństwa, której pozycje są ciągłe
        // od 0 — liczba rodzeństwa jest więc jego pozycją.
        var root = ToEntities(expansion.Branch!, userId, parentId, tree.ChildrenOf(parentId).Count);

        db.TreeNodes.Add(root);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // 201 bez nagłówka `Location`: pod `/tree/nodes/{id}` są tylko `PUT`
        // i `DELETE`, więc `GET` dałby 405 (`context/foundation/lessons.md`,
        // „Kontrakt API nie wyprzedza emitenta").
        return Results.Json(new { id = root.Id }, statusCode: StatusCodes.Status201Created);
    }

    /// <summary>
    /// Przenosi węzeł z całym poddrzewem pod <c>parentId</c> (<c>null</c> —
    /// najwyższy poziom), na indeks <c>position</c> w docelowej grupie
    /// rodzeństwa liczony <b>po</b> zdjęciu przenoszonego węzła
    /// (0…liczba rodzeństwa). Ten sam rodzic to zmiana kolejności.
    /// </summary>
    private static async Task<IResult> MoveNodeAsync(
        int id,
        MoveTreeNodeRequest? request,
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

        // Śledzone, bo przeniesienie zmienia rodzica i pozycje.
        var entities = (await db.TreeNodes
                .Where(node => node.UserId == userId)
                .ToListAsync(cancellationToken))
            .ToDictionary(node => node.Id);

        // Nieistniejący zasób wygrywa z błędami pól — jak w `ObjectEndpoints`.
        if (!entities.TryGetValue(id, out var moved))
        {
            return NodeNotFound(id);
        }

        var tree = new TreeSnapshot(entities.Values.Select(ToEntry));
        var fields = new Dictionary<string, string>();
        var parentId = request?.ParentId;
        var position = request?.Position;

        if (parentId is { } requestedParentId && !tree.Contains(requestedParentId))
        {
            fields[TreeRequestFields.ParentId] = ParentNotInTreeMessage(requestedParentId);
        }

        if (position is null)
        {
            fields[TreeRequestFields.Position] = "Podaj pozycję węzła wśród rodzeństwa.";
        }
        else if (!fields.ContainsKey(TreeRequestFields.ParentId))
        {
            // Zakres liczony po zdjęciu przenoszonego węzła — przy zmianie
            // kolejności w obrębie rodzica węzeł nie liczy się jako własne
            // rodzeństwo.
            var siblingCount = tree.ChildrenOf(parentId).Count(sibling => sibling.Id != id);

            if (position < 0 || position > siblingCount)
            {
                fields[TreeRequestFields.Position] =
                    $"Pozycja musi mieścić się w zakresie od 0 do {siblingCount}.";
            }
        }

        if (fields.Count > 0)
        {
            return ValidationFailure(fields);
        }

        if (TreeRules.HasDuplicateSibling(tree.ChildrenOf(parentId), moved.ObjectId, exceptNodeId: id))
        {
            var catalog = await LoadCatalogAsync(db, cancellationToken);

            return Conflict(TreeResponses.DuplicateSibling(
                catalog[moved.ObjectId].Code,
                ParentCode(tree, catalog, parentId)));
        }

        if (TreeRules.FindConflictOnMove(tree, id, parentId) is { } conflict)
        {
            var catalog = await LoadCatalogAsync(db, cancellationToken);

            return Conflict(TreeResponses.Cycle(
                TreeOperation.Move,
                catalog[moved.ObjectId].Code,
                Codes(conflict, catalog)));
        }

        // Grupa źródłowa traci węzeł, docelowa go zyskuje; przy tym samym
        // rodzicu to jedna grupa, a pozycja jest indeksem po zdjęciu.
        var sourceOrder = TreeRules.Without(Order(tree, moved.ParentId), id);
        var targetOrder = TreeRules.InsertAt(
            moved.ParentId == parentId ? sourceOrder : Order(tree, parentId),
            id,
            position!.Value);

        if (moved.ParentId != parentId)
        {
            ApplyPositions(entities, sourceOrder);
        }

        ApplyPositions(entities, targetOrder);
        moved.ParentId = parentId;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new { id });
    }

    /// <summary>
    /// Usuwa węzeł z całym poddrzewem i przenumerowuje rodzeństwo, żeby
    /// pozycje zostały ciągłe od 0.
    /// </summary>
    private static async Task<IResult> DeleteNodeAsync(
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

        // Całe drzewo śledzone: usunięcie węzła kaskadą EF oznacza do usunięcia
        // także wszystkich śledzonych potomków, a rodzeństwo dostaje nowe
        // pozycje. Kaskada w schemacie jest drugim bezpiecznikiem.
        var entities = (await db.TreeNodes
                .Where(node => node.UserId == userId)
                .ToListAsync(cancellationToken))
            .ToDictionary(node => node.Id);

        if (!entities.TryGetValue(id, out var deleted))
        {
            return NodeNotFound(id);
        }

        var tree = new TreeSnapshot(entities.Values.Select(ToEntry));

        ApplyPositions(entities, TreeRules.Without(Order(tree, deleted.ParentId), id));

        db.TreeNodes.Remove(deleted);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Węzły drzewa jednego użytkownika — jedyne miejsce, w którym zapytanie
    /// o węzły dostaje filtr po właścicielu, więc żaden odczyt go nie pominie.
    /// </summary>
    private static async Task<List<TreeNodeEntry>> LoadEntriesAsync(
        IQueryable<TreeNode> nodes,
        string userId,
        CancellationToken cancellationToken)
        => await nodes
            .Where(node => node.UserId == userId)
            .Select(node => new TreeNodeEntry(node.Id, node.ParentId, node.ObjectId, node.Position))
            .ToListAsync(cancellationToken);

    private static async Task<Dictionary<int, CatalogEntry>> LoadCatalogAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
        => await db.CatalogObjects
            .AsNoTracking()
            .Select(o => new CatalogEntry(o.Id, o.Code, o.NormalizedCode))
            .ToDictionaryAsync(entry => entry.Id, cancellationToken);

    private static async Task<List<(int ParentId, int ChildId)>> LoadLinksAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
        => (await db.CatalogObjectLinks
                .AsNoTracking()
                .Select(link => new { link.ParentId, link.ChildId })
                .ToListAsync(cancellationToken))
            .Select(link => (link.ParentId, link.ChildId))
            .ToList();

    private static TreeNodeEntry ToEntry(TreeNode node)
        => new(node.Id, node.ParentId, node.ObjectId, node.Position);

    /// <summary>
    /// Zamienia rozwiniętą gałąź na encje do zapisu. Korzeń dostaje rodzica
    /// i pozycję w jego grupie, potomkowie — nawigację i indeks wśród
    /// rodzeństwa; identyfikatory i klucze obce potomków nada zapis.
    /// </summary>
    private static TreeNode ToEntities(BranchNode branch, string userId, int? parentId, int position)
    {
        var root = new TreeNode
        {
            UserId = userId,
            ParentId = parentId,
            ObjectId = branch.ObjectId,
            Position = position,
        };

        // Jawny stos — powód w komentarzu `TreeRules`.
        var stack = new Stack<(BranchNode Branch, TreeNode Entity)>();
        stack.Push((branch, root));

        while (stack.Count > 0)
        {
            var (source, entity) = stack.Pop();

            for (var index = 0; index < source.Children.Count; index++)
            {
                var child = new TreeNode
                {
                    UserId = userId,
                    ObjectId = source.Children[index].ObjectId,
                    Position = index,
                };

                entity.Children.Add(child);
                stack.Push((source.Children[index], child));
            }
        }

        return root;
    }

    private static IReadOnlyList<int> Order(TreeSnapshot tree, int? parentId)
        => [.. tree.ChildrenOf(parentId).Select(node => node.Id)];

    private static void ApplyPositions(Dictionary<int, TreeNode> entities, IReadOnlyList<int> order)
    {
        foreach (var (nodeId, position) in TreeRules.AssignPositions(order))
        {
            entities[nodeId].Position = position;
        }
    }

    /// <summary>
    /// Kod obiektu rodzica do komunikatu o duplikacie; <c>null</c> — najwyższy
    /// poziom. Obiekt węzła istnieje, bo klucz obcy z <c>Restrict</c> nie
    /// pozwala go usunąć, a oba odczyty idą w tej samej transakcji.
    /// </summary>
    private static string? ParentCode(
        TreeSnapshot tree,
        IReadOnlyDictionary<int, CatalogEntry> catalog,
        int? parentId)
        => parentId is { } id ? catalog[tree.Get(id).ObjectId].Code : null;

    /// <summary>
    /// Kody obiektów ścieżki zapętlenia, tak jak je wpisano — ten sam zapis co
    /// na ekranie, nie postać znormalizowana.
    /// </summary>
    private static List<string> Codes(IEnumerable<int> objectIds, IReadOnlyDictionary<int, CatalogEntry> catalog)
        => [.. objectIds.Select(objectId => catalog[objectId].Code)];

    private static string ParentNotInTreeMessage(int parentId)
        => $"Węzeł o identyfikatorze {parentId} nie istnieje w drzewie.";

    private static IResult NodeNotFound(int id)
        => Results.Json(
            ApiError.Create(ApiErrorCodes.NotFound, $"Nie znaleziono węzła drzewa o identyfikatorze {id}."),
            statusCode: StatusCodes.Status404NotFound);

    private static IResult ValidationFailure(IReadOnlyDictionary<string, string> fields)
        => Results.Json(
            ApiError.Validation(ValidationMessage, fields),
            statusCode: StatusCodes.Status400BadRequest);

    private static IResult Conflict(ApiError error)
        => Results.Json(error, statusCode: StatusCodes.Status409Conflict);

    private sealed record CatalogEntry(int Id, string Code, string NormalizedCode);
}

/// <summary>
/// Nazwy pól w mapie naruszeń (<c>context.fields</c>) — te same co pola ciała
/// żądań <c>/tree/nodes</c>.
/// </summary>
/// <remarks>
/// Muszą być identyczne z nazwami, pod którymi klient drzewa po stronie React
/// Routera wysyła pola i czyta naruszenia. Zgodność jest utrzymywana ręcznie:
/// nie sprawdza jej ani kompilator, ani <c>npm run typecheck</c>, a rozjazd nie
/// daje żadnego błędu — komunikat po prostu nie trafia tam, gdzie powinien.
/// </remarks>
internal static class TreeRequestFields
{
    /// <summary>
    /// Dodawany obiekt: brak pola albo obiekt, którego nie ma w słowniku.
    /// </summary>
    public const string ObjectId = "objectId";

    /// <summary>
    /// Docelowy rodzic: węzeł, którego nie ma w drzewie użytkownika (także
    /// węzeł cudzego drzewa). Brak pola to najwyższy poziom, nie błąd.
    /// </summary>
    public const string ParentId = "parentId";

    /// <summary>Zakres dodania: brak pola — API nie wybiera zakresu za użytkownika.</summary>
    public const string IncludeBranch = "includeBranch";

    /// <summary>Pozycja przeniesienia: brak pola albo wartość spoza 0…liczba rodzeństwa.</summary>
    public const string Position = "position";
}

/// <summary>Operacja, której dotyczy odmowa — od niej zależy początek komunikatu.</summary>
internal enum TreeOperation
{
    Add,
    Move,
}

/// <summary>
/// Odmowy drzewa, które niosą regułę, a nie tylko tekst. Wydzielone
/// z <see cref="TreeEndpoints"/> wzorem <c>ObjectResponses</c>: kształt koperty
/// ma być sprawdzalny bez potoku HTTP.
/// </summary>
/// <remarks>
/// Kody obiektów są w komunikatach i w <c>context</c> zapisane tak, jak je
/// wpisano w słowniku — to ten zapis użytkownik widzi w drzewie.
/// </remarks>
internal static class TreeResponses
{
    /// <summary>Klucz w <c>context</c> ze ścieżką kodów zapętlenia.</summary>
    internal const string PathContextKey = "path";

    /// <summary>Klucz w <c>context</c> z kodem dublowanego obiektu.</summary>
    internal const string ObjectCodeContextKey = "objectCode";

    /// <summary>Klucz w <c>context</c> z limitem węzłów drzewa.</summary>
    internal const string LimitContextKey = "limit";

    /// <summary>Klucz w <c>context</c> z bieżącym rozmiarem drzewa.</summary>
    internal const string CurrentContextKey = "current";

    /// <summary>Klucz w <c>context</c> z liczbą węzłów dodawanej gałęzi.</summary>
    internal const string AddingContextKey = "adding";

    /// <summary>
    /// Odmowa <see cref="ApiErrorCodes.TreeCycle"/>. Komunikat nazywa obiekt
    /// operacji i pełną ścieżkę — FR-004 wymaga, żeby użytkownik widział, gdzie
    /// pętla by się zamknęła, także gdy konflikt siedzi głęboko w gałęzi.
    /// </summary>
    public static ApiError Cycle(TreeOperation operation, string subjectCode, IReadOnlyList<string> pathCodes)
    {
        var subject = operation switch
        {
            TreeOperation.Add => $"Dodanie obiektu {subjectCode}",
            TreeOperation.Move => $"Przeniesienie węzła {subjectCode}",
            _ => throw new ArgumentOutOfRangeException(nameof(operation), operation, null),
        };

        return ApiError.Create(
            ApiErrorCodes.TreeCycle,
            $"{subject} utworzyłoby zapętlenie: {string.Join(" → ", pathCodes)}.",
            new Dictionary<string, object?>
            {
                [PathContextKey] = pathCodes,
            });
    }

    /// <summary>
    /// Odmowa <see cref="ApiErrorCodes.TreeDuplicateSibling"/>;
    /// <paramref name="parentCode"/> <c>null</c> — najwyższy poziom.
    /// </summary>
    public static ApiError DuplicateSibling(string objectCode, string? parentCode)
        => ApiError.Create(
            ApiErrorCodes.TreeDuplicateSibling,
            parentCode is null
                ? $"Obiekt {objectCode} jest już na najwyższym poziomie drzewa."
                : $"Obiekt {objectCode} jest już podobiektem {parentCode} w tym miejscu drzewa.",
            new Dictionary<string, object?>
            {
                [ObjectCodeContextKey] = objectCode,
            });

    /// <summary>
    /// Odmowa <see cref="ApiErrorCodes.TreeTooLarge"/>.
    /// <paramref name="adding"/> przy przerwanym rozwijaniu jest dolnym
    /// ograniczeniem (<see cref="BranchExpansion.NodeCount"/>).
    /// </summary>
    /// <remarks>
    /// „węzłów" pasuje do 2000 i do każdego limitu kończącego się na 0, 1
    /// (poza samym 1) albo 5–9; limit kończący się na 2–4 (poza 12–14)
    /// wymagałby formy „węzły".
    /// </remarks>
    public static ApiError TooLarge(int limit, int current, int adding)
        => ApiError.Create(
            ApiErrorCodes.TreeTooLarge,
            $"Drzewo przekroczyłoby limit {limit} węzłów.",
            new Dictionary<string, object?>
            {
                [LimitContextKey] = limit,
                [CurrentContextKey] = current,
                [AddingContextKey] = adding,
            });
}

/// <summary>
/// Treść żądania dodania obiektu do drzewa. Pola są nullowalne, żeby ich brak
/// dawał błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie
/// frameworka; <c>ParentId</c> <c>null</c> to najwyższy poziom.
/// </summary>
internal sealed record AddTreeNodeRequest(int? ObjectId, int? ParentId, bool? IncludeBranch);

/// <summary>
/// Treść żądania przeniesienia węzła. <c>ParentId</c> <c>null</c> — najwyższy
/// poziom; <c>Position</c> — indeks w docelowej grupie rodzeństwa po zdjęciu
/// przenoszonego węzła.
/// </summary>
internal sealed record MoveTreeNodeRequest(int? ParentId, int? Position);
