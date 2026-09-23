namespace Api.Tree;

/// <summary>
/// Reguły drzewa roboczego jako czyste funkcje: bez bazy, bez hosta i bez
/// encji EF. Endpointy (<see cref="TreeEndpoints"/>) wczytują całe drzewo
/// użytkownika i słownik, pytają te reguły o werdykt i zapisują albo zwracają
/// kopertę błędu — dzięki temu każdą decyzję sprawdza test jednostkowy.
/// </summary>
/// <remarks>
/// Zapętlenie w drzewie to <b>obiekt na własnej ścieżce do korzenia</b> —
/// ścieżce jednego wystąpienia, a nie cykl w grafie obiektów. A pod B w jednej
/// gałęzi i B pod A w innej jest poprawne, dlatego ta klasa nie używa
/// <c>ObjectRules.FindCycle</c> (powód w komentarzu tamtej klasy).
///
/// Przejścia idą jawnym stosem, a nie rekurencją — z tego samego powodu co
/// w <c>ObjectRules.FindCycle</c>: <c>StackOverflowException</c> kończy cały
/// proces API i nie da się go złapać.
/// </remarks>
internal static class TreeRules
{
    /// <summary>
    /// Mapa „obiekt → podobiekty" ze słownika, z dziećmi w kolejności kodu
    /// znormalizowanego (porządek porządkowy, ten sam co w <c>GET /objects</c>).
    /// Z tej kolejności powstaje kolejność rodzeństwa w skopiowanej gałęzi
    /// i kolejność przejścia w <see cref="FindConflictOnAdd"/>.
    /// </summary>
    /// <remarks>
    /// Relacja do obiektu spoza <paramref name="normalizedCodeById"/> jest
    /// pomijana — ten sam wybór co w <c>GET /objects</c>: gałąź nie wskazuje
    /// obiektu, którego słownik nie zna.
    /// </remarks>
    internal static Dictionary<int, IReadOnlyList<int>> CatalogChildrenInCodeOrder(
        IEnumerable<(int ParentId, int ChildId)> links,
        IReadOnlyDictionary<int, string> normalizedCodeById)
        => links
            .Where(link => normalizedCodeById.ContainsKey(link.ParentId)
                && normalizedCodeById.ContainsKey(link.ChildId))
            .GroupBy(link => link.ParentId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<int>)group
                    .Select(link => link.ChildId)
                    .Distinct()
                    .OrderBy(childId => normalizedCodeById[childId], StringComparer.Ordinal)
                    .ThenBy(childId => childId)
                    .ToList());

    /// <summary>
    /// Rozwija dodawany obiekt w gałąź do wstawienia: sam obiekt albo — przy
    /// <paramref name="includeBranch"/> — obiekt z pełną strukturą podrzędną
    /// ze słownika, rozpisaną na osobne wystąpienia (romb daje dwa wystąpienia
    /// wspólnego potomka).
    /// </summary>
    /// <param name="budget">
    /// Ile węzłów wolno jeszcze dodać: limit minus bieżący rozmiar drzewa.
    /// </param>
    /// <returns>
    /// Gałąź z liczbą węzłów albo wynik „za duże"
    /// (<see cref="BranchExpansion.IsTooLarge"/>), gdy liczba węzłów przekroczy
    /// <paramref name="budget"/>.
    /// </returns>
    /// <remarks>
    /// Węzły są liczone w trakcie, a rozwijanie przerywa się na pierwszym
    /// węźle ponad budżet. Łańcuch rombów rozwija się wykładniczo — liczenie
    /// po fakcie oznaczałoby zbudowanie w pamięci gałęzi, której i tak nie
    /// wolno zapisać.
    /// </remarks>
    internal static BranchExpansion ExpandBranch(
        int objectId,
        bool includeBranch,
        IReadOnlyDictionary<int, IReadOnlyList<int>> catalogChildren,
        int budget)
    {
        var count = 1;

        if (count > budget)
        {
            return new BranchExpansion(null, count);
        }

        var root = new BranchNode(objectId);

        if (!includeBranch)
        {
            return new BranchExpansion(root, count);
        }

        // Ramka to (rodzic w budowanej gałęzi, obiekt dziecka). Dzieci trafiają
        // na stos od końca, więc zdejmowane są w kolejności kodu, a poddrzewo
        // pierwszego dziecka jest domykane przed drugim — dzięki temu każde
        // dziecko dopisuje się do listy rodzica we właściwym miejscu.
        var stack = new Stack<(BranchNode Parent, int ObjectId)>();
        PushChildren(stack, root, catalogChildren);

        while (stack.Count > 0)
        {
            var (parent, childObjectId) = stack.Pop();

            count++;

            if (count > budget)
            {
                return new BranchExpansion(null, count);
            }

            var node = new BranchNode(childObjectId);
            parent.Add(node);

            PushChildren(stack, node, catalogChildren);
        }

        return new BranchExpansion(root, count);
    }

    /// <summary>
    /// Szuka zapętlenia przy dodaniu obiektu pod miejsce, do którego prowadzi
    /// <paramref name="ancestorObjectIds"/>.
    /// </summary>
    /// <param name="ancestorObjectIds">
    /// Obiekty na ścieżce od korzenia do docelowego rodzica włącznie; pusta
    /// lista — najwyższy poziom.
    /// </param>
    /// <returns>
    /// <c>null</c> albo ścieżka obiektów od wystąpienia konfliktowego wśród
    /// przodków, przez miejsce docelowe, do wystąpienia w gałęzi — np.
    /// przodkowie <c>[GPZ-01, L1]</c> i gałąź <c>L2 → T5 → GPZ-01</c> dają
    /// <c>[GPZ-01, L1, L2, T5, GPZ-01]</c>; obiekt pod samym sobą —
    /// <c>[X, X]</c>.
    /// </returns>
    /// <remarks>
    /// Przejście idzie po grafie słownika, a nie po rozwiniętej gałęzi, więc
    /// działa także wtedy, gdy gałąź jest za duża, żeby ją rozwinąć — dzięki
    /// temu zapętlenie jest zgłaszane przed rozmiarem, jak każe kolejność
    /// kontroli. Obiekt raz przeszukany bez konfliktu nie jest odwiedzany
    /// ponownie: zbiór przodków jest stały, więc jego kolejne wystąpienie
    /// dałoby ten sam wynik. Pierwszy konflikt w tym przejściu jest więc
    /// pierwszym w pre-orderze rozwiniętej gałęzi.
    /// </remarks>
    internal static IReadOnlyList<int>? FindConflictOnAdd(
        IReadOnlyList<int> ancestorObjectIds,
        int objectId,
        bool includeBranch,
        IReadOnlyDictionary<int, IReadOnlyList<int>> catalogChildren)
        => FindConflict(
            ancestorObjectIds,
            objectId,
            objectOf: key => key,
            childrenOf: key => includeBranch && catalogChildren.TryGetValue(key, out var children)
                ? children
                : []);

    /// <summary>
    /// Szuka zapętlenia przy przeniesieniu węzła <paramref name="nodeId"/>
    /// z całym poddrzewem pod <paramref name="targetParentId"/>
    /// (<c>null</c> — najwyższy poziom). Wynik jak w
    /// <see cref="FindConflictOnAdd"/>.
    /// </summary>
    /// <remarks>
    /// Przeniesienie węzła pod jego własnego potomka nie potrzebuje osobnego
    /// przypadku: przodkowie celu obejmują wtedy obiekt przenoszonego węzła,
    /// więc ta sama kontrola zwraca ścieżkę od niego do celu i z powrotem.
    /// Ścieżka przodków liczona jest na drzewie sprzed przeniesienia — zdjęcie
    /// węzła nie zmienia przodków celu leżącego poza jego poddrzewem.
    /// </remarks>
    internal static IReadOnlyList<int>? FindConflictOnMove(
        TreeSnapshot tree,
        int nodeId,
        int? targetParentId)
        => FindConflict(
            tree.AncestorObjectPath(targetParentId),
            nodeId,
            objectOf: key => tree.Get(key).ObjectId,
            childrenOf: key => [.. tree.ChildrenOf(key).Select(child => child.Id)]);

    /// <summary>
    /// Czy obiekt <paramref name="objectId"/> jest już wśród
    /// <paramref name="siblings"/> — dzieci docelowego rodzica albo węzłów
    /// najwyższego poziomu.
    /// </summary>
    /// <param name="exceptNodeId">
    /// Węzeł przenoszony: przy zmianie kolejności w obrębie tego samego
    /// rodzica stoi wśród rodzeństwa i nie jest duplikatem samego siebie.
    /// </param>
    internal static bool HasDuplicateSibling(
        IEnumerable<TreeNodeEntry> siblings,
        int objectId,
        int? exceptNodeId)
        => siblings.Any(sibling => sibling.ObjectId == objectId && sibling.Id != exceptNodeId);

    /// <summary>Kolejność rodzeństwa po zdjęciu węzła <paramref name="nodeId"/>.</summary>
    internal static IReadOnlyList<int> Without(IReadOnlyList<int> order, int nodeId)
        => [.. order.Where(id => id != nodeId)];

    /// <summary>
    /// Kolejność rodzeństwa po wstawieniu węzła <paramref name="nodeId"/> pod
    /// indeks <paramref name="position"/> (0…liczba rodzeństwa). Kolejność
    /// wejściowa nie zawiera wstawianego węzła — przy przesunięciu w obrębie
    /// rodzica najpierw <see cref="Without"/>, bo pozycja w kontrakcie
    /// <c>PUT</c> jest indeksem po zdjęciu przenoszonego węzła.
    /// </summary>
    internal static IReadOnlyList<int> InsertAt(IReadOnlyList<int> order, int nodeId, int position)
    {
        if (position < 0 || position > order.Count)
        {
            throw new ArgumentOutOfRangeException(
                nameof(position),
                position,
                $"Pozycja musi mieścić się w zakresie od 0 do {order.Count}.");
        }

        var result = order.ToList();
        result.Insert(position, nodeId);

        return result;
    }

    /// <summary>
    /// Pozycje dla grupy rodzeństwa w podanej kolejności: ciągłe od 0. Każda
    /// operacja kończy się przypisaniem tych pozycji każdej dotkniętej grupie.
    /// </summary>
    internal static IReadOnlyDictionary<int, int> AssignPositions(IReadOnlyList<int> order)
        => order.Select((id, index) => (id, index)).ToDictionary(pair => pair.id, pair => pair.index);

    /// <summary>
    /// Rdzeń kontroli zapętlenia wspólny dla dodania i przeniesienia.
    /// Gałąź jest grafem kluczy (<paramref name="childrenOf"/>) — obiektów
    /// słownika przy dodaniu, węzłów drzewa przy przeniesieniu — a
    /// <paramref name="objectOf"/> zamienia klucz na obiekt.
    /// </summary>
    private static IReadOnlyList<int>? FindConflict(
        IReadOnlyList<int> ancestorObjectIds,
        int rootKey,
        Func<int, int> objectOf,
        Func<int, IReadOnlyList<int>> childrenOf)
    {
        // Ścieżka przodków w poprawnym drzewie nie powtarza obiektu (pilnuje
        // tego właśnie ta reguła), więc indeks wystąpienia jest jednoznaczny.
        var ancestorIndex = new Dictionary<int, int>();

        for (var index = 0; index < ancestorObjectIds.Count; index++)
        {
            ancestorIndex.TryAdd(ancestorObjectIds[index], index);
        }

        var stack = new Stack<(int Key, IEnumerator<int> Children)>();

        IReadOnlyList<int>? ConflictAt(int key)
        {
            var objectId = objectOf(key);

            if (!ancestorIndex.TryGetValue(objectId, out var from))
            {
                return null;
            }

            // Stos od dna to droga od korzenia gałęzi do rodzica badanego klucza.
            return
            [
                .. ancestorObjectIds.Skip(from),
                .. stack.Reverse().Select(frame => objectOf(frame.Key)),
                objectId,
            ];
        }

        if (ConflictAt(rootKey) is { } rootConflict)
        {
            return rootConflict;
        }

        var exhausted = new HashSet<int> { rootKey };
        stack.Push((rootKey, childrenOf(rootKey).GetEnumerator()));

        while (stack.Count > 0)
        {
            var children = stack.Peek().Children;

            if (!children.MoveNext())
            {
                stack.Pop();

                continue;
            }

            var child = children.Current;

            if (ConflictAt(child) is { } conflict)
            {
                return conflict;
            }

            if (!exhausted.Add(child))
            {
                continue;
            }

            stack.Push((child, childrenOf(child).GetEnumerator()));
        }

        return null;
    }

    private static void PushChildren(
        Stack<(BranchNode Parent, int ObjectId)> stack,
        BranchNode parent,
        IReadOnlyDictionary<int, IReadOnlyList<int>> catalogChildren)
    {
        if (!catalogChildren.TryGetValue(parent.ObjectId, out var children))
        {
            return;
        }

        for (var index = children.Count - 1; index >= 0; index--)
        {
            stack.Push((parent, children[index]));
        }
    }
}

/// <summary>
/// Węzeł drzewa w postaci, na której działają reguły: bez nawigacji EF, same
/// identyfikatory i pozycja.
/// </summary>
internal sealed record TreeNodeEntry(int Id, int? ParentId, int ObjectId, int Position);

/// <summary>
/// Całe drzewo jednego użytkownika w pamięci, z odczytem grup rodzeństwa
/// w kolejności i ścieżki przodków. Budowane raz na operację z węzłów
/// wczytanych w transakcji endpointu.
/// </summary>
internal sealed class TreeSnapshot
{
    private readonly Dictionary<int, TreeNodeEntry> nodesById;

    // `ToLookup` przyjmuje klucz `null` (najwyższy poziom), czego słownik nie
    // potrafi, i zachowuje kolejność źródła wewnątrz grupy.
    private readonly ILookup<int?, TreeNodeEntry> childrenByParent;

    public TreeSnapshot(IEnumerable<TreeNodeEntry> nodes)
    {
        nodesById = nodes.ToDictionary(node => node.Id);

        // Identyfikator jako drugi klucz sortowania: przy pozycjach ciągłych
        // nic nie zmienia, a przy uszkodzonych daje kolejność powtarzalną.
        childrenByParent = nodesById.Values
            .OrderBy(node => node.Position)
            .ThenBy(node => node.Id)
            .ToLookup(node => node.ParentId);
    }

    /// <summary>Liczba węzłów drzewa.</summary>
    public int Count => nodesById.Count;

    public bool Contains(int nodeId) => nodesById.ContainsKey(nodeId);

    public TreeNodeEntry Get(int nodeId) => nodesById[nodeId];

    /// <summary>
    /// Dzieci węzła w kolejności pozycji; <c>null</c> — węzły najwyższego
    /// poziomu.
    /// </summary>
    public IReadOnlyList<TreeNodeEntry> ChildrenOf(int? parentId) => [.. childrenByParent[parentId]];

    /// <summary>
    /// Obiekty na ścieżce od korzenia do węzła <paramref name="nodeId"/>
    /// włącznie; dla <c>null</c> (najwyższy poziom) — pusta lista.
    /// </summary>
    /// <remarks>
    /// Wspinaczka jest ograniczona liczbą węzłów: pętla w relacji rodzic–dziecko
    /// może powstać wyłącznie przez zmianę pliku bazy z pominięciem API i ma
    /// skończyć się wyjątkiem, a nie zawieszeniem żądania.
    /// </remarks>
    public IReadOnlyList<int> AncestorObjectPath(int? nodeId)
    {
        var path = new List<int>();
        var current = nodeId;

        while (current is { } id)
        {
            if (path.Count >= nodesById.Count)
            {
                throw new InvalidOperationException(
                    "Relacja rodzic–dziecko w drzewie zawiera pętlę — dane zmieniono z pominięciem API.");
            }

            var node = nodesById[id];
            path.Add(node.ObjectId);
            current = node.ParentId;
        }

        path.Reverse();

        return path;
    }
}

/// <summary>
/// Węzeł gałęzi rozwiniętej ze słownika, jeszcze przed zapisem — bez
/// identyfikatora i pozycji, które nada zapis.
/// </summary>
internal sealed class BranchNode(int objectId)
{
    private readonly List<BranchNode> children = [];

    public int ObjectId { get; } = objectId;

    /// <summary>Dzieci w kolejności rodzeństwa w drzewie.</summary>
    public IReadOnlyList<BranchNode> Children => children;

    internal void Add(BranchNode child) => children.Add(child);
}

/// <summary>
/// Wynik <see cref="TreeRules.ExpandBranch"/>: gałąź i liczba jej węzłów albo
/// „za duże" — wtedy <see cref="Branch"/> jest <c>null</c>, a
/// <see cref="NodeCount"/> to liczba węzłów policzonych do chwili przerwania
/// (budżet plus jeden), czyli dolne ograniczenie, a nie pełny rozmiar gałęzi.
/// </summary>
internal sealed record BranchExpansion(BranchNode? Branch, int NodeCount)
{
    public bool IsTooLarge => Branch is null;
}
