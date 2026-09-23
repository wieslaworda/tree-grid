#Requires -Version 5.1
<#
.SYNOPSIS
  Uruchamia API .NET (src/Api) na petli zwrotnej i zatrzymuje je przelacznikiem -Stop.

.DESCRIPTION
  Drugi proces sciezki wdrozeniowej, obok start-prod-tunnel.ps1. Ten skrypt NIE
  uruchamia tunelu i nie buduje frontendu: quick tunnel przyjmuje dokladnie jeden
  origin, wiec tunelowany jest wylacznie port 3000, a API zostaje na petli
  zwrotnej i jest odpytywane tylko z loaderow po stronie serwera.

  Skrypt jest wzorowany na start-prod-tunnel.ps1 i powtarza cztery jego
  wlasciwosci - bez kazdej z nich weryfikacja cicho klamie:

  - preflight zajetego portu PRZED startem. Zajety port to najczestsza przyczyna
    cichego falszu, w ktorym wszystko wstaje poprawnie, ale odpowiada poprzednia
    instancja;
  - czekanie na odpowiedz HTTP z /health, a nie na sam nasluch portu. Kestrel
    otwiera port, zanim potok jest gotowy, a przy niedostepnym pliku bazy kazde
    zadanie konczy sie bledem - nasluch portu potwierdzilby gotowosc, ktorej nie ma;
  - zamykanie calego drzewa procesow przez taskkill /T. 'dotnet run' to lancuch
    dotnet -> Api.exe; ubicie samego procesu nadrzednego osieroca serwer, ktory
    dalej trzyma port;
  - wlasny plik stanu (.tunnel-run/api-pids.json) i wlasne logi (api.*.log),
    rozlaczne z plikami trybu deweloperskiego i produkcyjnego, wiec -Stop jednego
    nie rusza pozostalych.

  Piata wlasciwosc jest wlasna dla tego skryptu: ASPNETCORE_ENVIRONMENT jest
  ustawiany JAWNIE w obu trybach, zamiast polegac na wartosci domyslnej.
  Program.cs rozdziela po nim sciezki migracji - w Development schemat dogania
  kod przy starcie, w Production start jest przerywany, gdy sa oczekujace
  migracje. Wartosc domyslna zamienilaby pomylke w cicha migracje bazy bez
  pytania, dlatego domyslnym trybem tego skryptu jest Production (glosna
  odmowa), a Development trzeba wybrac swiadomie.

  Port tez jest podawany jawnie, w linii polecen procesu: konfiguracja z wiersza
  polecen ma pierwszenstwo przed appsettings.json, wiec port sprawdzony
  w preflighcie jest dokladnie tym portem, pod ktorym API faktycznie nasluchuje.
  Bez tego -Port 5181 przeszedlby preflight, a API wstaloby na 5180.

.PARAMETER Port
  Port API. Domyslnie 5180, zgodnie z src/Api/appsettings.json.

.PARAMETER Environment
  Wartosc ASPNETCORE_ENVIRONMENT. Domyslnie Production.

.PARAMETER SkipBuild
  Uruchamia 'dotnet run --no-build' na aktualnych artefaktach. Przy braku
  wczesniejszego builda konczy sie bledem, a nie cichym startem starej wersji.

.PARAMETER Stop
  Zatrzymuje proces uruchomiony poprzednim wywolaniem i konczy dzialanie.
#>
[CmdletBinding()]
param(
    [int]$Port = 5180,
    [string]$ProjectRoot = (Get-Location).Path,
    [ValidateSet('Production', 'Development')]
    [string]$Environment = 'Production',
    [int]$ReadyTimeoutSeconds = 120,
    [switch]$SkipBuild,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$StateDir   = Join-Path $ProjectRoot '.tunnel-run'
$PidFile    = Join-Path $StateDir 'api-pids.json'
$ApiOut     = Join-Path $StateDir 'api.out.log'
$ApiErr     = Join-Path $StateDir 'api.err.log'
$ApiProject = Join-Path $ProjectRoot 'src\Api'
$HealthPath = '/health'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Stop-ProcessTree {
    # 'dotnet run' uruchamia lancuch dotnet -> Api.exe. Stop-Process ubija sam
    # proces nadrzedny i osieroca wlasciwy serwer, ktory dalej trzyma port.
    # taskkill /T zamyka cale drzewo potomkow.
    param([int]$ProcessId)
    $null = & taskkill.exe /PID $ProcessId /T /F 2>&1
    return ($LASTEXITCODE -eq 0)
}

function Stop-TrackedProcesses {
    if (-not (Test-Path $PidFile)) {
        Write-Host 'Brak zapisanego stanu API - nic do zatrzymania.'
        return
    }
    $state = Get-Content $PidFile -Raw | ConvertFrom-Json
    foreach ($entry in @($state.api)) {
        if ($null -eq $entry) { continue }
        try {
            $proc = Get-Process -Id $entry.pid -ErrorAction Stop
            # Dopasowanie czasu startu chroni przed ubiciem obcego procesu,
            # ktory dostal ten sam PID po recyklingu.
            if ($proc.StartTime.ToString('o') -eq $entry.startTime) {
                if (Stop-ProcessTree -ProcessId $entry.pid) {
                    Write-Host ("Zatrzymano {0} wraz z procesami potomnymi (PID {1})." -f $entry.name, $entry.pid)
                } else {
                    Write-Warning ("Nie udalo sie zamknac drzewa procesu {0} (PID {1})." -f $entry.name, $entry.pid)
                }
            } else {
                Write-Warning ("PID {0} nalezy juz do innego procesu - pomijam." -f $entry.pid)
            }
        } catch {
            Write-Host ("{0} (PID {1}) juz nie dziala." -f $entry.name, $entry.pid)
        }
    }

    # Osierocony proces na zapisanym porcie sprawia, ze NASTEPNA weryfikacja cicho
    # klamie - trasa zasobowa dostaje odpowiedz z poprzedniej wersji API. Dlatego
    # sprzatamy go jawnie, ale tylko jesli nalezy do tego projektu.
    if ($state.port) {
        $lingering = Get-NetTCPConnection -LocalPort $state.port -State Listen -ErrorAction SilentlyContinue
        foreach ($procId in @($lingering | Select-Object -ExpandProperty OwningProcess -Unique)) {
            $info = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
            if ($info -and $info.CommandLine -and $info.CommandLine.Contains($ProjectRoot)) {
                if (Stop-ProcessTree -ProcessId $procId) {
                    Write-Host ("Zamknieto osierocony proces trzymajacy port {0} (PID {1})." -f $state.port, $procId)
                }
            } elseif ($info) {
                Write-Warning ("Port {0} trzyma obcy proces (PID {1}) - pozostawiam." -f $state.port, $procId)
            }
        }
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

if ($Stop) {
    Stop-TrackedProcesses
    exit 0
}

# ---------------------------------------------------------------- preflight --

$csproj = Join-Path $ApiProject 'Api.csproj'
if (-not (Test-Path $csproj)) {
    throw "Nie znaleziono '$csproj'. Uruchom skrypt z katalogu glownego projektu albo podaj -ProjectRoot."
}

$dotnet = Get-Command 'dotnet.exe' -ErrorAction SilentlyContinue
if (-not $dotnet) { $dotnet = Get-Command 'dotnet' -ErrorAction SilentlyContinue }
if (-not $dotnet) { throw 'Nie znaleziono dotnet w PATH. Zainstaluj SDK .NET wskazane w global.json.' }

$occupied = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
    $holders = ($occupied | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Port $Port jest juz zajety (PID: $holders). Zatrzymaj stary proces (-Stop) albo uruchom z innym -Port."
}

if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}
foreach ($log in @($ApiOut, $ApiErr)) {
    Write-Utf8NoBom -Path $log -Content ''
}

# ---------------------------------------------------------------- start API --

$arguments = @('run', '--project', $ApiProject)
if ($SkipBuild) { $arguments += '--no-build' }
# Wszystko po '--' trafia do aplikacji, nie do 'dotnet run'. Program.cs przekazuje
# args do WebApplication.CreateBuilder, wiec ten wpis nadpisuje Kestrel:Endpoints
# z appsettings.json - patrz .DESCRIPTION.
$arguments += @('--', "--Kestrel:Endpoints:Http:Url=http://127.0.0.1:$Port")

$prevEnvironment = $env:ASPNETCORE_ENVIRONMENT
$env:ASPNETCORE_ENVIRONMENT = $Environment
try {
    Write-Host "Uruchamiam API (ASPNETCORE_ENVIRONMENT=$Environment) na 127.0.0.1:$Port..."
    $apiProc = Start-Process -FilePath $dotnet.Source `
        -ArgumentList $arguments `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $ApiOut `
        -RedirectStandardError $ApiErr `
        -WindowStyle Hidden -PassThru
} finally {
    $env:ASPNETCORE_ENVIRONMENT = $prevEnvironment
}

# Czekamy na odpowiedz HTTP, nie na sam nasluch portu - patrz .DESCRIPTION.
# Sprawdzenie HasExited w kazdym obrocie petli jest tu istotne: w Production
# Program.cs KONCZY proces kodem 1, gdy sa oczekujace migracje. Bez tego warunku
# czekalibysmy caly limit czasu na proces, ktorego juz nie ma.
$deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
    if ($apiProc.HasExited) {
        $tail = @(
            (Get-Content $ApiOut -Tail 20 -ErrorAction SilentlyContinue)
            (Get-Content $ApiErr -Tail 20 -ErrorAction SilentlyContinue)
        ) -join "`n"
        throw "API zakonczylo sie z kodem $($apiProc.ExitCode).`n$tail"
    }
    try {
        if ((Invoke-WebRequest "http://127.0.0.1:$Port$HealthPath" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) {
    Stop-ProcessTree -ProcessId $apiProc.Id | Out-Null
    throw "API nie zwrocilo HTTP 200 na $HealthPath w ciagu $ReadyTimeoutSeconds s. Logi: $ApiOut, $ApiErr"
}

# -------------------------------------------------------------- zapis stanu --

$state = @{
    api = @{
        name = 'dotnet run --project src/Api'
        pid = $apiProc.Id
        startTime = $apiProc.StartTime.ToString('o')
    }
    port = $Port
    environment = $Environment
    startedAt = (Get-Date).ToString('o')
}
Write-Utf8NoBom -Path $PidFile -Content ($state | ConvertTo-Json -Depth 4)

Write-Host ''
Write-Host '============================================================'
Write-Host "  API odpowiada:  http://127.0.0.1:$Port$HealthPath"
Write-Host "  Srodowisko:     $Environment"
Write-Host "  Logi:           .tunnel-run\api.out.log, api.err.log"
Write-Host "  Zatrzymanie:    -Stop"
Write-Host '============================================================'
Write-Host ''
Write-Host 'API nasluchuje wylacznie na petli zwrotnej i NIE jest tunelowane.'
Write-Host 'Publicznie wystawiany jest tylko port 3000 (start-prod-tunnel.ps1).'
