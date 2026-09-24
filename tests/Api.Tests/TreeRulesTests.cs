using System.Text.Json;
using Api.Data;
using Api.Errors;
using Api.Objects;
using Api.Tree;

namespace Api.Tests;

/// <summary>
/// Regresja reguł drzewa roboczego — limitu rozmiaru, zapętlenia po ścieżce
/// przodków, duplikatu rodzeństwa i przenumerowania pozycji — oraz kształtu
/// odmów drzewa i nazw, które muszą się zgadzać po obu stronach granicy.
///
/// Wzorem <see cref="ObjectRulesTests"/> testy nie podnoszą hosta ani bazy.
/// Reguły są czystymi funkcjami (<see cref="TreeRules"/>) właśnie po to, żeby
/// dało się je sprawdzić na danych w pamięci; transakcja, klucze obce, odczyt
/// nagłówka i pełna ścieżka HTTP mają weryfikację ręczną.
/// </summary>
public class TreeRulesTests
{
    /// <summary>
    /// Pola <c>ProblemDetails</c> (RFC 9457) — domyślny kształt błędu w ASP.NET
    /// Core i dokładnie ten dryf, przed którym broni zapis w CLAUDE.md.
    /// </summary>
    private static readonly string[] ProblemDetailsFields = ["type", "title", "status", "detail"];

    // Obiekty słownika nazwane tak, jak w opisach przypadków.
    private const int Gpz01 = 1, L2 = 5, L1 = 7;

    private const int A = 11, B = 12, C = 13, D = 14, X = 15;

    // --- Limit rozmiaru -----------------------------------------------------

    [Fact]
    public void Tree_one_node_below_the_limit_accepts_another_node()
    {
        Assert.False(TreeRules.IsFull(TreeNode.MaxNodesPerTree - 1, TreeNode.MaxNodesPerTree));
    }

    [Fact]
    public void Tree_at_the_limit_accepts_no_more_nodes()
    {
        Assert.True(TreeRules.IsFull(TreeNode.MaxNodesPerTree, TreeNode.MaxNodesPerTree));
    }

    // --- Konflikt przodków --------------------------------------------------

    [Fact]
    public void Adding_at_the_top_level_is_never_a_conflict()
    {
        Assert.Null(TreeRules.FindConflictOnAdd([], A));
    }

    [Fact]
    public void Object_added_under_itself_is_a_conflict_of_length_one()
    {
        var conflict = TreeRules.FindConflictOnAdd([A, X], X);

        Assert.NotNull(conflict);
        Assert.Equal([X, X], conflict);
    }

    [Fact]
    public void Direct_conflict_is_reported_from_the_ancestor_occurrence()
    {
        // A → B w drzewie; dodanie A pod B stawia A na jego własnej ścieżce.
        var conflict = TreeRules.FindConflictOnAdd([A, B], A);

        Assert.NotNull(conflict);
        Assert.Equal([A, B, A], conflict);
    }

    [Fact]
    public void Deep_conflict_is_reported_as_the_full_path_in_order()
    {
        // Przodkowie GPZ-01 → L1 → L2, dodawany GPZ-01.
        var conflict = TreeRules.FindConflictOnAdd([Gpz01, L1, L2], Gpz01);

        // Kolejność jest częścią wyniku: z niej powstaje komunikat
        // „GPZ-01 → L1 → L2 → GPZ-01".
        Assert.NotNull(conflict);
        Assert.Equal([Gpz01, L1, L2, Gpz01], conflict);
    }

    [Fact]
    public void Same_objects_in_reversed_order_in_another_branch_are_not_a_conflict()
    {
        // Gałąź 1: A → B. Gałąź 2: B na najwyższym poziomie, pod nim ma
        // stanąć A. Ścieżka nowego wystąpienia A to [B] — A na niej nie stoi.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, A, 0),
            new TreeNodeEntry(2, 1, B, 0),
            new TreeNodeEntry(3, null, B, 1),
        ]);

        Assert.Null(TreeRules.FindConflictOnAdd(tree.AncestorObjectPath(3), A));
    }

    [Fact]
    public void Moving_a_node_under_its_own_descendant_is_a_conflict()
    {
        // A → B → C; przeniesienie A pod C.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, A, 0),
            new TreeNodeEntry(2, 1, B, 0),
            new TreeNodeEntry(3, 2, C, 0),
        ]);

        var conflict = TreeRules.FindConflictOnMove(tree, nodeId: 1, targetParentId: 3);

        Assert.NotNull(conflict);
        Assert.Equal([A, B, C, A], conflict);
    }

    [Fact]
    public void Moving_a_node_under_itself_is_a_conflict_of_length_one()
    {
        var tree = new TreeSnapshot([new TreeNodeEntry(1, null, A, 0)]);

        Assert.Equal([A, A], TreeRules.FindConflictOnMove(tree, nodeId: 1, targetParentId: 1));
    }

    [Fact]
    public void Moving_a_subtree_whose_descendant_repeats_a_target_ancestor_is_a_conflict()
    {
        // Gałąź 1: A → B. Gałąź 2: C → A. Przeniesienie C (z A pod spodem)
        // pod B daje ścieżkę A → B → C → A.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, A, 0),
            new TreeNodeEntry(2, 1, B, 0),
            new TreeNodeEntry(3, null, C, 1),
            new TreeNodeEntry(4, 3, A, 0),
        ]);

        Assert.Equal([A, B, C, A], TreeRules.FindConflictOnMove(tree, nodeId: 3, targetParentId: 2));
    }

    [Fact]
    public void Moving_a_node_to_the_top_level_or_to_an_unrelated_branch_is_not_a_conflict()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, A, 0),
            new TreeNodeEntry(2, 1, B, 0),
            new TreeNodeEntry(3, 2, C, 0),
            new TreeNodeEntry(4, null, D, 1),
        ]);

        Assert.Null(TreeRules.FindConflictOnMove(tree, nodeId: 3, targetParentId: null));
        Assert.Null(TreeRules.FindConflictOnMove(tree, nodeId: 2, targetParentId: 4));
    }

    // --- Duplikat rodzeństwa ------------------------------------------------

    private static readonly TreeSnapshot SiblingTree = new(
    [
        new TreeNodeEntry(1, null, A, 0),
        new TreeNodeEntry(2, 1, B, 0),
        new TreeNodeEntry(3, 1, C, 1),
        new TreeNodeEntry(4, null, D, 1),
    ]);

    [Fact]
    public void Object_already_under_the_parent_is_a_duplicate()
    {
        Assert.True(TreeRules.HasDuplicateSibling(SiblingTree.ChildrenOf(1), B, exceptNodeId: null));
    }

    [Fact]
    public void Object_already_at_the_top_level_is_a_duplicate()
    {
        Assert.True(TreeRules.HasDuplicateSibling(SiblingTree.ChildrenOf(null), A, exceptNodeId: null));
    }

    [Fact]
    public void Same_object_under_another_parent_is_allowed()
    {
        Assert.False(TreeRules.HasDuplicateSibling(SiblingTree.ChildrenOf(4), B, exceptNodeId: null));
        Assert.False(TreeRules.HasDuplicateSibling(SiblingTree.ChildrenOf(null), B, exceptNodeId: null));
    }

    [Fact]
    public void Reordering_a_node_within_its_parent_is_not_a_duplicate_of_itself()
    {
        Assert.False(TreeRules.HasDuplicateSibling(SiblingTree.ChildrenOf(1), B, exceptNodeId: 2));
    }

    // --- Przenumerowanie ----------------------------------------------------

    [Fact]
    public void Appending_at_the_end_keeps_positions_contiguous()
    {
        var order = TreeRules.InsertAt([10, 11, 12], 13, 3);

        AssertContiguous([10, 11, 12, 13], order);
    }

    [Fact]
    public void Removing_from_the_middle_keeps_positions_contiguous()
    {
        var order = TreeRules.Without([10, 11, 12], 11);

        AssertContiguous([10, 12], order);
    }

    [Fact]
    public void Moving_down_within_the_parent_counts_the_position_after_removal()
    {
        // 10 na indeks 2 wśród [11, 12, 13] — po zdjęciu, nie przed nim.
        var order = TreeRules.InsertAt(TreeRules.Without([10, 11, 12, 13], 10), 10, 2);

        AssertContiguous([11, 12, 10, 13], order);
    }

    [Fact]
    public void Moving_up_within_the_parent_keeps_positions_contiguous()
    {
        var order = TreeRules.InsertAt(TreeRules.Without([10, 11, 12, 13], 13), 13, 0);

        AssertContiguous([13, 10, 11, 12], order);
    }

    [Fact]
    public void Insert_position_outside_the_sibling_range_is_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => TreeRules.InsertAt([10, 11], 12, 3));
        Assert.Throws<ArgumentOutOfRangeException>(() => TreeRules.InsertAt([10, 11], 12, -1));
    }

    [Fact]
    public void Snapshot_reads_siblings_in_position_order_and_the_ancestor_path_from_the_root()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(3, 1, C, 1),
            new TreeNodeEntry(2, 1, B, 0),
            new TreeNodeEntry(1, null, A, 0),
        ]);

        Assert.Equal([2, 3], tree.ChildrenOf(1).Select(node => node.Id));
        Assert.Equal([A, C], tree.AncestorObjectPath(3));
        Assert.Empty(tree.AncestorObjectPath(null));
    }

    // --- Koperty ------------------------------------------------------------

    [Fact]
    public void Cycle_refusal_has_the_contract_shape_with_the_path_of_codes()
    {
        string[] path = ["GPZ-01", "L1", "L2", "GPZ-01"];

        using var document = Serialize(TreeResponses.Cycle(TreeOperation.Add, "GPZ-01", path));

        var error = AssertEnvelope(document, "tree_cycle", ApiErrorCodes.TreeCycle);

        Assert.Equal(
            "Dodanie obiektu GPZ-01 utworzyłoby zapętlenie: GPZ-01 → L1 → L2 → GPZ-01.",
            error.GetProperty("message").GetString());

        var context = error.GetProperty("context");

        Assert.Equal(["path"], PropertyNames(context));
        Assert.Equal(path, StringValues(context.GetProperty(TreeResponses.PathContextKey)));
    }

    [Fact]
    public void Cycle_refusal_for_a_move_names_the_moved_node()
    {
        using var document = Serialize(TreeResponses.Cycle(TreeOperation.Move, "L2", ["L2", "T5", "L2"]));

        Assert.Equal(
            "Przeniesienie węzła L2 utworzyłoby zapętlenie: L2 → T5 → L2.",
            document.RootElement.GetProperty("error").GetProperty("message").GetString());
    }

    [Fact]
    public void Duplicate_sibling_refusal_has_the_contract_shape()
    {
        using var document = Serialize(TreeResponses.DuplicateSibling("L1", "GPZ-01"));

        var error = AssertEnvelope(document, "tree_duplicate_sibling", ApiErrorCodes.TreeDuplicateSibling);

        Assert.Equal(
            "Obiekt L1 jest już podobiektem GPZ-01 w tym miejscu drzewa.",
            error.GetProperty("message").GetString());

        var context = error.GetProperty("context");

        Assert.Equal(["objectCode"], PropertyNames(context));
        Assert.Equal("L1", context.GetProperty(TreeResponses.ObjectCodeContextKey).GetString());
    }

    [Fact]
    public void Duplicate_sibling_refusal_at_the_top_level_says_so()
    {
        using var document = Serialize(TreeResponses.DuplicateSibling("L1", parentCode: null));

        Assert.Equal(
            "Obiekt L1 jest już na najwyższym poziomie drzewa.",
            document.RootElement.GetProperty("error").GetProperty("message").GetString());
    }

    [Fact]
    public void Too_large_refusal_has_the_contract_shape()
    {
        using var document = Serialize(TreeResponses.TooLarge(TreeNode.MaxNodesPerTree, 2000, 1));

        var error = AssertEnvelope(document, "tree_too_large", ApiErrorCodes.TreeTooLarge);

        Assert.Equal("Drzewo przekroczyłoby limit 2000 węzłów.", error.GetProperty("message").GetString());

        var context = error.GetProperty("context");

        Assert.Equal(["limit", "current", "adding"], PropertyNames(context));
        Assert.Equal(2000, context.GetProperty(TreeResponses.LimitContextKey).GetInt32());
        Assert.Equal(2000, context.GetProperty(TreeResponses.CurrentContextKey).GetInt32());
        Assert.Equal(1, context.GetProperty(TreeResponses.AddingContextKey).GetInt32());
    }

    [Fact]
    public void Object_in_tree_refusal_has_an_empty_context_without_owner_information()
    {
        using var document = Serialize(ObjectResponses.DescribeTreeUsageRefusal("L1"));

        var error = AssertEnvelope(document, "object_in_tree", ApiErrorCodes.ObjectInTree);

        Assert.Equal(
            "Obiekt „L1\" jest użyty w strukturze drzewa i nie można go usunąć.",
            error.GetProperty("message").GetString());

        // Słownik jest wspólny, drzewa prywatne — odmowa nie niesie niczego
        // o cudzym drzewie.
        Assert.Empty(PropertyNames(error.GetProperty("context")));
    }

    [Fact]
    public void Missing_identity_refusal_has_the_contract_shape()
    {
        using var document = Serialize(TreeIdentity.MissingIdentityError());

        var error = AssertEnvelope(document, "unauthorized", ApiErrorCodes.Unauthorized);

        Assert.Equal("Brak tożsamości użytkownika.", error.GetProperty("message").GetString());
        Assert.Empty(PropertyNames(error.GetProperty("context")));
    }

    // --- Nazwy po obu stronach granicy --------------------------------------

    [Fact]
    public void Identity_header_matches_the_react_router_client()
    {
        // Literał musi być identyczny z `USER_HEADER` w `app/lib/api.server.ts`;
        // rozjazd daje 401 na każdym żądaniu drzewa, bez żadnego błędu budowania.
        Assert.Equal("X-TreeGrid-User", TreeIdentity.UserHeader);
    }

    [Fact]
    public void Request_field_names_match_the_react_router_client()
    {
        Assert.Equal("name", TreeRequestFields.Name);
        Assert.Equal("objectId", TreeRequestFields.ObjectId);
        Assert.Equal("parentId", TreeRequestFields.ParentId);
        Assert.Equal("position", TreeRequestFields.Position);
    }

    // --- Pomocnicze ---------------------------------------------------------

    private static void AssertContiguous(int[] expectedOrder, IReadOnlyList<int> order)
    {
        Assert.Equal(expectedOrder, order);

        var positions = TreeRules.AssignPositions(order);

        Assert.Equal(Enumerable.Range(0, order.Count), order.Select(id => positions[id]));
    }

    private static JsonElement AssertEnvelope(JsonDocument document, string expectedCode, string constant)
    {
        var root = document.RootElement;
        var error = root.GetProperty("error");

        Assert.Equal(["error"], PropertyNames(root));
        Assert.Equal(["code", "message", "context"], PropertyNames(error));
        Assert.Equal(expectedCode, constant);
        Assert.Equal(expectedCode, error.GetProperty("code").GetString());

        foreach (var field in ProblemDetailsFields)
        {
            Assert.False(root.TryGetProperty(field, out _), $"Korzeń odpowiedzi zawiera pole '{field}'.");
            Assert.False(error.TryGetProperty(field, out _), $"Obiekt błędu zawiera pole '{field}'.");
        }

        return error;
    }

    private static JsonDocument Serialize(ApiError error)
        => JsonDocument.Parse(JsonSerializer.Serialize(error));

    private static string[] PropertyNames(JsonElement element)
        => [.. element.EnumerateObject().Select(property => property.Name)];

    // `null` z elementu JSON `null` przechodzi dalej i przegrywa porównanie
    // z oczekiwanym kodem — wykrzyknik ucisza wyłącznie ostrzeżenie typu.
    private static string[] StringValues(JsonElement array)
        => [.. array.EnumerateArray().Select(item => item.GetString()!)];
}
