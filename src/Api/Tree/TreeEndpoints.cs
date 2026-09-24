using Api.Data;
using Api.Errors;
using Api.Screens;
using Microsoft.EntityFrameworkCore;

namespace Api.Tree;

/// <summary>
/// Endpointy nazwanych drzew użytkownika (S-03, MS-03–MS-05): lista drzew
/// z dodaniem, zmianą nazwy i usunięciem oraz — w obrębie drzewa z adresu —
/// odczyt węzłów i trzy polecenia na nich: dodanie, przeniesienie, usunięcie.
/// Wzorem <c>Api.Objects</c> endpoint wiąże żądanie, czyta i zapisuje w jednej
/// transakcji oraz odwzorowuje werdykt reguły (<see cref="TreeRules"/>,
/// <see cref="TreeNameRules"/>) na kopertę błędu.
///
/// W odróżnieniu od słowników drzewo ma właściciela, a węzeł należy do drzewa,
/// nie wprost do konta. Każdy endpoint najpierw rozstrzyga tożsamość z nagłówka
/// (<see cref="TreeIdentity"/> — tam też model zaufania), potem szuka drzewa
/// z adresu po identyfikatorze <b>i</b> właścicielu, a dopiero potem czyta
/// węzły — wyłącznie po <c>TreeId</c> drzewa, które przeszło ten filtr. Cudze
/// drzewo jest dla API nieistniejące i daje 404, nie 403 — odpowiedź nie
/// potwierdza, że takie drzewo w ogóle jest. Węzeł innego drzewa, także
/// drzewa tego samego konta, jest w adresie drzewa tak samo nieistniejący.
///
/// Drzewo może wskazywać ekran (<c>Api.Screens</c>, S-06). <c>DELETE /trees/{id}</c>
/// takiego drzewa odmawia 409 <see cref="ApiErrorCodes.TreeInScreen"/> z nazwami
/// ekranów, dopóki ekrany istnieją. Węzeł dodany do drzewa dostaje w tej samej
/// transakcji kategorie domyślne każdego ekranu na tym drzewie (FR-012).
/// </summary>
/// <remarks>
/// Każdy zapis — na drzewie i na węzłach — otwiera transakcję <b>przed</b>
/// pierwszym odczytem, także przed odczytem tożsamości, i zatwierdza ją
/// dopiero po <c>SaveChanges</c>. Na SQLite <c>BeginTransaction</c> startuje
/// od razu jako transakcja zapisowa (<c>BEGIN IMMEDIATE</c>), więc drugie
/// równoległe polecenie tego samego użytkownika (np. z drugiej karty) czeka na
/// pierwsze (<c>busy_timeout</c> z <c>Program.cs</c>), zamiast czytać ten sam
/// stan. Bez tego dwa dodania przeszłyby kontrolę duplikatu albo zapętlenia
/// osobno i razem zapisały dokładnie stan, którego reguły zabraniają — a dwa
/// nowe drzewa o tej samej nazwie skończyłyby się wyjątkiem z unikalnego
/// indeksu zamiast odpowiedzią w kontrakcie. Wyjście bez <c>Commit</c> (odmowa,
/// wyjątek) wycofuje transakcję przy jej zwolnieniu.
///
/// Każde polecenie na węzłach wczytuje całe drzewo z adresu: limit
/// <see cref="TreeNode.MaxNodesPerTree"/> trzyma je w rozmiarze, przy którym
/// reguły w pamięci kosztują pojedyncze milisekundy, a pozycje rodzeństwa da
/// się przenumerować bez osobnych zapytań. Duplikat na najwyższym poziomie
/// i limit liczą się w obrębie jednego drzewa.
///
/// Kolejność kontroli jest częścią kontraktu: tożsamość → drzewo → wejście →
/// duplikat → zapętlenie → rozmiar. Klient pokazuje jeden komunikat, więc przy
/// kilku naruszeniach wygrywa pierwsze w tej kolejności.
/// </remarks>
internal static class TreeEndpoints
{
    private const string TreesPath = "/trees";

    private const string NodesPath = "/trees/{treeId:int}/nodes";

    private const string ValidationMessage = "Przesłane dane są nieprawidłowe.";

    public static WebApplication MapTreeEndpoints(this WebApplication app)
    {
        // Ograniczenie `int` w szablonie: identyfikator, który nie jest liczbą,
        // kończy się 404 z routingu, a nie błędem wiązania w cudzym kształcie.
        app.MapGet(TreesPath, ListTreesAsync);
        app.MapPost(TreesPath, CreateTreeAsync);
        app.MapPut($"{TreesPath}/{{id:int}}", RenameTreeAsync);
        app.MapDelete($"{TreesPath}/{{id:int}}", DeleteTreeAsync);

        app.MapGet(NodesPath, GetNodesAsync);
        app.MapPost(NodesPath, AddNodeAsync);
        app.MapPut($"{NodesPath}/{{id:int}}", MoveNodeAsync);
        app.MapDelete($"{NodesPath}/{{id:int}}", DeleteNodeAsync);

        return app;
    }

    /// <summary>
    /// Drzewa użytkownika posortowane po nazwie znormalizowanej porządkiem
    /// porządkowym (tym samym, którym porównuje ją unikalny indeks), a przy
    /// równej — po identyfikatorze. Pierwszy element to drzewo, które widok
    /// otwiera bez wyboru. Konto bez drzew dostaje pustą listę.
    /// </summary>
    /// <remarks>
    /// Bez transakcji — jak <c>GET /objects</c>: drzewa to jedno zapytanie.
    /// Tożsamość czytana osobno jest bezpieczna, bo kont się nie usuwa.
    /// </remarks>
    private static async Task<IResult> ListTreesAsync(
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        var items = (await LoadTreeNamesAsync(db, userId, cancellationToken))
            .OrderBy(tree => tree.NormalizedName, StringComparer.Ordinal)
            .ThenBy(tree => tree.Id)
            .Select(tree => new { id = tree.Id, name = tree.Name })
            .ToList();

        return Results.Ok(new { items });
    }

    /// <summary>Zakłada puste drzewo o podanej nazwie.</summary>
    private static async Task<IResult> CreateTreeAsync(
        TreeRequest? request,
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

        var name = await ValidateNameAsync(db, userId, request?.Name, editedId: null, cancellationToken);

        if (name.Refusal is { } refusal)
        {
            return refusal;
        }

        var tree = new UserTree
        {
            UserId = userId,
            Name = name.Value,
            NormalizedName = TreeNameRules.Normalize(name.Value),
        };

        db.Trees.Add(tree);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // 201 bez nagłówka `Location`: pod `/trees/{id}` są tylko `PUT`
        // i `DELETE`, więc `GET` dałby 405 (`context/foundation/lessons.md`,
        // „Kontrakt API nie wyprzedza emitenta").
        return Results.Json(new { id = tree.Id }, statusCode: StatusCodes.Status201Created);
    }

    /// <summary>
    /// Zmienia nazwę własnego drzewa. Ta sama nazwa — także w innej wielkości
    /// liter — nie jest duplikatem: drzewo nie koliduje samo ze sobą.
    /// </summary>
    private static async Task<IResult> RenameTreeAsync(
        int id,
        TreeRequest? request,
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

        // Śledzone, bo zmienia się nazwa. Nieistniejące drzewo wygrywa z błędem
        // pola — jak w `ObjectEndpoints`.
        if (await FindOwnedTreeAsync(db.Trees, id, userId, cancellationToken) is not { } tree)
        {
            return TreeNotFound(id);
        }

        var name = await ValidateNameAsync(db, userId, request?.Name, editedId: id, cancellationToken);

        if (name.Refusal is { } refusal)
        {
            return refusal;
        }

        tree.Name = name.Value;
        tree.NormalizedName = TreeNameRules.Normalize(name.Value);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new { id });
    }

    /// <summary>
    /// Usuwa drzewo razem ze wszystkimi jego węzłami. Węzłów endpoint nie
    /// wczytuje — usuwa je kaskada klucza obcego <c>TreeId</c> w schemacie
    /// (<see cref="AppDbContext"/>). Drzewa wskazywanego przez ekran nie usuwa:
    /// odpowiada 409 <see cref="ApiErrorCodes.TreeInScreen"/>, dopóki
    /// użytkownik nie usunie tych ekranów.
    /// </summary>
    private static async Task<IResult> DeleteTreeAsync(
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

        if (await FindOwnedTreeAsync(db.Trees, id, userId, cancellationToken) is not { } tree)
        {
            return TreeNotFound(id);
        }

        // Ekrany na tym drzewie — w tej samej transakcji: ekran utworzony
        // równolegle między kontrolą a usunięciem zamieniłby odmowę w błąd
        // klucza obcego (`Restrict` na `Screens.TreeId`). Filtr po samym
        // drzewie wystarcza, bo ekran wskazuje wyłącznie drzewo własnego konta
        // (pilnuje tego `POST /screens`), a drzewo przeszło kontrolę
        // właściciela wyżej — nazwy nie należą więc do nikogo innego.
        var screenNames = await db.Screens
            .AsNoTracking()
            .Where(screen => screen.TreeId == id)
            .Select(screen => screen.Name)
            .ToListAsync(cancellationToken);

        if (screenNames.Count > 0)
        {
            return Conflict(TreeResponses.InScreen(tree.Name, screenNames));
        }

        db.Trees.Remove(tree);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Całe drzewo z adresu jako płaska lista węzłów, posortowana po rodzicu
    /// (najpierw najwyższy poziom) i pozycji. Nowe drzewo daje pustą listę.
    /// </summary>
    /// <remarks>
    /// Bez transakcji — jak <c>GET /objects</c>: transakcja zapisowa
    /// ustawiałaby każdy odczyt w kolejce za zapisami. Drzewo usunięte między
    /// sprawdzeniem właściciela a odczytem węzłów daje co najwyżej pustą listę
    /// — węzły znikają razem z nim, więc cudzych węzłów to okno nie odsłania.
    /// </remarks>
    private static async Task<IResult> GetNodesAsync(
        int treeId,
        HttpRequest httpRequest,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var userId = await TreeIdentity.ResolveUserIdAsync(httpRequest, db, cancellationToken);

        if (userId is null)
        {
            return TreeIdentity.Refusal();
        }

        if (await FindOwnedTreeAsync(db.Trees.AsNoTracking(), treeId, userId, cancellationToken) is null)
        {
            return TreeNotFound(treeId);
        }

        var entries = (await LoadNodesAsync(db.TreeNodes.AsNoTracking(), treeId, cancellationToken))
            .Select(ToEntry);

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
    /// Dodaje jeden obiekt na koniec dzieci <c>parentId</c> (<c>null</c> —
    /// najwyższy poziom). Słownik nie zna relacji między obiektami, więc
    /// dodanie nigdy nie przynosi ze sobą struktury podrzędnej. Nowy węzeł
    /// dostaje kategorie domyślne każdego ekranu na tym drzewie (FR-012) —
    /// po wszystkich kontrolach, w tym samym <c>SaveChanges</c>.
    /// </summary>
    private static async Task<IResult> AddNodeAsync(
        int treeId,
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

        if (await FindOwnedTreeAsync(db.Trees.AsNoTracking(), treeId, userId, cancellationToken) is null)
        {
            return TreeNotFound(treeId);
        }

        var fields = new Dictionary<string, string>();
        var objectId = request?.ObjectId;
        var parentId = request?.ParentId;

        if (objectId is null)
        {
            fields[TreeRequestFields.ObjectId] = "Wskaż obiekt do dodania.";
        }

        var catalog = await LoadCatalogAsync(db, cancellationToken);

        if (objectId is { } requestedObjectId && !catalog.ContainsKey(requestedObjectId))
        {
            fields[TreeRequestFields.ObjectId] =
                $"Obiekt o identyfikatorze {requestedObjectId} nie istnieje w słowniku.";
        }

        var tree = new TreeSnapshot(
            (await LoadNodesAsync(db.TreeNodes.AsNoTracking(), treeId, cancellationToken)).Select(ToEntry));

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

        if (TreeRules.HasDuplicateSibling(tree.ChildrenOf(parentId), addedObjectId, exceptNodeId: null))
        {
            return Conflict(TreeResponses.DuplicateSibling(
                catalog[addedObjectId].Code,
                ParentCode(tree, catalog, parentId)));
        }

        if (TreeRules.FindConflictOnAdd(tree.AncestorObjectPath(parentId), addedObjectId) is { } conflict)
        {
            return Conflict(TreeResponses.Cycle(
                TreeOperation.Add,
                catalog[addedObjectId].Code,
                Codes(conflict, catalog)));
        }

        if (TreeRules.IsFull(tree.Count, TreeNode.MaxNodesPerTree))
        {
            return Conflict(TreeResponses.TooLarge(TreeNode.MaxNodesPerTree, tree.Count, adding: 1));
        }

        // Nowy węzeł staje na końcu grupy rodzeństwa, której pozycje są ciągłe
        // od 0 — liczba rodzeństwa jest więc jego pozycją.
        var node = new TreeNode
        {
            TreeId = treeId,
            ParentId = parentId,
            ObjectId = addedObjectId,
            Position = tree.ChildrenOf(parentId).Count,
        };

        db.TreeNodes.Add(node);

        await AssignScreenDefaultsAsync(db, treeId, node, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // 201 bez nagłówka `Location`: pod `/trees/{treeId}/nodes/{id}` są tylko `PUT`
        // i `DELETE`, więc `GET` dałby 405 (`context/foundation/lessons.md`,
        // „Kontrakt API nie wyprzedza emitenta").
        return Results.Json(new { id = node.Id }, statusCode: StatusCodes.Status201Created);
    }

    /// <summary>
    /// Przenosi węzeł z całym poddrzewem pod <c>parentId</c> (<c>null</c> —
    /// najwyższy poziom), na indeks <c>position</c> w docelowej grupie
    /// rodzeństwa liczony <b>po</b> zdjęciu przenoszonego węzła
    /// (0…liczba rodzeństwa). Ten sam rodzic to zmiana kolejności.
    /// Przypisań kategorii ekranów przeniesienie nie dotyka: wiszą na
    /// identyfikatorze węzła, a ten się nie zmienia.
    /// </summary>
    private static async Task<IResult> MoveNodeAsync(
        int treeId,
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

        if (await FindOwnedTreeAsync(db.Trees.AsNoTracking(), treeId, userId, cancellationToken) is null)
        {
            return TreeNotFound(treeId);
        }

        // Śledzone, bo przeniesienie zmienia rodzica i pozycje.
        var entities = (await LoadNodesAsync(db.TreeNodes, treeId, cancellationToken))
            .ToDictionary(node => node.Id);

        // Nieistniejący zasób wygrywa z błędami pól — jak w `ObjectEndpoints`.
        // Węzeł innego drzewa, także tego samego konta, nie jest w `entities`.
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
    /// pozycje zostały ciągłe od 0. Przypisań kategorii ekranów endpoint nie
    /// wczytuje: zdejmuje je z usuniętymi węzłami kaskada klucza obcego
    /// <c>TreeNodeId</c> w bazie (<see cref="AppDbContext"/>).
    /// </summary>
    private static async Task<IResult> DeleteNodeAsync(
        int treeId,
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

        if (await FindOwnedTreeAsync(db.Trees.AsNoTracking(), treeId, userId, cancellationToken) is null)
        {
            return TreeNotFound(treeId);
        }

        // Całe drzewo śledzone: usunięcie węzła kaskadą EF oznacza do usunięcia
        // także wszystkich śledzonych potomków, a rodzeństwo dostaje nowe
        // pozycje. Kaskada w schemacie jest drugim bezpiecznikiem.
        var entities = (await LoadNodesAsync(db.TreeNodes, treeId, cancellationToken))
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
    /// Drzewo <paramref name="treeId"/> konta <paramref name="userId"/> albo
    /// <c>null</c> — jedyne miejsce, w którym zapytanie o drzewo dostaje filtr
    /// po właścicielu. Cudze drzewo i drzewo, którego nie ma, dają ten sam
    /// <c>null</c>. <paramref name="trees"/> śledzone albo nie — decyduje
    /// wywołujący.
    /// </summary>
    private static async Task<UserTree?> FindOwnedTreeAsync(
        IQueryable<UserTree> trees,
        int treeId,
        string userId,
        CancellationToken cancellationToken)
        => await trees.SingleOrDefaultAsync(
            tree => tree.Id == treeId && tree.UserId == userId,
            cancellationToken);

    /// <summary>
    /// Węzły jednego drzewa — jedyne miejsce, w którym zapytanie o węzły dostaje
    /// filtr, i to wyłącznie po <c>TreeId</c>. Wywołujący przekazuje drzewo,
    /// które przeszło <see cref="FindOwnedTreeAsync"/>; <paramref name="nodes"/>
    /// śledzone (przeniesienie, usunięcie) albo nie (odczyt, dodanie).
    /// </summary>
    private static async Task<List<TreeNode>> LoadNodesAsync(
        IQueryable<TreeNode> nodes,
        int treeId,
        CancellationToken cancellationToken)
        => await nodes
            .Where(node => node.TreeId == treeId)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Dopisuje nowemu, jeszcze niezapisanemu węzłowi <paramref name="node"/>
    /// przypisania z listy domyślnej każdego ekranu na drzewie
    /// <paramref name="treeId"/> (<see cref="ScreenRules.Materialize"/>), w
    /// kolejności tej listy. Przypisania wiążą się z węzłem nawigacją, bo jego
    /// identyfikator powstaje dopiero w <c>SaveChanges</c> — ten sam zapis
    /// rozwiązuje oba. Ekran bez listy domyślnej (tworzenie na to nie pozwala)
    /// nie dostaje nic.
    /// </summary>
    /// <remarks>
    /// Wywołujący przekazuje drzewo, które przeszło <see cref="FindOwnedTreeAsync"/>;
    /// ekrany na nim są ekranami tego samego konta. Odczyt idzie w transakcji
    /// dodania, a <c>POST /screens</c> czyta węzły w swojej, więc przy ekranie
    /// tworzonym równolegle węzeł dostaje przypisania dokładnie raz: od
    /// tworzenia ekranu, jeśli zostało zatwierdzone po dodaniu, albo stąd.
    /// <see cref="ScreenAssignment.NodeId"/> z <see cref="ScreenRules.Materialize"/>
    /// jest tu pomijany — przed zapisem to jeszcze nie identyfikator węzła.
    /// </remarks>
    private static async Task AssignScreenDefaultsAsync(
        AppDbContext db,
        int treeId,
        TreeNode node,
        CancellationToken cancellationToken)
    {
        var defaults = await db.ScreenDefaultCategories
            .AsNoTracking()
            .Where(entry => entry.Screen.TreeId == treeId)
            .Select(entry => new { entry.ScreenId, entry.CategoryId, entry.Position })
            .ToListAsync(cancellationToken);

        // `Position` jest kluczem porządku, nie indeksem — luki po kaskadowym
        // zdjęciu kategorii nie przeszkadzają, a nowy węzeł dostaje pozycje
        // ciągłe od 0 w tej samej kolejności. Identyfikator rozstrzyga remis
        // tak jak w `GET /screens/{id}`.
        foreach (var screen in defaults.GroupBy(entry => entry.ScreenId))
        {
            IReadOnlyList<int> categoryIds =
            [
                .. screen
                    .OrderBy(entry => entry.Position)
                    .ThenBy(entry => entry.CategoryId)
                    .Select(entry => entry.CategoryId),
            ];

            foreach (var assignment in ScreenRules.Materialize([node.Id], categoryIds))
            {
                db.ScreenNodeCategories.Add(new ScreenNodeCategory
                {
                    ScreenId = screen.Key,
                    Node = node,
                    CategoryId = assignment.CategoryId,
                    Position = assignment.Position,
                });
            }
        }
    }

    /// <summary>
    /// Nazwy drzew jednego konta — do listy i do kontroli duplikatu nazwy.
    /// </summary>
    private static async Task<List<TreeNameEntry>> LoadTreeNamesAsync(
        AppDbContext db,
        string userId,
        CancellationToken cancellationToken)
        => await db.Trees
            .AsNoTracking()
            .Where(tree => tree.UserId == userId)
            .Select(tree => new TreeNameEntry(tree.Id, tree.Name, tree.NormalizedName))
            .ToListAsync(cancellationToken);

    /// <summary>
    /// Nazwa do zapisu albo odmowa 400 pod <see cref="TreeRequestFields.Name"/>:
    /// najpierw reguły <see cref="TreeNameRules"/>, potem duplikat w obrębie
    /// konta. Nazwa, która nie przeszła kontroli formy, nie jest już sprawdzana
    /// pod kątem duplikatu — formularz pokazuje pod polem jeden komunikat.
    /// </summary>
    private static async Task<NameVerdict> ValidateNameAsync(
        AppDbContext db,
        string userId,
        string? requestedName,
        int? editedId,
        CancellationToken cancellationToken)
    {
        if (!TreeNameRules.TryValidate(requestedName, out var name, out var message))
        {
            return new NameVerdict(name, NameFailure(message!));
        }

        var normalizedName = TreeNameRules.Normalize(name);

        // Porównanie porządkowe, tak jak porównuje unikalny indeks. Drzewo
        // edytowane nie koliduje samo ze sobą — zmiana samej wielkości liter
        // własnej nazwy jest dozwolona. Drzewa innych kont nie wchodzą do
        // porównania wcale: dwa konta mogą mieć drzewa o tej samej nazwie.
        var holder = (await LoadTreeNamesAsync(db, userId, cancellationToken))
            .FirstOrDefault(tree => tree.Id != editedId
                && string.Equals(tree.NormalizedName, normalizedName, StringComparison.Ordinal));

        return holder is null
            ? new NameVerdict(name, Refusal: null)
            : new NameVerdict(name, NameFailure($"Drzewo o nazwie „{holder.Name}” już istnieje."));
    }

    private static IResult NameFailure(string message)
        => ValidationFailure(new Dictionary<string, string>
        {
            [TreeRequestFields.Name] = message,
        });

    private static async Task<Dictionary<int, CatalogEntry>> LoadCatalogAsync(
        AppDbContext db,
        CancellationToken cancellationToken)
        => await db.CatalogObjects
            .AsNoTracking()
            .Select(o => new CatalogEntry(o.Id, o.Code))
            .ToDictionaryAsync(entry => entry.Id, cancellationToken);

    private static TreeNodeEntry ToEntry(TreeNode node)
        => new(node.Id, node.ParentId, node.ObjectId, node.Position);

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

    private static IResult TreeNotFound(int id)
        => Results.Json(
            ApiError.Create(ApiErrorCodes.NotFound, $"Nie znaleziono drzewa o identyfikatorze {id}."),
            statusCode: StatusCodes.Status404NotFound);

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

    private sealed record CatalogEntry(int Id, string Code);

    private sealed record TreeNameEntry(int Id, string Name, string NormalizedName);

    /// <summary>
    /// Wynik kontroli nazwy: <see cref="Value"/> po obcięciu spacji do zapisu,
    /// gdy <see cref="Refusal"/> jest <c>null</c>.
    /// </summary>
    private readonly record struct NameVerdict(string Value, IResult? Refusal);
}

/// <summary>
/// Nazwy pól w mapie naruszeń (<c>context.fields</c>) — te same co pola ciała
/// żądań <c>/trees</c> i <c>/trees/{treeId}/nodes</c>.
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
    /// Nazwa drzewa (<c>POST /trees</c>, <c>PUT /trees/{id}</c>): brak, pusta,
    /// za długa albo zajęta przez inne drzewo tego samego konta.
    /// </summary>
    public const string Name = "name";

    /// <summary>
    /// Dodawany obiekt: brak pola albo obiekt, którego nie ma w słowniku.
    /// </summary>
    public const string ObjectId = "objectId";

    /// <summary>
    /// Docelowy rodzic: węzeł, którego nie ma w drzewie z adresu (także węzeł
    /// innego drzewa, własnego albo cudzego). Brak pola to najwyższy poziom,
    /// nie błąd.
    /// </summary>
    public const string ParentId = "parentId";

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

    /// <summary>Klucz w <c>context</c> z liczbą dodawanych węzłów.</summary>
    internal const string AddingContextKey = "adding";

    /// <summary>
    /// Odmowa <see cref="ApiErrorCodes.TreeCycle"/>. Komunikat nazywa obiekt
    /// operacji i pełną ścieżkę — FR-004 wymaga, żeby użytkownik widział, gdzie
    /// pętla by się zamknęła, także gdy konflikt siedzi głęboko w przenoszonym
    /// poddrzewie.
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
    /// <paramref name="adding"/> — liczba dodawanych węzłów; dodanie wstawia
    /// jeden obiekt, więc dziś zawsze 1.
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

    /// <summary>
    /// Odmowa <see cref="ApiErrorCodes.TreeInScreen"/>: drzewa
    /// <paramref name="treeName"/> nie da się usunąć, dopóki wskazują je ekrany
    /// <paramref name="screenNames"/>. <c>context</c> jest pusty.
    /// </summary>
    /// <remarks>
    /// Drzewo i jego ekrany należą do tego samego konta, więc komunikat może je
    /// wymienić. Nazwy sortuje ta metoda, nie wywołujący — tym samym porządkiem
    /// co <c>GET /screens</c>: po nazwie znormalizowanej
    /// (<see cref="ScreenRules.Normalize"/>) porządkiem porządkowym, a przy
    /// równej — po nazwie w postaci wpisanej.
    /// </remarks>
    public static ApiError InScreen(string treeName, IEnumerable<string> screenNames)
    {
        var ordered = screenNames
            .OrderBy(ScreenRules.Normalize, StringComparer.Ordinal)
            .ThenBy(name => name, StringComparer.Ordinal);

        return ApiError.Create(
            ApiErrorCodes.TreeInScreen,
            $"Drzewo „{treeName}” jest wskazywane przez ekrany: {string.Join(", ", ordered)}. "
                + "Usuń najpierw te ekrany.");
    }
}

/// <summary>
/// Treść żądania utworzenia drzewa i zmiany jego nazwy. Pole nullowalne, żeby
/// jego brak dawał błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie
/// frameworka.
/// </summary>
internal sealed record TreeRequest(string? Name);

/// <summary>
/// Treść żądania dodania obiektu do drzewa. Pola są nullowalne, żeby ich brak
/// dawał błąd walidacji w kontrakcie, a nie błąd wiązania w kształcie
/// frameworka; <c>ParentId</c> <c>null</c> to najwyższy poziom.
/// </summary>
internal sealed record AddTreeNodeRequest(int? ObjectId, int? ParentId);

/// <summary>
/// Treść żądania przeniesienia węzła. <c>ParentId</c> <c>null</c> — najwyższy
/// poziom; <c>Position</c> — indeks w docelowej grupie rodzeństwa po zdjęciu
/// przenoszonego węzła.
/// </summary>
internal sealed record MoveTreeNodeRequest(int? ParentId, int? Position);
