namespace Api.Data;

/// <summary>
/// Relacja rodzic–podobiekt w słowniku obiektów: krawędź grafu, na którym
/// działa wykrywanie cyklu, i gałąź, którą S-03 dołącza do drzewa w całości
/// (FR-005).
/// </summary>
/// <remarks>
/// Osobna encja, a nie nawigacja „przeskakująca" EF Core, bo relacja niesie
/// własne niezmienniki, które mają obowiązywać także na poziomie bazy: klucz
/// złożony (ta sama para nie wystąpi dwa razy), ograniczenie <c>CHECK</c>
/// (obiekt nie jest własnym podobiektem) i klucze obce bez kaskady (obiektu,
/// do którego prowadzi relacja, nie da się usunąć). Konfiguracja — w
/// <see cref="AppDbContext"/>.
/// </remarks>
public sealed class CatalogObjectLink
{
    public int ParentId { get; set; }

    public CatalogObject Parent { get; set; } = null!;

    public int ChildId { get; set; }

    public CatalogObject Child { get; set; } = null!;
}
