using Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Api.Screens;

/// <summary>
/// Kopia wzorca ekranu na nowe konto (S-16): odczyt ekranu i drzewa
/// z <c>IsTemplate</c>, migawka, graf z <see cref="ScreenTemplateRules"/>
/// i zapis — w jednej transakcji. Wydzielone z kroku 2 rejestracji, żeby
/// endpoint rejestracji nie znał modelu ekranu.
/// </summary>
/// <remarks>
/// Odczyt wzorca nie filtruje po właścicielu — to świadomy wyjątek od zasady
/// opisany w <see cref="ScreenTemplateRules"/>.
///
/// Kopia nigdy nie rzuca do wywołującego: konto jest już zatwierdzone, więc
/// porażka kopii nie ma czego wycofać po stronie rejestracji. Brak wzorca
/// (żadnej flagi — bazy testów, E2E, świeża instalacja) to stan normalny
/// i nie zostawia śladu. Niespójny wzorzec i wyjątek kończą się wpisem Error
/// z identyfikatorem konta — bez loginu, hasła i kodu — i kontem bez kopii.
/// </remarks>
internal static class ScreenTemplateClone
{
    /// <summary>
    /// Kopiuje wzorzec na konto <paramref name="userId"/>, z loginem
    /// <paramref name="login"/> w nazwach kopii.
    /// </summary>
    /// <remarks>
    /// Transakcja jest otwierana <b>przed</b> odczytem wzorca — na SQLite to
    /// <c>BEGIN IMMEDIATE</c>, więc równoległa edycja wzorca przez jego
    /// kuratora nie da kopii z połowy zmiany. Bez tokenu żądania: rozłączony
    /// klient nie może zostawić zatwierdzonego konta bez kopii. Po porażce
    /// śledzenie kontekstu jest czyszczone, żeby niezapisany graf kopii nie
    /// pojechał z kolejnym <c>SaveChanges</c> tego samego scope.
    /// </remarks>
    internal static async Task CloneForAsync(AppDbContext db, string userId, string login, ILogger logger)
    {
        var cancellationToken = CancellationToken.None;

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            var screen = await db.Screens
                .AsNoTracking()
                .Where(s => s.IsTemplate)
                .Select(s => new { s.Id, s.TreeId, s.Name, s.GrainMinutes })
                .SingleOrDefaultAsync(cancellationToken);

            var tree = await db.Trees
                .AsNoTracking()
                .Where(t => t.IsTemplate)
                .Select(t => new { t.Id, t.Name })
                .SingleOrDefaultAsync(cancellationToken);

            if (screen is null && tree is null)
            {
                return;
            }

            // Źródłem kopii jest ekran, a drzewo wzorca musi być jego drzewem.
            // Każda inna kombinacja flag to błąd konfiguracji — także samo
            // drzewo bez ekranu, bo wtedy kopiowanie przestało działać po cichu.
            if (screen is null || tree is null || screen.TreeId != tree.Id)
            {
                logger.LogError(
                    "Wzorzec ekranu jest niespójny (ekran {TemplateScreenId}, drzewo ekranu {TemplateScreenTreeId}, " +
                    "drzewo wzorca {TemplateTreeId}). Konto {UserId} zostało założone bez kopii wzorca.",
                    screen?.Id,
                    screen?.TreeId,
                    tree?.Id,
                    userId);

                return;
            }

            var nodes = await db.TreeNodes
                .AsNoTracking()
                .Where(node => node.TreeId == tree.Id)
                .OrderBy(node => node.Id)
                .Select(node => new TemplateNode(
                    node.Id, node.ParentId, node.ObjectId, node.Position, node.IsCollapsed))
                .ToListAsync(cancellationToken);

            var defaults = await db.ScreenDefaultCategories
                .AsNoTracking()
                .Where(entry => entry.ScreenId == screen.Id)
                .OrderBy(entry => entry.Position)
                .ThenBy(entry => entry.CategoryId)
                .Select(entry => new TemplateDefaultCategory(entry.CategoryId, entry.Position))
                .ToListAsync(cancellationToken);

            var assignments = await db.ScreenNodeCategories
                .AsNoTracking()
                .Where(entry => entry.ScreenId == screen.Id)
                .OrderBy(entry => entry.TreeNodeId)
                .ThenBy(entry => entry.Position)
                .ThenBy(entry => entry.CategoryId)
                .Select(entry => new TemplateAssignment(entry.TreeNodeId, entry.CategoryId, entry.Position))
                .ToListAsync(cancellationToken);

            var (cloneTree, cloneScreen) = ScreenTemplateRules.Clone(
                new ScreenTemplateSnapshot(screen.Name, tree.Name, screen.GrainMinutes, nodes, defaults, assignments),
                userId,
                login);

            db.Trees.Add(cloneTree);
            db.Screens.Add(cloneScreen);

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            db.ChangeTracker.Clear();

            logger.LogError(
                exception,
                "Nie udało się skopiować wzorca ekranu. Konto {UserId} zostało założone bez kopii wzorca.",
                userId);
        }
    }
}
