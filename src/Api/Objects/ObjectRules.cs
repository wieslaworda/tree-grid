namespace Api.Objects;

/// <summary>
/// Reguły słownika obiektów jako czyste funkcje: bez bazy, bez hosta i bez
/// encji EF. Endpointy (<see cref="ObjectEndpoints"/>) czytają stan i
/// odwzorowują wynik na odpowiedź, a same decyzje zapadają tutaj — dzięki temu
/// sprawdza je test jednostkowy, a S-03 użyje wykrywania cyklu dla struktury
/// ekranu bez żadnej zależności od modelu słownika.
/// </summary>
internal static class ObjectRules
{
    /// <summary>
    /// Postać kodu, po której obiekty są porównywane: bez spacji na brzegach
    /// i wielkimi literami. Jedno źródło dla kontroli duplikatu w endpoincie
    /// i dla kolumny z unikalnym indeksem — gdyby liczyły ją dwa miejsca,
    /// kontrola mogłaby przepuścić kod, na którym indeks rzuci wyjątkiem.
    /// </summary>
    /// <remarks>
    /// Nigdy kolacja bazy: <c>NOCASE</c> w SQLite składa wyłącznie litery
    /// ASCII. <c>ToUpperInvariant</c>, a nie <c>ToUpper</c>, bo tożsamość kodu
    /// nie może zależeć od ustawień regionalnych maszyny, na której działa API.
    /// </remarks>
    internal static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    /// <summary>
    /// Sprawdza, czy nadanie obiektowi <paramref name="objectId"/> zestawu
    /// podobiektów <paramref name="newChildIds"/> zamknie cykl, i zwraca jego
    /// ścieżkę.
    /// </summary>
    /// <returns>
    /// <c>null</c> — brak cyklu; w przeciwnym razie identyfikatory od
    /// <paramref name="objectId"/> z powrotem do <paramref name="objectId"/>,
    /// np. <c>[1, 7, 1]</c>.
    /// </returns>
    /// <remarks>
    /// Graf, po którym idzie przejście, to <paramref name="childrenByParent"/>
    /// z dziećmi edytowanego obiektu zastąpionymi nowym zestawem: wpis
    /// <paramref name="objectId"/> w słowniku jest ignorowany, bo opisuje stan
    /// sprzed zapisu.
    ///
    /// Szukane są wyłącznie cykle przechodzące przez edytowany obiekt. Przed
    /// zapisem graf jest acykliczny (pilnuje tego właśnie ta reguła), a zapis
    /// zmienia tylko krawędzie wychodzące z tego jednego obiektu — każdy nowy
    /// cykl musi więc przez niego przechodzić.
    ///
    /// Podobiekt równy samemu obiektowi to cykl długości 1 (<c>[A, A]</c>).
    /// Romb (dwie ścieżki do tego samego potomka) cyklem nie jest: węzeł raz
    /// przeszukany bez znalezienia <paramref name="objectId"/> nie jest
    /// odwiedzany ponownie, co przy okazji ogranicza przejście do O(V + E).
    /// </remarks>
    internal static IReadOnlyList<int>? FindCycle(
        int objectId,
        IReadOnlyCollection<int> newChildIds,
        IReadOnlyDictionary<int, IReadOnlyCollection<int>> childrenByParent)
    {
        var exhausted = new HashSet<int>();
        var path = new List<int> { objectId };

        foreach (var childId in newChildIds)
        {
            if (Reaches(childId))
            {
                return path;
            }
        }

        return null;

        // Czy z `node` da się dojść do `objectId`. Po sukcesie `path` niesie
        // całą drogę, po porażce wraca do stanu sprzed wywołania.
        bool Reaches(int node)
        {
            if (node == objectId)
            {
                path.Add(node);

                return true;
            }

            if (!exhausted.Add(node))
            {
                return false;
            }

            path.Add(node);

            if (childrenByParent.TryGetValue(node, out var children))
            {
                foreach (var child in children)
                {
                    if (Reaches(child))
                    {
                        return true;
                    }
                }
            }

            path.RemoveAt(path.Count - 1);

            return false;
        }
    }

    /// <summary>
    /// Warunek usunięcia: obiekt nie ma ani obiektu nadrzędnego, ani
    /// podobiektu. Usunięcie obiektu z rodzicem wycięłoby go z gałęzi, w której
    /// występuje; usunięcie obiektu z podobiektami — zerwałoby gałąź pod nim.
    /// Archiwizacji ani usuwania kaskadowego ten plaster nie przewiduje.
    /// </summary>
    internal static bool CanDelete(int parentCount, int childCount)
        => parentCount == 0 && childCount == 0;
}
