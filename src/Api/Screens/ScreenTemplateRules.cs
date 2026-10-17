using Api.Data;
using Api.Tree;

namespace Api.Screens;

/// <summary>
/// Klon wzorca ekranu dla nowego konta (S-16, PRD FR-001 w wersji
/// z 2026-10-17) jako czysta funkcja: z migawki wzorca
/// (<see cref="ScreenTemplateSnapshot"/>) buduje nowy graf encji — drzewo
/// z węzłami i ekran wskazujący to drzewo — bez bazy i bez hosta, wzorem
/// <see cref="ScreenRules"/>. Odczyt wzorca i zapis grafu prowadzi
/// <see cref="ScreenTemplateClone"/>.
/// </summary>
/// <remarks>
/// To jedyny przepływ w API, którego źródło nie przechodzi filtra właściciela
/// („każde zapytanie o drzewo i ekran filtruje po <c>UserId</c>"): wzorzec
/// należy do konta kuratora, a kopia powstaje na koncie nowym. Wyjątek jest
/// operacją serwera przy rejestracji, a nie dostępem użytkownika — żaden
/// endpoint nie pozwala wskazać cudzego zasobu, a kopia jest od chwili zapisu
/// zwykłym, prywatnym zasobem nowego konta (PRD <c>Access Control</c>).
///
/// Identyfikatory nowych węzłów powstają dopiero w <c>SaveChanges</c>, więc
/// rodzic węzła i węzeł przypisania są wiązane nawigacją do sklonowanej encji
/// (wzorem <c>TreeEndpoints.AssignScreenDefaultsAsync</c>), a nie
/// identyfikatorem. Przypisania kopiują się jeden do jednego, nie przez
/// <see cref="ScreenRules.Materialize"/>: kategorie węzła mogą odbiegać od
/// listy domyślnej (S-04), a węzeł z zerem kategorii ma zostać taki sam.
/// Reguł drzewa (FR-004, limit węzłów) klon nie sprawdza ponownie — wierna
/// kopia drzewa, które je spełnia, nie może ich złamać.
/// </remarks>
internal static class ScreenTemplateRules
{
    /// <summary>Łącznik nazwy ekranu wzorca z loginem: „{ekran} dla {login}".</summary>
    internal const string ScreenNameSeparator = " dla ";

    /// <summary>Łącznik nazwy drzewa wzorca z loginem: „{drzewo} {login}".</summary>
    internal const string TreeNameSeparator = " ";

    /// <summary>
    /// Nazwa kopii ekranu: „{nazwa wzorca} dla {login}", z nazwą wzorca
    /// przyciętą tak, by całość mieściła się w <see cref="Screen.NameMaxLength"/>.
    /// </summary>
    internal static string CloneScreenName(string templateName, string login)
        => JoinWithinLimit(templateName, ScreenNameSeparator + login, Screen.NameMaxLength);

    /// <summary>
    /// Nazwa kopii drzewa: „{nazwa wzorca} {login}", z nazwą wzorca przyciętą
    /// tak, by całość mieściła się w <see cref="UserTree.NameMaxLength"/>.
    /// </summary>
    internal static string CloneTreeName(string templateName, string login)
        => JoinWithinLimit(templateName, TreeNameSeparator + login, UserTree.NameMaxLength);

    /// <summary>
    /// Buduje kopię wzorca dla konta <paramref name="userId"/>: drzewo
    /// z węzłami (ta sama struktura, te same <c>ObjectId</c> i <c>Position</c>)
    /// i ekran na tym drzewie (to samo ziarno, ta sama lista domyślna, te same
    /// przypisania na odpowiadających węzłach). Obie encje mają
    /// <c>IsTemplate = false</c>. Wywołujący dodaje je do kontekstu i zapisuje
    /// jednym <c>SaveChanges</c>.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// Wzorzec jest niespójny: węzeł powtarza identyfikator, rodzic węzła albo
    /// węzeł przypisania nie należy do migawki. Kopia z takiego wzorca
    /// zgubiłaby część drzewa albo wskazała węzeł wzorca.
    /// </exception>
    internal static (UserTree Tree, Screen Screen) Clone(
        ScreenTemplateSnapshot template,
        string userId,
        string login)
    {
        var treeName = CloneTreeName(template.TreeName, login);
        var tree = new UserTree
        {
            UserId = userId,
            Name = treeName,
            NormalizedName = TreeNameRules.Normalize(treeName),
            IsTemplate = false,
        };

        // Najpierw wszystkie węzły, potem rodzice: kolejność wierszy migawki
        // nie musi stawiać rodzica przed dzieckiem.
        var clones = new Dictionary<int, TreeNode>(template.Nodes.Count);

        foreach (var node in template.Nodes)
        {
            var clone = new TreeNode
            {
                Tree = tree,
                ObjectId = node.ObjectId,
                Position = node.Position,
            };

            if (!clones.TryAdd(node.Id, clone))
            {
                throw new InvalidOperationException(
                    $"Niespójny wzorzec: węzeł {node.Id} występuje w migawce więcej niż raz.");
            }

            tree.Nodes.Add(clone);
        }

        foreach (var node in template.Nodes)
        {
            if (node.ParentId is not { } parentId)
            {
                continue;
            }

            if (!clones.TryGetValue(parentId, out var parent))
            {
                throw new InvalidOperationException(
                    $"Niespójny wzorzec: rodzic {parentId} węzła {node.Id} nie należy do drzewa wzorca.");
            }

            clones[node.Id].Parent = parent;
        }

        var screenName = CloneScreenName(template.ScreenName, login);
        var screen = new Screen
        {
            UserId = userId,
            Tree = tree,
            Name = screenName,
            NormalizedName = ScreenRules.Normalize(screenName),
            GrainMinutes = template.GrainMinutes,
            IsTemplate = false,
            DefaultCategories =
            [
                .. template.DefaultCategories.Select(entry => new ScreenDefaultCategory
                {
                    CategoryId = entry.CategoryId,
                    Position = entry.Position,
                }),
            ],
        };

        foreach (var assignment in template.Assignments)
        {
            if (!clones.TryGetValue(assignment.TreeNodeId, out var node))
            {
                throw new InvalidOperationException(
                    $"Niespójny wzorzec: przypisanie wskazuje węzeł {assignment.TreeNodeId} spoza drzewa wzorca.");
            }

            screen.NodeCategories.Add(new ScreenNodeCategory
            {
                Node = node,
                CategoryId = assignment.CategoryId,
                Position = assignment.Position,
            });
        }

        return (tree, screen);
    }

    /// <summary>
    /// Skleja nazwę wzorca z końcówką, przycinając wyłącznie nazwę wzorca —
    /// login w nazwie kopii zostaje zawsze cały, bo to on odróżnia kopie.
    /// Cięcie nie rozdziela pary zastępczej UTF-16: wtedy całość jest o znak
    /// krótsza od limitu.
    /// </summary>
    private static string JoinWithinLimit(string templateName, string suffix, int maxLength)
    {
        var available = maxLength - suffix.Length;

        if (available < 0)
        {
            throw new ArgumentException(
                $"Końcówka nazwy kopii ma {suffix.Length} znaków przy limicie {maxLength}.",
                nameof(suffix));
        }

        var prefix = templateName.Trim();

        if (prefix.Length > available)
        {
            var cut = available > 0 && char.IsHighSurrogate(prefix[available - 1])
                ? available - 1
                : available;

            prefix = prefix[..cut];
        }

        return prefix + suffix;
    }
}

/// <summary>
/// Migawka wzorca, z której <see cref="ScreenTemplateRules.Clone"/> buduje
/// kopię: nagłówki ekranu i drzewa, węzły drzewa, lista domyślna i przypisania
/// kategorii do węzłów — wartości wiersz w wiersz z bazy.
/// </summary>
internal sealed record ScreenTemplateSnapshot(
    string ScreenName,
    string TreeName,
    int GrainMinutes,
    IReadOnlyList<TemplateNode> Nodes,
    IReadOnlyList<TemplateDefaultCategory> DefaultCategories,
    IReadOnlyList<TemplateAssignment> Assignments);

/// <summary>Węzeł drzewa wzorca; <see cref="ParentId"/> <c>null</c> — najwyższy poziom.</summary>
internal readonly record struct TemplateNode(int Id, int? ParentId, int ObjectId, int Position);

/// <summary>Pozycja listy kategorii domyślnych ekranu wzorca.</summary>
internal readonly record struct TemplateDefaultCategory(int CategoryId, int Position);

/// <summary>Przypisanie kategorii do węzła drzewa wzorca w ekranie wzorca.</summary>
internal readonly record struct TemplateAssignment(int TreeNodeId, int CategoryId, int Position);
