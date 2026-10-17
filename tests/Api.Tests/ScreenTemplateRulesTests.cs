using Api.Data;
using Api.Screens;
using Api.Tree;

namespace Api.Tests;

/// <summary>
/// Regresja klonu wzorca ekranu (<see cref="ScreenTemplateRules"/>, plan
/// <c>context/changes/drzewo-domyslne/plan.md</c>, faza 3, „Testing
/// Strategy"): struktura drzewa, przypisania per węzeł, nazwy z loginem,
/// flaga wzorca, właściciel i odmowa niespójnej migawki.
///
/// Wzorem <see cref="ScreenRulesTests"/> testy nie podnoszą hosta ani bazy.
/// Kopia nie ma jeszcze identyfikatorów (nadaje je dopiero <c>SaveChanges</c>),
/// więc węzeł kopii jest rozpoznawany po ścieżce od korzenia — łańcuchu par
/// „obiekt@pozycja" — a nie po identyfikatorze. Oczekiwane ścieżki, listy
/// kategorii i nazwy są wpisane w testach. Odczyt wzorca z bazy, zapis grafu
/// i porażki kopii przypina <see cref="RegistrationTemplateIntegrationTests"/>.
/// </summary>
public class ScreenTemplateRulesTests
{
    private const string UserId = "konto-nowe";

    private const string Login = "jan.kowalski";

    // Obiekty słownika.
    private const int A = 11, B = 12, C = 13, D = 14, E = 15, F = 16;

    // Kategorie.
    private const int K1 = 21, K2 = 22, K3 = 23;

    // --- Struktura ----------------------------------------------------------

    [Fact]
    public void Clone_of_a_multi_root_tree_keeps_every_parent_object_and_position()
    {
        // A → [B → [D], C] oraz E → [F, B]; wiersze celowo nie w kolejności
        // „rodzic przed dzieckiem", identyfikatory wzorca rozrzucone.
        var template = Snapshot(
        [
            new TemplateNode(104, 102, D, 0),
            new TemplateNode(101, null, A, 0),
            new TemplateNode(106, 105, F, 0),
            new TemplateNode(102, 101, B, 0),
            new TemplateNode(103, 101, C, 1),
            new TemplateNode(105, null, E, 1),
            new TemplateNode(107, 105, B, 1),
        ]);

        var (tree, _) = ScreenTemplateRules.Clone(template, UserId, Login);

        Assert.Equal(
            [
                "A@0",
                "A@0/B@0",
                "A@0/B@0/D@0",
                "A@0/C@1",
                "E@1",
                "E@1/B@1",
                "E@1/F@0",
            ],
            tree.Nodes.Select(PathOf).Order(StringComparer.Ordinal));

        // Każdy rodzic jest węzłem kopii, nie wzorca, a każdy węzeł należy do
        // drzewa kopii.
        Assert.All(tree.Nodes, node =>
        {
            Assert.Same(tree, node.Tree);
            Assert.Equal(0, node.Id);

            if (node.Parent is not null)
            {
                Assert.Contains(node.Parent, tree.Nodes);
            }
        });
    }

    // --- Przypisania --------------------------------------------------------

    [Fact]
    public void Node_assignments_differing_from_the_default_list_land_on_the_matching_cloned_nodes()
    {
        // A → [B, C] oraz D; lista domyślna [K1, K2]. B dopasowany do [K3, K1],
        // C z zerem kategorii, A i D z domyślnymi.
        var template = Snapshot(
            [
                new TemplateNode(1, null, A, 0),
                new TemplateNode(2, 1, B, 0),
                new TemplateNode(3, 1, C, 1),
                new TemplateNode(4, null, D, 1),
            ],
            defaults: [new(K1, 0), new(K2, 1)],
            assignments:
            [
                new(1, K1, 0), new(1, K2, 1),
                new(2, K3, 0), new(2, K1, 1),
                new(4, K1, 0), new(4, K2, 1),
            ]);

        var (tree, screen) = ScreenTemplateRules.Clone(template, UserId, Login);

        var byNode = screen.NodeCategories
            .GroupBy(assignment => PathOf(assignment.Node))
            .ToDictionary(
                group => group.Key,
                group => group.OrderBy(assignment => assignment.Position).Select(a => a.CategoryId).ToList());

        Assert.Equal(new[] { K1, K2 }, byNode["A@0"]);
        Assert.Equal(new[] { K3, K1 }, byNode["A@0/B@0"]);
        Assert.Equal(new[] { K1, K2 }, byNode["D@1"]);
        Assert.False(byNode.ContainsKey("A@0/C@1"), "Węzeł z zerem kategorii dostał przypisania.");
        Assert.Equal(6, screen.NodeCategories.Count);

        Assert.All(screen.NodeCategories, assignment => Assert.Contains(assignment.Node, tree.Nodes));
        Assert.Equal(
            [(K1, 0), (K2, 1)],
            screen.DefaultCategories.Select(entry => (entry.CategoryId, entry.Position)));
    }

    [Fact]
    public void Screen_of_the_clone_points_at_the_cloned_tree_and_keeps_the_grain()
    {
        var template = Snapshot([new TemplateNode(1, null, A, 0)], grainMinutes: 5);

        var (tree, screen) = ScreenTemplateRules.Clone(template, UserId, Login);

        Assert.Same(tree, screen.Tree);
        Assert.Equal(5, screen.GrainMinutes);
    }

    // --- Nazwy --------------------------------------------------------------

    [Fact]
    public void Clone_names_carry_the_login_and_their_normalized_form()
    {
        var template = Snapshot([new TemplateNode(1, null, A, 0)]);

        var (tree, screen) = ScreenTemplateRules.Clone(template, UserId, Login);

        Assert.Equal("Testowy ekran prezentacyjny dla jan.kowalski", screen.Name);
        Assert.Equal("TESTOWY EKRAN PREZENTACYJNY DLA JAN.KOWALSKI", screen.NormalizedName);
        Assert.Equal(ScreenRules.Normalize(screen.Name), screen.NormalizedName);

        Assert.Equal("Drzewo testowe na potrzeby prezentacji jan.kowalski", tree.Name);
        Assert.Equal("DRZEWO TESTOWE NA POTRZEBY PREZENTACJI JAN.KOWALSKI", tree.NormalizedName);
        Assert.Equal(TreeNameRules.Normalize(tree.Name), tree.NormalizedName);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(64)]
    public void Template_name_near_the_limit_is_cut_so_the_clone_name_has_exactly_the_maximum_length(int loginLength)
    {
        // Limit nazwy 200 znaków (plany `budowa-drzewa`, `zapisane-ekrany`)
        // i login od 3 do 64 znaków (plan `zakladanie-konta`).
        const int maxLength = 200;
        var login = new string('l', loginLength);
        var template = Snapshot(
            [new TemplateNode(1, null, A, 0)],
            screenName: new string('e', 199),
            treeName: new string('d', 199));

        var (tree, screen) = ScreenTemplateRules.Clone(template, UserId, login);

        Assert.Equal(maxLength, screen.Name.Length);
        Assert.EndsWith($" dla {login}", screen.Name);
        Assert.Equal(new string('e', maxLength - " dla ".Length - login.Length), screen.Name[..^($" dla {login}".Length)]);

        Assert.Equal(maxLength, tree.Name.Length);
        Assert.EndsWith($" {login}", tree.Name);
        Assert.Equal(new string('d', maxLength - 1 - login.Length), tree.Name[..^($" {login}".Length)]);
    }

    // --- Flaga i właściciel -------------------------------------------------

    [Fact]
    public void Clone_is_not_a_template_and_belongs_to_the_given_account()
    {
        var template = Snapshot([new TemplateNode(1, null, A, 0)]);

        var (tree, screen) = ScreenTemplateRules.Clone(template, UserId, Login);

        Assert.False(tree.IsTemplate);
        Assert.False(screen.IsTemplate);
        Assert.Equal(UserId, tree.UserId);
        Assert.Equal(UserId, screen.UserId);
    }

    // --- Niespójny wzorzec --------------------------------------------------

    [Fact]
    public void Assignment_pointing_at_a_node_outside_the_snapshot_is_refused()
    {
        var template = Snapshot(
            [new TemplateNode(1, null, A, 0)],
            defaults: [new(K1, 0)],
            assignments: [new(1, K1, 0), new(99, K1, 0)]);

        Assert.Throws<InvalidOperationException>(() => ScreenTemplateRules.Clone(template, UserId, Login));
    }

    [Fact]
    public void Node_with_a_parent_outside_the_snapshot_is_refused()
    {
        var template = Snapshot([new TemplateNode(1, null, A, 0), new TemplateNode(2, 99, B, 0)]);

        Assert.Throws<InvalidOperationException>(() => ScreenTemplateRules.Clone(template, UserId, Login));
    }

    // --- Pomocnicze ----------------------------------------------------------

    private static ScreenTemplateSnapshot Snapshot(
        IReadOnlyList<TemplateNode> nodes,
        IReadOnlyList<TemplateDefaultCategory>? defaults = null,
        IReadOnlyList<TemplateAssignment>? assignments = null,
        int grainMinutes = 15,
        string screenName = "Testowy ekran prezentacyjny",
        string treeName = "Drzewo testowe na potrzeby prezentacji")
        => new(screenName, treeName, grainMinutes, nodes, defaults ?? [], assignments ?? []);

    /// <summary>Ścieżka węzła od korzenia: „A@0/B@1" — litera obiektu i pozycja na każdym poziomie.</summary>
    private static string PathOf(TreeNode node)
    {
        var steps = new List<string>();

        for (var current = node; current is not null; current = current.Parent)
        {
            steps.Add($"{Letter(current.ObjectId)}@{current.Position}");
        }

        steps.Reverse();

        return string.Join('/', steps);
    }

    private static string Letter(int objectId) => objectId switch
    {
        A => "A",
        B => "B",
        C => "C",
        D => "D",
        E => "E",
        F => "F",
        _ => objectId.ToString(System.Globalization.CultureInfo.InvariantCulture),
    };
}
