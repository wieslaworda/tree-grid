namespace Api.Tree;

/// <summary>
/// Reguły drzewa roboczego jako czyste funkcje: bez bazy, bez hosta i bez
/// encji EF. Endpointy (<see cref="TreeEndpoints"/>) wczytują całe drzewo
/// użytkownika i słownik, pytają te reguły o werdykt i zapisują albo zwracają
/// kopertę błędu — dzięki temu każdą decyzję sprawdza test jednostkowy.
/// </summary>
/// <remarks>
/// Reguła użycia obiektów (PRD FR-004): drzewo może mieć wiele korzeni,
/// obiekt korzenia występuje w całym drzewie tylko raz, a w całym poddrzewie
/// jednego korzenia obiekt nie może się powtórzyć. Ten sam obiekt wolno użyć
/// pod innym korzeniem. Słownik nie niesie relacji między obiektami, więc całą
/// strukturę składa użytkownik, a reguła patrzy wyłącznie na drzewo.
///
/// Regułę ocenia się na <b>drzewie po operacji</b> i wyłącznie dla
/// <b>węzłów objętych operacją</b>: nowego węzła przy dodaniu, przenoszonego
/// węzła z całym poddrzewem przy przeniesieniu. Konflikt jest relacją
/// symetryczną, więc para węzłów, z których żaden nie jest objęty operacją,
/// nie mogła się zmienić — sprawdzenie samych węzłów operacji wystarcza,
/// a stare naruszenie w innej części drzewa nie blokuje niezwiązanych operacji.
///
/// Dla węzła <c>m</c> z obiektem <c>o</c> i korzeniem <c>R</c> wygrywa
/// pierwszy trafiony przypadek, a w przenoszonym poddrzewie — pierwszy węzeł
/// w pre-order z konfliktem:
/// <list type="number">
/// <item>inny węzeł z obiektem <c>o</c> jest korzeniem — odmowa „korzeń";</item>
/// <item><c>m</c> jest korzeniem, a <c>o</c> stoi gdzieś pod korzeniem —
/// odmowa „pod korzeniem" z korzeniem pierwszego takiego wystąpienia
/// w pre-order całego drzewa;</item>
/// <item><c>m</c> nie jest korzeniem, a <c>o</c> stoi jeszcze raz pod
/// <c>R</c> — odmowa „pod korzeniem" z korzeniem <c>R</c>.</item>
/// </list>
///
/// Przejścia idą jawnym stosem, a nie rekurencją: głębokość przejścia to
/// głębokość drzewa, a <c>StackOverflowException</c> kończy cały proces API
/// i nie da się go złapać.
/// </remarks>
internal static class TreeRules
{
    /// <summary>
    /// Czy drzewo o <paramref name="nodeCount"/> węzłach jest pełne — kolejne
    /// dodanie przekroczyłoby <paramref name="limit"/>.
    /// </summary>
    internal static bool IsFull(int nodeCount, int limit) => nodeCount >= limit;

    /// <summary>
    /// Szuka powtórzenia obiektu przy dodaniu <paramref name="objectId"/> na
    /// koniec dzieci <paramref name="parentId"/> (<c>null</c> — nowy korzeń).
    /// </summary>
    /// <returns><c>null</c>, gdy dodanie nie łamie reguły.</returns>
    /// <remarks>
    /// Wywołujący sprawdził już, że <paramref name="parentId"/> jest w drzewie.
    /// Dodanie wstawia jeden obiekt bez dzieci, więc węzłem operacji jest tylko
    /// on sam.
    /// </remarks>
    internal static TreeReuse? FindReuseOnAdd(TreeSnapshot tree, int? parentId, int objectId)
    {
        // Identyfikator spoza drzewa — nowy węzeł istnieje wyłącznie w drzewie
        // po operacji, a pozycja stawia go na końcu rodzeństwa, jak w endpoincie.
        var addedId = tree.Count == 0 ? 1 : tree.Nodes.Max(node => node.Id) + 1;
        var added = new TreeNodeEntry(addedId, parentId, objectId, int.MaxValue);

        return FindReuse(tree.With(added), addedId);
    }

    /// <summary>
    /// Szuka powtórzenia obiektu przy przeniesieniu węzła
    /// <paramref name="nodeId"/> z całym poddrzewem pod
    /// <paramref name="targetParentId"/> (<c>null</c> — najwyższy poziom).
    /// </summary>
    /// <returns><c>null</c>, gdy przeniesienie nie łamie reguły.</returns>
    /// <remarks>
    /// Cel leżący w przenoszonym poddrzewie (węzeł pod sobą albo pod własnym
    /// potomkiem) jest odmawiany, zanim powstanie drzewo po operacji: po
    /// takim przeniesieniu poddrzewo odcina się od korzeni i zamyka w pętlę,
    /// więc porównanie z resztą drzewa nie znalazłoby nic. Przenoszony korzeń
    /// dostaje wtedy odmowę „korzeń", węzeł podrzędny — „pod korzeniem" ze
    /// swoim obecnym korzeniem.
    ///
    /// Pozycja przeniesienia nie wpływa na werdykt. Drzewo po operacji stawia
    /// przenoszony węzeł na końcu docelowego rodzeństwa, co zmienia najwyżej
    /// to, który korzeń nazwie odmowa przypadku 2, gdy pasuje kilka.
    /// </remarks>
    internal static TreeReuse? FindReuseOnMove(TreeSnapshot tree, int nodeId, int? targetParentId)
    {
        var moved = tree.Get(nodeId);

        if (targetParentId is { } targetId && tree.Subtree(nodeId).Any(node => node.Id == targetId))
        {
            return moved.ParentId is null
                ? new TreeReuse(moved.ObjectId, moved.ObjectId, IsRoot: true)
                : new TreeReuse(moved.ObjectId, tree.RootOf(nodeId).ObjectId, IsRoot: false);
        }

        var after = tree.With(moved with { ParentId = targetParentId, Position = int.MaxValue });

        return FindReuse(after, nodeId);
    }

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
    /// Rdzeń reguły użycia obiektów wspólny dla dodania i przeniesienia:
    /// predykat z komentarza klasy dla każdego węzła poddrzewa
    /// <paramref name="subjectId"/> w drzewie po operacji <paramref name="after"/>.
    /// </summary>
    private static TreeReuse? FindReuse(TreeSnapshot after, int subjectId)
    {
        // Korzeń każdego węzła i wystąpienia obiektów w pre-order całego
        // drzewa, korzenie w kolejności pozycji — z tej kolejności przypadek 2
        // bierze pierwsze wystąpienie.
        var rootOf = new Dictionary<int, TreeNodeEntry>();
        var occurrences = new Dictionary<int, List<TreeNodeEntry>>();

        foreach (var root in after.ChildrenOf(null))
        {
            foreach (var node in after.Subtree(root.Id))
            {
                rootOf[node.Id] = root;

                if (!occurrences.TryGetValue(node.ObjectId, out var list))
                {
                    occurrences[node.ObjectId] = list = [];
                }

                list.Add(node);
            }
        }

        foreach (var node in after.Subtree(subjectId))
        {
            // Węzła nieosiągalnego od korzeni nie ma w `rootOf` tylko wtedy, gdy
            // jego przodkowie tworzą pętlę — `RootOf` kończy się wtedy wyjątkiem.
            var root = rootOf.GetValueOrDefault(node.Id) ?? after.RootOf(node.Id);

            // Węzeł osiągalny od korzeni sam stoi w `occurrences`.
            List<TreeNodeEntry> others = [.. occurrences[node.ObjectId].Where(other => other.Id != node.Id)];

            if (others.Any(other => other.ParentId is null))
            {
                return new TreeReuse(node.ObjectId, node.ObjectId, IsRoot: true);
            }

            if (node.ParentId is null)
            {
                if (others.Count > 0)
                {
                    return new TreeReuse(node.ObjectId, rootOf[others[0].Id].ObjectId, IsRoot: false);
                }

                continue;
            }

            if (others.Any(other => rootOf[other.Id].Id == root.Id))
            {
                return new TreeReuse(node.ObjectId, root.ObjectId, IsRoot: false);
            }
        }

        return null;
    }
}

/// <summary>
/// Werdykt reguły użycia obiektów: obiekt, który operacja by powtórzyła,
/// i obiekt korzenia, pod którym już stoi.
/// </summary>
/// <param name="ObjectId">Powtórzony obiekt.</param>
/// <param name="RootObjectId">
/// Obiekt korzenia, którego dotyczy odmowa; przy <paramref name="IsRoot"/>
/// równy <paramref name="ObjectId"/>.
/// </param>
/// <param name="IsRoot">
/// Wariant „korzeń": powtórzony obiekt jest już korzeniem drzewa. Inaczej —
/// wariant „pod korzeniem". Rozróżnienie jest jawne, bo obiekt powtórzony
/// pod korzeniem o tym samym obiekcie daje równe identyfikatory w obu
/// wariantach.
/// </param>
internal sealed record TreeReuse(int ObjectId, int RootObjectId, bool IsRoot);

/// <summary>
/// Węzeł drzewa w postaci, na której działają reguły: bez nawigacji EF, same
/// identyfikatory i pozycja.
/// </summary>
internal sealed record TreeNodeEntry(int Id, int? ParentId, int ObjectId, int Position);

/// <summary>
/// Całe drzewo jednego użytkownika w pamięci, z odczytem grup rodzeństwa
/// w kolejności, korzenia węzła i poddrzewa. Budowane raz na operację z węzłów
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

    /// <summary>Wszystkie węzły drzewa, bez gwarancji kolejności.</summary>
    public IReadOnlyCollection<TreeNodeEntry> Nodes => nodesById.Values;

    /// <summary>
    /// Drzewo z węzłem <paramref name="entry"/> dodanym albo podmienionym po
    /// identyfikatorze — postać, na której reguły oceniają drzewo po operacji.
    /// </summary>
    public TreeSnapshot With(TreeNodeEntry entry)
        => new(nodesById.Values.Where(node => node.Id != entry.Id).Append(entry));

    /// <summary>
    /// Korzeń węzła <paramref name="nodeId"/> — węzeł najwyższego poziomu, do
    /// którego prowadzi wspinaczka po rodzicach; korzeń dla samego siebie.
    /// </summary>
    /// <remarks>
    /// Wspinaczka jest ograniczona liczbą węzłów: pętla w relacji rodzic–dziecko
    /// może powstać wyłącznie przez zmianę pliku bazy z pominięciem API i ma
    /// skończyć się wyjątkiem, a nie zawieszeniem żądania.
    /// </remarks>
    public TreeNodeEntry RootOf(int nodeId)
    {
        var node = nodesById[nodeId];
        var steps = 0;

        while (node.ParentId is { } parentId)
        {
            if (steps++ >= nodesById.Count)
            {
                throw LoopInData();
            }

            node = nodesById[parentId];
        }

        return node;
    }

    /// <summary>
    /// Węzeł <paramref name="nodeId"/> i całe jego poddrzewo w pre-order,
    /// rodzeństwo w kolejności pozycji.
    /// </summary>
    /// <remarks>
    /// Jawny stos zamiast rekurencji — patrz <see cref="TreeRules"/>. Przejście
    /// ograniczone liczbą węzłów z tego samego powodu co <see cref="RootOf"/>:
    /// poddrzewo zamknięte w pętlę nie kończyłoby się nigdy.
    /// </remarks>
    public IReadOnlyList<TreeNodeEntry> Subtree(int nodeId)
    {
        var result = new List<TreeNodeEntry>();
        var stack = new Stack<TreeNodeEntry>();
        stack.Push(nodesById[nodeId]);

        while (stack.Count > 0)
        {
            if (result.Count >= nodesById.Count)
            {
                throw LoopInData();
            }

            var node = stack.Pop();
            result.Add(node);

            // Od końca, żeby pierwsze dziecko zeszło ze stosu pierwsze.
            var children = ChildrenOf(node.Id);

            for (var index = children.Count - 1; index >= 0; index--)
            {
                stack.Push(children[index]);
            }
        }

        return result;
    }

    private static InvalidOperationException LoopInData()
        => new("Relacja rodzic–dziecko w drzewie zawiera pętlę — dane zmieniono z pominięciem API.");
}
