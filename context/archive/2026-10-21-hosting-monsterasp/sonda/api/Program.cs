// Sonda .NET dla MonsterASP (Faza 1 planu hosting-monsterasp, bramki G2, G5,
// G7, G8 oraz pomiary pamięci i bitowości puli). Pod IIS aplikacja podrzędna
// /tg-api dostaje PathBase od ANCM, więc mapujemy samo /sonda — publicznie
// to https://<host>/tg-api/sonda.
//
// Endpoint zawsze odpowiada 200 z JSON-em: każda sekcja łapie własne wyjątki
// i zwraca je jako tekst, bo sonda ma zebrać fakty, a nie paść na pierwszym.
// Zmienne środowiskowe raportujemy wyłącznie jako obecność (lekcja „Sekrety”).

using System.Diagnostics;
using System.Net.Sockets;
using System.Runtime.InteropServices;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => Results.Text(
    "Sonda MonsterASP. Wyniki: GET /sonda (pod IIS: /tg-api/sonda).",
    "text/plain; charset=utf-8"));

app.MapGet("/sonda", async (HttpContext http, IWebHostEnvironment env) =>
{
    try
    {
        var contentRoot = env.ContentRootPath;
        return Results.Json(new
        {
            dotnet = new
            {
                version = Environment.Version.ToString(),
                is64BitProcess = Environment.Is64BitProcess,
                frameworkDescription = RuntimeInformation.FrameworkDescription,
            },
            processName = Bezpiecznie(() => Process.GetCurrentProcess().ProcessName),
            pathBase = http.Request.PathBase.Value,
            contentRoot,
            dataDir = Sonda.Sondy.KatalogDanych(contentRoot),
            smtp = await Sonda.Sondy.Smtp(http.RequestAborted),
            envVisible = Environment.GetEnvironmentVariable("TG_SONDA") is not null,
            workingSet = Environment.WorkingSet,
        });
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = $"{ex.GetType().Name}: {ex.Message}" });
    }
});

app.Run();

static string? Bezpiecznie(Func<string?> odczyt)
{
    try
    {
        return odczyt();
    }
    catch (Exception ex)
    {
        return $"{ex.GetType().Name}: {ex.Message}";
    }
}

namespace Sonda
{
    internal static class Sondy
    {
        private const string NazwaZnacznika = "sonda-znacznik.txt";
        private static readonly TimeSpan TimeoutSmtp = TimeSpan.FromSeconds(5);

        // G7: katalog danych poza wwwroot, obok niego w katalogu witryny
        // (D:\Sites\siteNNN\tg-data). Szukamy przodka o nazwie wwwroot, bo
        // sonda stoi raz w wwwroot\tg-api (aplikacja podrzędna), a raz
        // w samym wwwroot (osobna witryna); stałe ..\..\ w drugim przypadku
        // wychodzi poza katalog witryny, gdzie zapis jest zabroniony.
        // Znacznik zapisany przy pierwszym wywołaniu pokazuje, czy katalog
        // przeżył ponowne wgranie ZIP.
        private static string SciezkaKataloguDanych(string contentRoot)
        {
            for (var katalog = new DirectoryInfo(contentRoot); katalog is not null; katalog = katalog.Parent)
            {
                if (string.Equals(katalog.Name, "wwwroot", StringComparison.OrdinalIgnoreCase)
                    && katalog.Parent is not null)
                {
                    return Path.Combine(katalog.Parent.FullName, "tg-data");
                }
            }

            return Path.GetFullPath(Path.Combine(contentRoot, "..", "..", "tg-data"));
        }

        public static object KatalogDanych(string contentRoot)
        {
            string? sciezka = null;
            bool? isUnc = null;
            string? driveType = null;
            string? driveFormat = null;
            bool? markerExisted = null;
            string? markerContent = null;
            var writable = false;
            string? error = null;

            try
            {
                sciezka = SciezkaKataloguDanych(contentRoot);
                isUnc = sciezka.StartsWith(@"\\", StringComparison.Ordinal);

                // DriveInfo rzuca na ścieżce UNC, więc pytamy tylko o literę dysku.
                if (isUnc == false)
                {
                    try
                    {
                        var dysk = new DriveInfo(Path.GetPathRoot(sciezka)!);
                        driveType = dysk.DriveType.ToString();
                        driveFormat = dysk.DriveFormat;
                    }
                    catch (Exception ex)
                    {
                        driveType ??= $"{ex.GetType().Name}: {ex.Message}";
                    }
                }

                Directory.CreateDirectory(sciezka);

                var znacznik = Path.Combine(sciezka, NazwaZnacznika);
                markerExisted = File.Exists(znacznik);
                if (markerExisted == true)
                {
                    markerContent = File.ReadAllText(znacznik);
                }
                else
                {
                    markerContent = $"zapisany {DateTimeOffset.UtcNow:O}";
                    File.WriteAllText(znacznik, markerContent);
                }

                var probny = Path.Combine(sciezka, $"sonda-zapis-{Guid.NewGuid():N}.tmp");
                File.WriteAllText(probny, "sonda");
                var odczytany = File.ReadAllText(probny);
                File.Delete(probny);
                writable = odczytany == "sonda";
            }
            catch (Exception ex)
            {
                error = $"{ex.GetType().Name}: {ex.Message}";
            }

            return new
            {
                path = sciezka,
                writable,
                driveType,
                driveFormat,
                isUnc,
                markerExisted,
                markerContent,
                error,
            };
        }

        // G8: wyjście TCP na smtp.gmail.com:587 (tylko połączenie, bez rozmowy SMTP).
        public static async Task<object> Smtp(CancellationToken zadanie)
        {
            var stoper = Stopwatch.StartNew();
            using var limit = CancellationTokenSource.CreateLinkedTokenSource(zadanie);
            limit.CancelAfter(TimeoutSmtp);
            using var klient = new TcpClient();
            try
            {
                await klient.ConnectAsync("smtp.gmail.com", 587, limit.Token);
                return new { connected = true, elapsedMs = stoper.ElapsedMilliseconds, error = (string?)null };
            }
            catch (OperationCanceledException)
            {
                return new
                {
                    connected = false,
                    elapsedMs = stoper.ElapsedMilliseconds,
                    error = (string?)$"Przekroczony limit {TimeoutSmtp.TotalSeconds:0} s",
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    connected = false,
                    elapsedMs = stoper.ElapsedMilliseconds,
                    error = (string?)$"{ex.GetType().Name}: {ex.Message}",
                };
            }
        }
    }
}
