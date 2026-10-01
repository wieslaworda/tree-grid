using System.Text;
using System.Text.Json;
using Api.Data;
using Api.Screens;
using Api.Tree;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Api.Tests;

/// <summary>
/// Wspólne operacje Arrange i odczyty stanu dla testów integracyjnych.
/// Seed idzie bezpośrednio przez <see cref="AppDbContext"/> hosta — szybko,
/// także dla tysięcy węzłów — a migawki czytają tabele wprost, każda nowym
/// scope i bez śledzenia. Odczyt przez <c>GET</c> nie nadaje się na wyrocznię:
/// <c>GET /screens/{id}</c> filtruje przypisania do bieżących węzłów i ukryłby
/// osierocone wiersze.
/// </summary>
/// <remarks>
/// Słowniki obiektów i kategorii są wspólne dla wszystkich kont, więc każdy
/// test nadaje swoim pozycjom własny prefiks kodu (<see cref="NewPrefix"/>),
/// a asercje zawęża do własnych identyfikatorów.
/// </remarks>
internal static class IntegrationSeed
{
    /// <summary>Unikalny prefiks kodów słownikowych jednego testu.</summary>
    public static string NewPrefix() => $"T{Guid.NewGuid():N}"[..9].ToUpperInvariant();

    /// <summary>
    /// Zakłada konto i zwraca jego identyfikator razem z klientem HTTP, który
    /// niesie go nagłówkiem tożsamości — tak jak serwer React Routera.
    /// </summary>
    public static async Task<TestAccount> CreateAccountAsync(TestApiFactory factory)
    {
        var email = $"u{Guid.NewGuid():N}@test.local";
        var user = new AppUser { UserName = email, Email = email };

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var result = await users.CreateAsync(user);

            Assert.True(
                result.Succeeded,
                "Nie udało się założyć konta testowego: " +
                string.Join("; ", result.Errors.Select(error => error.Description)));
        }

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TreeIdentity.UserHeader, user.Id);

        return new TestAccount(user.Id, client);
    }

    /// <summary>
    /// Zakłada <paramref name="count"/> obiektów słownika o kodach
    /// <c>{prefix}-{i}</c> i zwraca ich identyfikatory w tej kolejności.
    /// </summary>
    public static async Task<IReadOnlyList<int>> SeedObjectsAsync(
        TestApiFactory factory,
        string prefix,
        int count)
    {
        var objects = Enumerable.Range(0, count)
            .Select(i => $"{prefix}-{i}")
            .Select(code => new CatalogObject
            {
                Code = code,
                NormalizedCode = DictionaryCode.Normalize(code),
                Name = code,
            })
            .ToList();

        await using (factory.CreateDbScope(out var db))
        {
            db.CatalogObjects.AddRange(objects);
            await db.SaveChangesAsync();
        }

        return objects.Select(o => o.Id).ToList();
    }

    /// <summary>
    /// Zakłada <paramref name="count"/> kategorii o kodach <c>{prefix}-K{i}</c>
    /// i zwraca ich identyfikatory w tej kolejności.
    /// </summary>
    public static async Task<IReadOnlyList<int>> SeedCategoriesAsync(
        TestApiFactory factory,
        string prefix,
        int count)
    {
        var categories = Enumerable.Range(0, count)
            .Select(i => $"{prefix}-K{i}")
            .Select(code => new Category
            {
                Code = code,
                NormalizedCode = DictionaryCode.Normalize(code),
                Name = code,
                AggregateFunction = AggregateFunction.Sum,
            })
            .ToList();

        await using (factory.CreateDbScope(out var db))
        {
            db.Categories.AddRange(categories);
            await db.SaveChangesAsync();
        }

        return categories.Select(c => c.Id).ToList();
    }

    /// <summary>Zakłada puste drzewo konta i zwraca jego identyfikator.</summary>
    public static async Task<int> SeedTreeAsync(TestApiFactory factory, string userId, string name)
    {
        var tree = new UserTree
        {
            UserId = userId,
            Name = name,
            NormalizedName = TreeNameRules.Normalize(name),
        };

        await using (factory.CreateDbScope(out var db))
        {
            db.Trees.Add(tree);
            await db.SaveChangesAsync();
        }

        return tree.Id;
    }

    /// <summary>
    /// Dokłada pod <paramref name="parentId"/> (<c>null</c> — najwyższy poziom)
    /// po jednym węźle na obiekt, w podanej kolejności, z pozycjami ciągłymi za
    /// istniejącym rodzeństwem — jednym <c>SaveChanges</c>, więc także hurtowo
    /// (np. 2000 węzłów). Seed omija reguły drzewa, dlatego obiekty mają być
    /// różne i nieobecne na ścieżce przodków rodzica: wywołujący odpowiada za
    /// to, żeby stan wyjściowy był stanem, który API mogłoby przyjąć.
    /// </summary>
    public static async Task<IReadOnlyList<int>> SeedNodesAsync(
        TestApiFactory factory,
        int treeId,
        int? parentId,
        IReadOnlyList<int> objectIds)
    {
        await using (factory.CreateDbScope(out var db))
        {
            var start = await db.TreeNodes
                .CountAsync(node => node.TreeId == treeId && node.ParentId == parentId);

            var nodes = objectIds
                .Select((objectId, i) => new TreeNode
                {
                    TreeId = treeId,
                    ParentId = parentId,
                    ObjectId = objectId,
                    Position = start + i,
                })
                .ToList();

            db.TreeNodes.AddRange(nodes);
            await db.SaveChangesAsync();

            return nodes.Select(node => node.Id).ToList();
        }
    }

    /// <summary>
    /// Zakłada ekran konta na drzewie <paramref name="treeId"/> z listą
    /// domyślną w podanej kolejności i — tak jak zapis nowego ekranu (FR-009) —
    /// przypisuje tę listę każdemu bieżącemu węzłowi drzewa, z pozycjami
    /// ciągłymi od 0. Stan jest wypisany ręcznie, a nie przez
    /// <c>ScreenRules.Materialize</c>: seed nie może dziedziczyć błędu reguły,
    /// którą testy mają złapać.
    /// </summary>
    public static async Task<int> SeedScreenAsync(
        TestApiFactory factory,
        string userId,
        int treeId,
        string name,
        int grainMinutes,
        IReadOnlyList<int> defaultCategoryIds)
    {
        await using (factory.CreateDbScope(out var db))
        {
            var nodeIds = await db.TreeNodes
                .AsNoTracking()
                .Where(node => node.TreeId == treeId)
                .OrderBy(node => node.Id)
                .Select(node => node.Id)
                .ToListAsync();

            var screen = new Screen
            {
                UserId = userId,
                TreeId = treeId,
                Name = name,
                NormalizedName = ScreenRules.Normalize(name),
                GrainMinutes = grainMinutes,
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
                    .. nodeIds.SelectMany(nodeId => defaultCategoryIds.Select((categoryId, position) =>
                        new ScreenNodeCategory
                        {
                            TreeNodeId = nodeId,
                            CategoryId = categoryId,
                            Position = position,
                        })),
                ],
            };

            db.Screens.Add(screen);
            await db.SaveChangesAsync();

            return screen.Id;
        }
    }

    /// <summary>
    /// Zastępuje kategorie jednego węzła w jednym ekranie listą w podanej
    /// kolejności (pozycje od 0) — dopasowanie węzła (S-04, US-02) zapisane
    /// wprost w tabeli, bez potoku HTTP.
    /// </summary>
    public static async Task SetNodeCategoriesAsync(
        TestApiFactory factory,
        int screenId,
        int nodeId,
        IReadOnlyList<int> categoryIds)
    {
        await using (factory.CreateDbScope(out var db))
        {
            await db.ScreenNodeCategories
                .Where(row => row.ScreenId == screenId && row.TreeNodeId == nodeId)
                .ExecuteDeleteAsync();

            db.ScreenNodeCategories.AddRange(categoryIds.Select((categoryId, position) => new ScreenNodeCategory
            {
                ScreenId = screenId,
                TreeNodeId = nodeId,
                CategoryId = categoryId,
                Position = position,
            }));

            await db.SaveChangesAsync();
        }
    }

    // --- Migawki ------------------------------------------------------------

    /// <summary>
    /// Nazwa drzewa (<c>null</c>, gdy drzewa nie ma) i jego węzły uporządkowane
    /// po identyfikatorze.
    /// </summary>
    public static async Task<TreeStateSnapshot> ReadTreeAsync(TestApiFactory factory, int treeId)
    {
        await using (factory.CreateDbScope(out var db))
        {
            var name = await db.Trees
                .AsNoTracking()
                .Where(tree => tree.Id == treeId)
                .Select(tree => tree.Name)
                .SingleOrDefaultAsync();

            var nodes = await db.TreeNodes
                .AsNoTracking()
                .Where(node => node.TreeId == treeId)
                .OrderBy(node => node.Id)
                .Select(node => new NodeRow(node.Id, node.ParentId, node.ObjectId, node.Position))
                .ToListAsync();

            return new TreeStateSnapshot(name, nodes);
        }
    }

    /// <summary>
    /// Przypisania kategorii do węzłów wskazanych ekranów, odczytane wprost
    /// z tabeli, uporządkowane po ekranie, węźle i pozycji.
    /// </summary>
    public static async Task<IReadOnlyList<AssignmentRow>> ReadAssignmentsAsync(
        TestApiFactory factory,
        params int[] screenIds)
    {
        await using (factory.CreateDbScope(out var db))
        {
            return await db.ScreenNodeCategories
                .AsNoTracking()
                .Where(row => screenIds.Contains(row.ScreenId))
                .OrderBy(row => row.ScreenId)
                .ThenBy(row => row.TreeNodeId)
                .ThenBy(row => row.Position)
                .ThenBy(row => row.CategoryId)
                .Select(row => new AssignmentRow(row.ScreenId, row.TreeNodeId, row.CategoryId, row.Position))
                .ToListAsync();
        }
    }

    /// <summary>
    /// Listy kategorii domyślnych wskazanych ekranów, uporządkowane po ekranie
    /// i pozycji.
    /// </summary>
    public static async Task<IReadOnlyList<DefaultCategoryRow>> ReadDefaultCategoriesAsync(
        TestApiFactory factory,
        params int[] screenIds)
    {
        await using (factory.CreateDbScope(out var db))
        {
            return await db.ScreenDefaultCategories
                .AsNoTracking()
                .Where(row => screenIds.Contains(row.ScreenId))
                .OrderBy(row => row.ScreenId)
                .ThenBy(row => row.Position)
                .ThenBy(row => row.CategoryId)
                .Select(row => new DefaultCategoryRow(row.ScreenId, row.CategoryId, row.Position))
                .ToListAsync();
        }
    }

    /// <summary>Nagłówek ekranu albo <c>null</c>, gdy ekranu nie ma.</summary>
    public static async Task<ScreenHeaderRow?> ReadScreenHeaderAsync(TestApiFactory factory, int screenId)
    {
        await using (factory.CreateDbScope(out var db))
        {
            return await db.Screens
                .AsNoTracking()
                .Where(screen => screen.Id == screenId)
                .Select(screen => new ScreenHeaderRow(screen.Name, screen.TreeId, screen.GrainMinutes))
                .SingleOrDefaultAsync();
        }
    }

    /// <summary>
    /// Pełny stan jednego ekranu w bazie: nagłówek, lista domyślna
    /// i przypisania — do porównań „stan po == stan przed".
    /// </summary>
    public static async Task<ScreenStateSnapshot> ReadScreenAsync(TestApiFactory factory, int screenId)
        => new(
            await ReadScreenHeaderAsync(factory, screenId),
            await ReadDefaultCategoriesAsync(factory, screenId),
            await ReadAssignmentsAsync(factory, screenId));

    // --- Koperta błędu ------------------------------------------------------

    /// <summary>
    /// Odczyt koperty <c>{ error: { code, message, context } }</c> z odpowiedzi.
    /// Brak któregokolwiek pola jest błędem asercji, a nie pustą wartością —
    /// kształt koperty jest częścią kontraktu na równi z kodem.
    /// </summary>
    public static async Task<ErrorEnvelope> ReadErrorAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        using var document = JsonDocument.Parse(body);

        Assert.True(
            document.RootElement.TryGetProperty("error", out var error)
                && error.ValueKind == JsonValueKind.Object,
            $"Odpowiedź nie ma koperty błędu: {body}");

        Assert.True(error.TryGetProperty("code", out var code), $"Koperta bez pola 'code': {body}");
        Assert.True(error.TryGetProperty("message", out var message), $"Koperta bez pola 'message': {body}");
        Assert.True(error.TryGetProperty("context", out var context), $"Koperta bez pola 'context': {body}");
        Assert.Equal(JsonValueKind.Object, context.ValueKind);

        return new ErrorEnvelope(code.GetString()!, message.GetString()!, context.Clone());
    }
}

/// <summary>Konto testowe i klient HTTP niosący jego tożsamość.</summary>
internal sealed record TestAccount(string Id, HttpClient Client);

/// <summary>Wiersz tabeli węzłów w migawce drzewa.</summary>
internal sealed record NodeRow(int Id, int? ParentId, int ObjectId, int Position);

/// <summary>Wiersz tabeli przypisań kategorii do węzłów ekranu.</summary>
internal sealed record AssignmentRow(int ScreenId, int TreeNodeId, int CategoryId, int Position);

/// <summary>Wiersz listy kategorii domyślnych ekranu.</summary>
internal sealed record DefaultCategoryRow(int ScreenId, int CategoryId, int Position);

/// <summary>Nagłówek ekranu w migawce.</summary>
internal sealed record ScreenHeaderRow(string Name, int TreeId, int GrainMinutes);

/// <summary>Odczytana koperta błędu.</summary>
internal sealed record ErrorEnvelope(string Code, string Message, JsonElement Context);

/// <summary>
/// Migawka drzewa: nazwa i węzły. Równość porównuje listę węzłów element po
/// elemencie — domyślna równość rekordu porównałaby referencje list, a test
/// „stan po == stan przed" zawsze by wtedy padał. Nazwa typu jest inna niż
/// <c>Api.Tree.TreeSnapshot</c> (struktura reguł drzewa w pamięci).
/// </summary>
internal sealed record TreeStateSnapshot(string? Name, IReadOnlyList<NodeRow> Nodes)
{
    public bool Equals(TreeStateSnapshot? other)
        => other is not null
            && Name == other.Name
            && Nodes.SequenceEqual(other.Nodes);

    public override int GetHashCode() => HashCode.Combine(Name, Nodes.Count);

    private bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"Name = {Name}, Nodes = [{string.Join(", ", Nodes)}]");

        return true;
    }
}

/// <summary>
/// Migawka ekranu: nagłówek (<c>null</c>, gdy ekranu nie ma), lista domyślna
/// i przypisania. Równość porównuje listy element po elemencie — z tego samego
/// powodu co w <see cref="TreeStateSnapshot"/>.
/// </summary>
internal sealed record ScreenStateSnapshot(
    ScreenHeaderRow? Header,
    IReadOnlyList<DefaultCategoryRow> Defaults,
    IReadOnlyList<AssignmentRow> Assignments)
{
    public bool Equals(ScreenStateSnapshot? other)
        => other is not null
            && Header == other.Header
            && Defaults.SequenceEqual(other.Defaults)
            && Assignments.SequenceEqual(other.Assignments);

    public override int GetHashCode() => HashCode.Combine(Header, Defaults.Count, Assignments.Count);

    private bool PrintMembers(StringBuilder builder)
    {
        builder.Append(
            $"Header = {Header}, Defaults = [{string.Join(", ", Defaults)}], " +
            $"Assignments = [{string.Join(", ", Assignments)}]");

        return true;
    }
}
