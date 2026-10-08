using System.Text.Json;
using Api.Data;
using Api.Errors;
using Api.Objects;
using Api.Tree;

namespace Api.Tests;

/// <summary>
/// Regresja reguł drzewa roboczego — limitu rozmiaru, reguły użycia obiektów
/// (FR-004) i przenumerowania pozycji — oraz kształtu odmów drzewa i nazw,
/// które muszą się zgadzać po obu stronach granicy. Oczekiwane werdykty są
/// wpisane w testach, a nie liczone regułą.
///
/// Wzorem <see cref="ObjectRulesTests"/> testy nie podnoszą hosta ani bazy.
/// Reguły są czystymi funkcjami (<see cref="TreeRules"/>) właśnie po to, żeby
/// dało się je sprawdzić na danych w pamięci. Transakcję i pełną ścieżkę HTTP
/// operacji na węzłach przypina <see cref="TreeIntegrationTests"/>, a klucze
/// obce i odczyt nagłówka tożsamości — <see cref="ApiHostIntegrationTests"/>.
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

    private const int A = 11, B = 12, C = 13, D = 14, X = 15, S = 16;

    // Obiekty korzeni.
    private const int R1 = 21, R2 = 22;

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

    // --- Użycie obiektów: dodanie nowego korzenia --------------------------

    [Fact]
    public void Adding_a_new_root_with_an_unused_object_is_allowed()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
        ]);

        Assert.Null(TreeRules.FindReuseOnAdd(tree, parentId: null, X));
        Assert.Null(TreeRules.FindReuseOnAdd(new TreeSnapshot([]), parentId: null, X));
    }

    [Fact]
    public void Adding_a_new_root_whose_object_is_already_a_root_is_refused_as_a_root()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, null, R2, 1),
        ]);

        Assert.Equal(new TreeReuse(R1, R1, IsRoot: true), TreeRules.FindReuseOnAdd(tree, parentId: null, R1));
    }

    [Fact]
    public void Adding_a_new_root_whose_object_stands_under_roots_names_the_first_root_by_position()
    {
        // X pod R2 (węzeł o niższym identyfikatorze) i głębiej pod R1. R1 stoi
        // pierwszy w kolejności pozycji, więc to jego nazywa odmowa.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R2, 1),
            new TreeNodeEntry(2, null, R1, 0),
            new TreeNodeEntry(3, 1, X, 0),
            new TreeNodeEntry(4, 2, A, 0),
            new TreeNodeEntry(5, 4, X, 0),
        ]);

        Assert.Equal(new TreeReuse(X, R1, IsRoot: false), TreeRules.FindReuseOnAdd(tree, parentId: null, X));
    }

    [Fact]
    public void Adding_a_root_object_under_another_root_is_refused_as_a_root()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
            new TreeNodeEntry(3, null, R2, 1),
        ]);

        Assert.Equal(new TreeReuse(R1, R1, IsRoot: true), TreeRules.FindReuseOnAdd(tree, parentId: 3, R1));
    }

    // --- Użycie obiektów: dodanie pod korzeniem -----------------------------

    [Fact]
    public void Adding_an_object_already_deep_under_the_same_root_is_refused_under_that_root()
    {
        // GPZ-01 → L1 → L2; drugie L2 bezpośrednio pod GPZ-01.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, Gpz01, 0),
            new TreeNodeEntry(2, 1, L1, 0),
            new TreeNodeEntry(3, 2, L2, 0),
        ]);

        Assert.Equal(new TreeReuse(L2, Gpz01, IsRoot: false), TreeRules.FindReuseOnAdd(tree, parentId: 1, L2));
    }

    [Fact]
    public void Adding_an_object_under_itself_is_refused_under_its_root()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, X, 0),
        ]);

        Assert.Equal(new TreeReuse(X, R1, IsRoot: false), TreeRules.FindReuseOnAdd(tree, parentId: 2, X));
    }

    [Fact]
    public void Adding_an_object_used_only_under_another_root_is_allowed()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, X, 0),
            new TreeNodeEntry(3, null, R2, 1),
            new TreeNodeEntry(4, 3, A, 0),
        ]);

        Assert.Null(TreeRules.FindReuseOnAdd(tree, parentId: 3, X));
        Assert.Null(TreeRules.FindReuseOnAdd(tree, parentId: 4, X));
    }

    // --- Użycie obiektów: przeniesienie poza własne poddrzewo ---------------

    [Fact]
    public void Moving_a_subtree_under_another_root_is_refused_on_its_first_repetition_in_pre_order()
    {
        // R1 → S → [A → B, C]; R2 → [C, B]. Przenoszone poddrzewo powtarza pod
        // R2 dwa obiekty: głębokie B i płytsze C. Pre-order S, A, B, C stawia B
        // pierwsze — przejście wszerz trafiłoby najpierw C (stąd identyfikatory
        // C niższy niż B).
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, S, 0),
            new TreeNodeEntry(3, 2, A, 0),
            new TreeNodeEntry(4, 2, C, 1),
            new TreeNodeEntry(5, 3, B, 0),
            new TreeNodeEntry(6, null, R2, 1),
            new TreeNodeEntry(7, 6, C, 0),
            new TreeNodeEntry(8, 6, B, 1),
        ]);

        Assert.Equal(new TreeReuse(B, R2, IsRoot: false), TreeRules.FindReuseOnMove(tree, nodeId: 2, targetParentId: 6));
    }

    [Fact]
    public void Moving_a_subtree_disjoint_from_the_target_root_is_allowed()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, S, 0),
            new TreeNodeEntry(3, 2, A, 0),
            new TreeNodeEntry(4, null, R2, 1),
            new TreeNodeEntry(5, 4, B, 0),
        ]);

        Assert.Null(TreeRules.FindReuseOnMove(tree, nodeId: 2, targetParentId: 5));
    }

    [Fact]
    public void Moving_a_root_under_a_node_of_another_root_depends_on_the_intersection()
    {
        // R1 → A i R2 → B → A: A pod dwoma korzeniami jest poprawne. R1 pod B
        // stawia oba A pod R2.
        var intersecting = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
            new TreeNodeEntry(3, null, R2, 1),
            new TreeNodeEntry(4, 3, B, 0),
            new TreeNodeEntry(5, 4, A, 0),
        ]);

        // R1 → A i R2 → B: obiekty rozłączne.
        var disjoint = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
            new TreeNodeEntry(3, null, R2, 1),
            new TreeNodeEntry(4, 3, B, 0),
        ]);

        Assert.Equal(
            new TreeReuse(A, R2, IsRoot: false),
            TreeRules.FindReuseOnMove(intersecting, nodeId: 1, targetParentId: 4));
        Assert.Null(TreeRules.FindReuseOnMove(disjoint, nodeId: 1, targetParentId: 4));
    }

    // --- Użycie obiektów: przeniesienie na najwyższy poziom -----------------

    [Fact]
    public void Moving_a_node_to_the_top_level_whose_object_stands_under_another_root_is_refused()
    {
        // X pod R1 i pod R2; X spod R2 jako nowy korzeń powtórzyłby X spod R1.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, X, 0),
            new TreeNodeEntry(3, null, R2, 1),
            new TreeNodeEntry(4, 3, X, 0),
        ]);

        Assert.Equal(new TreeReuse(X, R1, IsRoot: false), TreeRules.FindReuseOnMove(tree, nodeId: 4, targetParentId: null));
    }

    [Fact]
    public void Moving_a_node_with_a_unique_object_to_the_top_level_is_allowed()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
            new TreeNodeEntry(3, 2, B, 0),
        ]);

        Assert.Null(TreeRules.FindReuseOnMove(tree, nodeId: 2, targetParentId: null));
    }

    // --- Użycie obiektów: przeniesienie pod siebie albo pod potomka ---------

    [Fact]
    public void Moving_a_non_root_node_under_itself_or_its_descendant_is_refused_under_its_current_root()
    {
        // R1 → A → B → C.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
            new TreeNodeEntry(3, 2, B, 0),
            new TreeNodeEntry(4, 3, C, 0),
        ]);

        Assert.Equal(new TreeReuse(A, R1, IsRoot: false), TreeRules.FindReuseOnMove(tree, nodeId: 2, targetParentId: 4));
        Assert.Equal(new TreeReuse(A, R1, IsRoot: false), TreeRules.FindReuseOnMove(tree, nodeId: 2, targetParentId: 2));
    }

    [Fact]
    public void Moving_a_root_under_itself_or_its_descendant_is_refused_as_a_root()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
        ]);

        Assert.Equal(new TreeReuse(R1, R1, IsRoot: true), TreeRules.FindReuseOnMove(tree, nodeId: 1, targetParentId: 2));
        Assert.Equal(new TreeReuse(R1, R1, IsRoot: true), TreeRules.FindReuseOnMove(tree, nodeId: 1, targetParentId: 1));
    }

    // --- Użycie obiektów: zmiana kolejności i stare naruszenia --------------

    [Fact]
    public void Reordering_within_the_parent_and_among_roots_is_not_a_reuse()
    {
        // R1 → [A, B], R2 → A.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, A, 0),
            new TreeNodeEntry(3, 1, B, 1),
            new TreeNodeEntry(4, null, R2, 1),
            new TreeNodeEntry(5, 4, A, 0),
        ]);

        Assert.Null(TreeRules.FindReuseOnMove(tree, nodeId: 3, targetParentId: 1));
        Assert.Null(TreeRules.FindReuseOnMove(tree, nodeId: 4, targetParentId: null));
    }

    [Fact]
    public void An_old_violation_elsewhere_does_not_block_operations_on_disjoint_nodes()
    {
        // X dwa razy pod R1 — stan sprzed reguły, którego API nie naprawia.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, null, R1, 0),
            new TreeNodeEntry(2, 1, X, 0),
            new TreeNodeEntry(3, 1, X, 1),
            new TreeNodeEntry(4, null, R2, 1),
            new TreeNodeEntry(5, 4, A, 0),
        ]);

        Assert.Null(TreeRules.FindReuseOnAdd(tree, parentId: 1, B));
        Assert.Null(TreeRules.FindReuseOnAdd(tree, parentId: 4, B));
        Assert.Null(TreeRules.FindReuseOnMove(tree, nodeId: 5, targetParentId: null));
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
    public void Snapshot_reads_siblings_in_position_order_the_root_and_the_subtree_in_pre_order()
    {
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(3, 1, C, 1),
            new TreeNodeEntry(2, 1, B, 0),
            new TreeNodeEntry(1, null, A, 0),
            new TreeNodeEntry(4, 2, D, 0),
        ]);

        Assert.Equal([2, 3], tree.ChildrenOf(1).Select(node => node.Id));
        Assert.Equal(1, tree.RootOf(4).Id);
        Assert.Equal(1, tree.RootOf(1).Id);
        Assert.Equal([1, 2, 4, 3], tree.Subtree(1).Select(node => node.Id));
        Assert.Equal([2, 4], tree.Subtree(2).Select(node => node.Id));
    }

    [Fact]
    public void Snapshot_with_a_parent_loop_in_the_data_fails_instead_of_hanging()
    {
        // Pętla 1 → 2 → 1 powstaje wyłącznie przez zmianę pliku bazy z
        // pominięciem API; wspinaczka i przejście mają skończyć się wyjątkiem.
        var tree = new TreeSnapshot(
        [
            new TreeNodeEntry(1, 2, A, 0),
            new TreeNodeEntry(2, 1, B, 0),
        ]);

        Assert.Throws<InvalidOperationException>(() => tree.RootOf(1));
        Assert.Throws<InvalidOperationException>(() => tree.Subtree(1));
    }

    // --- Koperty ------------------------------------------------------------

    [Fact]
    public void Object_reused_refusal_under_a_root_has_the_contract_shape()
    {
        using var document = Serialize(
            TreeResponses.ObjectReused(TreeOperation.Add, "L1", "L1", "GPZ-01", isRoot: false));

        var error = AssertEnvelope(document, "tree_object_reused", ApiErrorCodes.TreeObjectReused);

        Assert.Equal(
            "Dodanie obiektu L1 powtórzyłoby obiekt L1 — występuje już pod korzeniem GPZ-01.",
            error.GetProperty("message").GetString());

        var context = error.GetProperty("context");

        Assert.Equal(["objectCode", "rootCode"], PropertyNames(context));
        Assert.Equal("L1", context.GetProperty(TreeResponses.ObjectCodeContextKey).GetString());
        Assert.Equal("GPZ-01", context.GetProperty(TreeResponses.RootCodeContextKey).GetString());
    }

    [Fact]
    public void Object_reused_refusal_for_a_move_names_the_moved_node_and_the_repeated_object()
    {
        using var document = Serialize(
            TreeResponses.ObjectReused(TreeOperation.Move, "L2", "T5", "GPZ-02", isRoot: false));

        var error = AssertEnvelope(document, "tree_object_reused", ApiErrorCodes.TreeObjectReused);

        Assert.Equal(
            "Przeniesienie węzła L2 powtórzyłoby obiekt T5 — występuje już pod korzeniem GPZ-02.",
            error.GetProperty("message").GetString());

        var context = error.GetProperty("context");

        Assert.Equal(["objectCode", "rootCode"], PropertyNames(context));
        Assert.Equal("T5", context.GetProperty(TreeResponses.ObjectCodeContextKey).GetString());
        Assert.Equal("GPZ-02", context.GetProperty(TreeResponses.RootCodeContextKey).GetString());
    }

    [Fact]
    public void Object_reused_refusal_for_a_root_says_it_is_already_a_root()
    {
        using var added = Serialize(
            TreeResponses.ObjectReused(TreeOperation.Add, "GPZ-01", "GPZ-01", "GPZ-01", isRoot: true));
        using var moved = Serialize(
            TreeResponses.ObjectReused(TreeOperation.Move, "GPZ-01", "GPZ-01", "GPZ-01", isRoot: true));

        var error = AssertEnvelope(added, "tree_object_reused", ApiErrorCodes.TreeObjectReused);

        Assert.Equal(
            "Dodanie obiektu GPZ-01 powtórzyłoby obiekt GPZ-01 — jest już korzeniem drzewa.",
            error.GetProperty("message").GetString());
        Assert.Equal(
            "Przeniesienie węzła GPZ-01 powtórzyłoby obiekt GPZ-01 — jest już korzeniem drzewa.",
            moved.RootElement.GetProperty("error").GetProperty("message").GetString());

        var context = error.GetProperty("context");

        Assert.Equal(["objectCode", "rootCode"], PropertyNames(context));
        Assert.Equal("GPZ-01", context.GetProperty(TreeResponses.ObjectCodeContextKey).GetString());
        Assert.Equal("GPZ-01", context.GetProperty(TreeResponses.RootCodeContextKey).GetString());
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
}
