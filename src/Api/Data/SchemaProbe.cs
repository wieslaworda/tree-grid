namespace Api.Data;

/// <summary>
/// TABELA TYMCZASOWA — ZNIKA W PLASTRZE S-01.
/// Nie jest częścią modelu domenowego i nie wolno na niej niczego budować.
/// Istnieje wyłącznie po to, żeby pierwsza migracja miała co utworzyć, a pełny
/// cykl mechanizmu migracji (utworzenie schematu, odczyt przez endpoint,
/// wycofanie) dał się sprawdzić bez przesądzania czegokolwiek o modelu danych.
/// Razem z pierwszą tabelą domenową z S-01 usuwa się tę klasę, jej DbSet
/// i migrację, która ją tworzy.
/// </summary>
public sealed class SchemaProbe
{
    public int Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
