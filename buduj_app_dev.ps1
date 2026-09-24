#Requires -Version 5.1
<#
.SYNOPSIS
  Buduje backend i frontend, a potem uruchamia API i GUI na portach deweloperskich.
  Przelacznik -Stop zatrzymuje oba procesy.

.DESCRIPTION
  Kolejnosc krokow:

  1. Zatrzymanie poprzednich instancji. Dzialajace API trzyma
     src/Api/bin/Debug/net10.0/Api.exe, wiec 'dotnet build' konczy sie bledem
     kopiowania (MSB3021), zanim cokolwiek skompiluje. Zatrzymywane sa procesy
     z plikow stanu oraz osierocone procesy tego projektu na portach API i GUI -
     obcy proces na porcie przerywa skrypt, zamiast zostac ubity.
  2. Build backendu: dotnet build TreeGrid.sln (Debug).
  3. Build frontendu: npm run typecheck i npm run build. Serwer deweloperski
     Vite i tak serwuje zrodla, ale typecheck jest jedyna automatyczna
     weryfikacja w repo, a build wylapuje bledy, ktorych dev server nie zglasza.
  4. Kopia bazy, jesli sa oczekujace migracje. W Development API migruje baze
     przy starcie (Program.cs), wiec kopia musi powstac PRZED startem API -
     z plikami *.db-wal i *.db-shm, jesli istnieja.
  5. Start API przez .claude/skills/run-tunel-app/scripts/start-api.ps1
     w trybie Development, na zbudowanych artefaktach (-SkipBuild).
  6. Start GUI: npm run dev na porcie deweloperskim z --strictPort, zeby zajety
     port byl glosnym bledem, a nie cichym przeskokiem na inny port.

  Ten skrypt NIE uruchamia tunelu - lokalny tryb deweloperski. Wystawienie przez
  tunel obsluguja skrypty w .claude/skills/run-tunel-app/scripts/.

.PARAMETER ApiPort
  Port API. Domyslnie 5180, zgodnie z src/Api/appsettings.json.

.PARAMETER DevPort
  Port serwera deweloperskiego GUI. Domyslnie 5173.

.PARAMETER SkipTypecheck
  Pomija npm run typecheck.

.PARAMETER Stop
  Zatrzymuje API i GUI uruchomione poprzednim wywolaniem i konczy dzialanie.
#>
[CmdletBinding()]
param(
    [int]$ApiPort = 5180,
    [int]$DevPort = 5173,
    [string]$ProjectRoot = $PSScriptRoot,
    [int]$DevTimeoutSeconds = 90,
    [switch]$SkipTypecheck,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$StateDir     = Join-Path $ProjectRoot '.tunnel-run'
$DevPidFile   = Join-Path $StateDir 'dev-local-pids.json'
$DevOut       = Join-Path $StateDir 'dev-local.out.log'
$DevErr       = Join-Path $StateDir 'dev-local.err.log'
$ApiScript    = Join-Path $ProjectRoot '.claude\skills\run-tunel-app\scripts\start-api.ps1'
$ApiProject   = Join-Path $ProjectRoot 'src\Api'
$DatabasePath = Join-Path $ApiProject 'db\treegrid.db'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Write-Step {
    param([string]$Text)
    Write-Host ''
    Write-Host "==> $Text"
}

function Stop-ProcessTree {
    # 'npm run dev' to lancuch npm -> node -> node, a 'dotnet run' to
    # dotnet -> Api.exe. Stop-Process ubija sam proces nadrzedny i osieroca
    # wlasciwy serwer, ktory dalej trzyma port. taskkill /T zamyka cale drzewo.
    # Lokalne 'Continue': w PowerShell 5.1 stderr natywnego polecenia
    # przekierowany przez 2>&1 przy 'Stop' staje sie bledem konczacym skrypt.
    param([int]$ProcessId)
    $ErrorActionPreference = 'Continue'
    $null = & taskkill.exe /PID $ProcessId /T /F 2>&1
    return ($LASTEXITCODE -eq 0)
}

function Stop-TrackedDevServer {
    if (-not (Test-Path $DevPidFile)) { return }
    $state = Get-Content $DevPidFile -Raw | ConvertFrom-Json
    if ($state.dev) {
        try {
            $proc = Get-Process -Id $state.dev.pid -ErrorAction Stop
            # Dopasowanie czasu startu chroni przed ubiciem obcego procesu,
            # ktory dostal ten sam PID po recyklingu.
            if ($proc.StartTime.ToString('o') -eq $state.dev.startTime) {
                if (Stop-ProcessTree -ProcessId $state.dev.pid) {
                    Write-Host ("Zatrzymano GUI (npm run dev, PID {0})." -f $state.dev.pid)
                }
            } else {
                Write-Warning ("PID {0} nalezy juz do innego procesu - pomijam." -f $state.dev.pid)
            }
        } catch {
            Write-Host ("GUI (PID {0}) juz nie dziala." -f $state.dev.pid)
        }
    }
    Remove-Item $DevPidFile -Force -ErrorAction SilentlyContinue
}

function Clear-ProjectPort {
    # Zwalnia port trzymany przez proces TEGO projektu (API albo Vite
    # uruchomione recznie, bez pliku stanu). Obcy proces przerywa skrypt:
    # ubicie go byloby gorsze niz glosny blad.
    param([int]$Port, [string]$Label)
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($procId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
        $info = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
        $ours = $info -and $info.CommandLine -and
                ($info.CommandLine.IndexOf($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
        if ($ours) {
            if (Stop-ProcessTree -ProcessId $procId) {
                Write-Host ("Zamknieto proces projektu trzymajacy port {0} ({1}, PID {2})." -f $Port, $Label, $procId)
            }
        } else {
            throw "Port $Port ($Label) trzyma obcy proces (PID $procId). Zatrzymaj go recznie albo podaj inny port."
        }
    }

    # taskkill wraca, zanim system zwolni gniazdo i plik wykonywalny.
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) -and
           ((Get-Date) -lt $deadline)) {
        Start-Sleep -Milliseconds 300
    }
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $Port ($Label) nadal jest zajety po zatrzymaniu procesu."
    }
}

function Stop-All {
    Stop-TrackedDevServer
    & $ApiScript -Stop -ProjectRoot $ProjectRoot
    Clear-ProjectPort -Port $DevPort -Label 'GUI'
    Clear-ProjectPort -Port $ApiPort -Label 'API'
}

function Invoke-Checked {
    # Natywne polecenia nie rzucaja wyjatkow przy niezerowym kodzie wyjscia -
    # bez tego sprawdzenia nieudany build przeszedlby dalej po cichu.
    # Lokalne 'Continue': npm pisze komunikaty 'npm notice' na stderr, a przy
    # przekierowanym stderr i 'Stop' PowerShell 5.1 przerwalby na nich skrypt.
    # O porazce rozstrzyga wylacznie kod wyjscia.
    param([string]$Description, [scriptblock]$Command)
    $ErrorActionPreference = 'Continue'
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description zakonczyl sie kodem $LASTEXITCODE."
    }
}

function Get-HttpStatus {
    # Kod odpowiedzi bez podazania za przekierowaniem albo $null, gdy serwer nie
    # odpowiada. Niezalogowany uzytkownik dostaje 302 na /logowanie - to tez
    # dowod, ze serwer dziala.
    param([string]$Url)
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.AllowAutoRedirect = $false
        $request.Timeout = 3000
        $response = $request.GetResponse()
        $status = [int]$response.StatusCode
        $response.Close()
        return $status
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            $_.Exception.Response.Close()
            return $status
        }
        return $null
    }
}

function Backup-DatabaseIfPending {
    if (-not (Test-Path $DatabasePath)) {
        Write-Host 'Brak pliku bazy - API utworzy go przy starcie, kopia niepotrzebna.'
        return
    }

    # Lokalne 'Continue' - powod przy Stop-ProcessTree.
    $ErrorActionPreference = 'Continue'
    $output = & dotnet ef migrations list --project $ApiProject --no-build 2>&1
    $listed = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = 'Stop'
    $pending = @()
    if ($listed) {
        $pending = @($output | ForEach-Object { "$_" } | Where-Object { $_ -match '\(Pending\)\s*$' })
    }

    if ($listed -and $pending.Count -eq 0) {
        Write-Host 'Brak oczekujacych migracji - kopia bazy niepotrzebna.'
        return
    }

    if ($listed) {
        # '20260924040839_TreeVersion (Pending)' -> 'TreeVersion'
        $last = ($pending[-1] -replace '\s*\(Pending\)\s*$', '').Trim()
        $label = $last -replace '^\d+_', ''
        Write-Host ("Oczekujace migracje: {0}" -f (($pending | ForEach-Object { ($_ -replace '\s*\(Pending\)\s*$', '').Trim() }) -join ', '))
    } else {
        # Bez listy migracji nie wiadomo, czy start zmieni baze - kopia na zapas.
        Write-Warning 'Nie udalo sie odczytac listy migracji (dotnet ef) - robie kopie bazy na zapas.'
        $label = 'startem'
    }

    $stamp = Get-Date -Format 'yyyyMMddHHmmss'
    $baseName = "treegrid-kopia-przed-$label-$stamp"
    $dbDir = Split-Path $DatabasePath -Parent
    Copy-Item $DatabasePath (Join-Path $dbDir "$baseName.db")
    foreach ($suffix in @('-wal', '-shm')) {
        $side = "$DatabasePath$suffix"
        if (Test-Path $side) { Copy-Item $side (Join-Path $dbDir "$baseName.db$suffix") }
    }
    Write-Host ("Kopia bazy: src\Api\db\{0}.db" -f $baseName)
}

# ------------------------------------------------------------------- -Stop --

if (-not (Test-Path $ApiScript)) {
    throw "Nie znaleziono '$ApiScript'."
}

if ($Stop) {
    Stop-All
    exit 0
}

# ---------------------------------------------------------------- preflight --

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "Nie znaleziono package.json w '$ProjectRoot'."
}
if (-not (Get-Command 'dotnet' -ErrorAction SilentlyContinue)) {
    throw 'Nie znaleziono dotnet w PATH.'
}
$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command 'npm' -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'Nie znaleziono npm w PATH.' }

if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}

Push-Location $ProjectRoot
try {
    Write-Step 'Zatrzymuje poprzednie instancje API i GUI'
    Stop-All

    Write-Step 'Build backendu (dotnet build TreeGrid.sln)'
    Invoke-Checked 'dotnet build' { dotnet build (Join-Path $ProjectRoot 'TreeGrid.sln') --nologo -v q }

    Write-Step 'Build frontendu'
    if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
        Invoke-Checked 'npm ci' { & $npm.Source ci }
    }
    if (-not $SkipTypecheck) {
        Invoke-Checked 'npm run typecheck' { & $npm.Source run typecheck }
    }
    Invoke-Checked 'npm run build' { & $npm.Source run build }

    Write-Step 'Kopia bazy przed startem API (Development migruje przy starcie)'
    Backup-DatabaseIfPending

    Write-Step "Start API (Development) na 127.0.0.1:$ApiPort"
    & $ApiScript -Environment Development -SkipBuild -Port $ApiPort -ProjectRoot $ProjectRoot

    Write-Step "Start GUI (npm run dev) na porcie $DevPort"
    foreach ($log in @($DevOut, $DevErr)) { Write-Utf8NoBom -Path $log -Content '' }
    $devProc = Start-Process -FilePath $npm.Source `
        -ArgumentList 'run', 'dev', '--', '--port', "$DevPort", '--strictPort' `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $DevOut `
        -RedirectStandardError $DevErr `
        -WindowStyle Hidden -PassThru

    # Czekamy na odpowiedz HTTP, nie na sam nasluch portu: Vite otwiera port,
    # zanim pierwsze zadanie SSR sie powiedzie.
    $devUrl = "http://localhost:$DevPort/"
    $deadline = (Get-Date).AddSeconds($DevTimeoutSeconds)
    $status = $null
    while ((Get-Date) -lt $deadline) {
        if ($devProc.HasExited) {
            $tail = @(
                (Get-Content $DevOut -Tail 20 -ErrorAction SilentlyContinue)
                (Get-Content $DevErr -Tail 20 -ErrorAction SilentlyContinue)
            ) -join "`n"
            throw "Serwer deweloperski zakonczyl sie z kodem $($devProc.ExitCode).`n$tail"
        }
        $status = Get-HttpStatus -Url $devUrl
        if ($status -and $status -lt 500) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $status -or $status -ge 500) {
        Stop-ProcessTree -ProcessId $devProc.Id | Out-Null
        throw "GUI nie odpowiedzialo poprawnie na $devUrl w ciagu $DevTimeoutSeconds s (ostatni kod: $status). Logi: $DevOut, $DevErr"
    }

    $state = @{
        dev = @{
            name = 'npm run dev'
            pid = $devProc.Id
            startTime = $devProc.StartTime.ToString('o')
        }
        port = $DevPort
        startedAt = (Get-Date).ToString('o')
    }
    Write-Utf8NoBom -Path $DevPidFile -Content ($state | ConvertTo-Json -Depth 4)
} finally {
    Pop-Location
}

Write-Host ''
Write-Host '============================================================'
Write-Host "  GUI:          http://localhost:$DevPort"
Write-Host "  API:          http://127.0.0.1:$ApiPort/health  (Development)"
Write-Host '  Logi:         .tunnel-run\dev-local.*.log, api.*.log'
Write-Host '  Zatrzymanie:  .\buduj_app_dev.ps1 -Stop'
Write-Host '============================================================'
