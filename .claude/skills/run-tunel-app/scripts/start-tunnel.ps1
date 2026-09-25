#Requires -Version 5.1
<#
.SYNOPSIS
  Uruchamia serwer deweloperski Vite, wystawia go przez Cloudflare Quick Tunnel
  i wpisuje wygenerowany adres do server.allowedHosts w vite.config.ts.

.DESCRIPTION
  Kolejnosc ma znaczenie: Vite sprawdza naglowek Host przy pierwszym zadaniu,
  a adres tunelu jest znany dopiero po jego starcie. Skrypt najpierw podnosi
  oba procesy, potem odczytuje adres z wyjscia cloudflared i dopisuje go do
  konfiguracji - Vite wykrywa zmiane pliku i restartuje serwer samoczynnie.

.PARAMETER Port
  Port serwera deweloperskiego. Domyslnie 5173.

  Tryb jest domyslnie WYLACZONY (TG-SEC-01, context/changes/owasp-security/raport.md):
  serwer deweloperski serwuje pliki spod katalogu projektu z pominieciem bramy
  logowania, wiec publiczny tunel na niego to publiczny dostep do dysku.
  Uruchomienie wymaga -AllowDevTunnel, a tunel startuje dopiero wtedy, gdy
  sonda potwierdzi, ze server.fs w vite.config.ts odcina pliki spoza app/.
  Do pokazania aplikacji uzywaj start-prod-tunnel.ps1.

.PARAMETER AllowDevTunnel
  Jawna zgoda na publiczne wystawienie serwera deweloperskiego. Bez niej skrypt
  konczy sie bledem, zanim cokolwiek uruchomi.

.PARAMETER Stop
  Zatrzymuje procesy uruchomione poprzednim wywolaniem i konczy dzialanie.

.PARAMETER Restore
  Uzywany razem z -Stop: przywraca vite.config.ts z kopii sprzed zmiany.
#>
[CmdletBinding()]
param(
    [int]$Port = 5173,
    [string]$ProjectRoot = (Get-Location).Path,
    [int]$DevTimeoutSeconds = 90,
    [int]$TunnelTimeoutSeconds = 60,
    [switch]$AllowDevTunnel,
    [switch]$Stop,
    [switch]$Restore
)

$ErrorActionPreference = 'Stop'

$StateDir   = Join-Path $ProjectRoot '.tunnel-run'
$PidFile    = Join-Path $StateDir 'pids.json'
$ConfigPath = Join-Path $ProjectRoot 'vite.config.ts'
$BackupPath = Join-Path $StateDir 'vite.config.ts.bak'
$DevOut     = Join-Path $StateDir 'dev.out.log'
$DevErr     = Join-Path $StateDir 'dev.err.log'
$CfOut      = Join-Path $StateDir 'cloudflared.out.log'
$CfErr      = Join-Path $StateDir 'cloudflared.err.log'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Stop-ProcessTree {
    # 'npm run dev' uruchamia lancuch npm -> node -> node. Stop-Process ubija sam
    # proces nadrzedny i osieroca wlasciwy serwer Vite, ktory dalej trzyma port.
    # taskkill /T zamyka cale drzewo potomkow, dlatego uzywamy go zamiast Stop-Process.
    param([int]$ProcessId)
    $null = & taskkill.exe /PID $ProcessId /T /F 2>&1
    return ($LASTEXITCODE -eq 0)
}

function Get-HttpStatus {
    # Kod odpowiedzi bez podazania za przekierowaniem albo $null, gdy serwer nie odpowiada.
    param([string]$Url)
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.AllowAutoRedirect = $false
        $request.Timeout = 10000
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

function Stop-TrackedProcesses {
    if (-not (Test-Path $PidFile)) {
        Write-Host 'Brak zapisanego stanu - nic do zatrzymania.'
        return
    }
    $state = Get-Content $PidFile -Raw | ConvertFrom-Json
    foreach ($entry in @($state.dev, $state.tunnel)) {
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

    # Zabezpieczenie na wypadek procesu osieroconego wczesniej: jesli zapisany port
    # nadal nasluchuje, a proces nalezy do tego projektu, zamykamy takze jego.
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

    if ($Restore) {
        if (Test-Path $BackupPath) {
            Copy-Item $BackupPath $ConfigPath -Force
            Write-Host 'Przywrocono vite.config.ts z kopii zapasowej.'
        } else {
            Write-Warning 'Brak kopii zapasowej vite.config.ts - nie przywrocono.'
        }
    }
}

if ($Stop) {
    Stop-TrackedProcesses
    exit 0
}

# ---------------------------------------------------------------- preflight --

if (-not $AllowDevTunnel) {
    throw ("Tryb deweloperski tunelu jest domyslnie wylaczony: serwer Vite serwuje pliki " +
           "projektu z pominieciem logowania (TG-SEC-01). Do pokazania aplikacji uzyj " +
           "start-prod-tunnel.ps1. Jesli swiadomie chcesz wystawic serwer deweloperski, " +
           "uruchom ponownie z -AllowDevTunnel.")
}

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "Nie znaleziono package.json w '$ProjectRoot'. Uruchom skrypt z katalogu glownego projektu albo podaj -ProjectRoot."
}
if (-not (Test-Path $ConfigPath)) {
    throw "Nie znaleziono vite.config.ts w '$ProjectRoot'."
}

$cloudflared = $null
foreach ($candidate in @('cloudflared.exe', 'cloudflared')) {
    $found = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($found) { $cloudflared = $found.Source; break }
}
if (-not $cloudflared) {
    throw "Nie znaleziono cloudflared w PATH. Zainstaluj: winget install --id Cloudflare.cloudflared"
}

$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command 'npm' -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'Nie znaleziono npm w PATH.' }

# Zajety port to najczestsza przyczyna cichego falszu: tunel wstaje, ale wskazuje
# na poprzednia instancje, a wynik wyglada poprawnie.
$occupied = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
    $holders = ($occupied | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Port $Port jest juz zajety (PID: $holders). Zatrzymaj stary proces albo uruchom z innym -Port."
}

if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}
Copy-Item $ConfigPath $BackupPath -Force
foreach ($log in @($DevOut, $DevErr, $CfOut, $CfErr)) {
    Write-Utf8NoBom -Path $log -Content ''
}

# -------------------------------------------------------- serwer deweloperski --

Write-Host "Uruchamiam serwer deweloperski (npm run dev) na porcie $Port..."
$devProc = Start-Process -FilePath $npm.Source `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $DevOut `
    -RedirectStandardError $DevErr `
    -WindowStyle Hidden -PassThru

$deadline = (Get-Date).AddSeconds($DevTimeoutSeconds)
$devReady = $false
while ((Get-Date) -lt $deadline) {
    if ($devProc.HasExited) {
        $tail = (Get-Content $DevErr -Tail 20 -ErrorAction SilentlyContinue) -join "`n"
        throw "Serwer deweloperski zakonczyl sie z kodem $($devProc.ExitCode).`n$tail"
    }
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        $devReady = $true
        break
    }
    Start-Sleep -Milliseconds 500
}
if (-not $devReady) {
    Stop-Process -Id $devProc.Id -Force -ErrorAction SilentlyContinue
    throw "Serwer deweloperski nie zaczal nasluchiwac na porcie $Port w ciagu $DevTimeoutSeconds s. Logi: $DevOut, $DevErr"
}
Write-Host "Serwer deweloperski nasluchuje na http://localhost:$Port"

# ------------------------------------------------ sonda izolacji plikow --

# Tunel startuje dopiero, gdy serwer odmawia plikow spoza app/. Sprawdzamy
# zachowanie, a nie tresc vite.config.ts: cofniety albo poszerzony server.fs
# nie wywala startu Vite, tylko po cichu znow wystawia dysk (TG-SEC-01).
# Kazda odpowiedz 2xx/3xx - albo brak odpowiedzi - zatrzymuje skrypt.
$probePaths = @('/src/Api/appsettings.json', '/package.json', '/context/foundation/prd.md')
foreach ($probe in $probePaths) {
    $status = Get-HttpStatus -Url "http://localhost:$Port$probe"
    if (-not $status -or $status -lt 400) {
        Stop-ProcessTree -ProcessId $devProc.Id | Out-Null
        throw ("Serwer deweloperski zwrocil '{0}' dla {1} - pliki projektu sa dostepne. " +
               "Sprawdz server.fs w vite.config.ts. Tunel NIE zostal uruchomiony.") -f $status, $probe
    }
}
Write-Host ("Sonda izolacji: pliki spoza app/ odrzucone ({0})." -f ($probePaths -join ', '))

# -------------------------------------------------------------------- tunel --

Write-Host 'Uruchamiam Cloudflare Quick Tunnel...'
$tunnelProc = Start-Process -FilePath $cloudflared `
    -ArgumentList 'tunnel', '--protocol', 'http2', '--url', "http://localhost:$Port" `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput $CfOut `
    -RedirectStandardError $CfErr `
    -WindowStyle Hidden -PassThru

# cloudflared wypisuje banner z adresem na stderr, nie na stdout - czytamy oba.
$urlPattern = 'https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com'
$deadline = (Get-Date).AddSeconds($TunnelTimeoutSeconds)
$tunnelUrl = $null
while ((Get-Date) -lt $deadline) {
    if ($tunnelProc.HasExited) {
        $tail = (Get-Content $CfErr -Tail 20 -ErrorAction SilentlyContinue) -join "`n"
        Stop-Process -Id $devProc.Id -Force -ErrorAction SilentlyContinue
        throw "cloudflared zakonczyl sie z kodem $($tunnelProc.ExitCode).`n$tail"
    }
    foreach ($log in @($CfErr, $CfOut)) {
        $text = Get-Content $log -Raw -ErrorAction SilentlyContinue
        if ($text) {
            $match = [regex]::Match($text, $urlPattern)
            if ($match.Success) { $tunnelUrl = $match.Value; break }
        }
    }
    if ($tunnelUrl) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $tunnelUrl) {
    Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $devProc.Id -Force -ErrorAction SilentlyContinue
    throw "Nie udalo sie odczytac adresu tunelu w ciagu $TunnelTimeoutSeconds s. Logi: $CfErr, $CfOut"
}

$tunnelHost = ([uri]$tunnelUrl).Host
Write-Host "Adres tunelu: $tunnelUrl"

# ------------------------------------------------------ zapis do vite.config --

$configText = [System.IO.File]::ReadAllText($ConfigPath)
$entry = "allowedHosts: ['$tunnelHost']"
$evaluator = [System.Text.RegularExpressions.MatchEvaluator] { param($m) $entry }

if ([regex]::IsMatch($configText, 'allowedHosts\s*:\s*\[[^\]]*\]')) {
    $rx = New-Object System.Text.RegularExpressions.Regex('allowedHosts\s*:\s*\[[^\]]*\]')
    $newText = $rx.Replace($configText, $evaluator, 1)
} elseif ([regex]::IsMatch($configText, 'server\s*:\s*\{')) {
    $rx = New-Object System.Text.RegularExpressions.Regex('server\s*:\s*\{')
    $insert = [System.Text.RegularExpressions.MatchEvaluator] { param($m) "server: {`r`n    $entry," }
    $newText = $rx.Replace($configText, $insert, 1)
} else {
    $lastBrace = $configText.LastIndexOf('});')
    if ($lastBrace -lt 0) {
        throw "Nie rozpoznano struktury vite.config.ts - dodaj recznie: server: { $entry }"
    }
    $newText = $configText.Substring(0, $lastBrace) +
               "  server: {`r`n    $entry,`r`n  },`r`n" +
               $configText.Substring($lastBrace)
}

if ($newText -eq $configText) {
    Write-Host 'vite.config.ts juz wskazuje ten adres - bez zmian.'
} else {
    Write-Utf8NoBom -Path $ConfigPath -Content $newText
    Write-Host "Zapisano allowedHosts = ['$tunnelHost'] w vite.config.ts"
    Write-Host 'Vite wykryje zmiane konfiguracji i zrestartuje serwer samoczynnie.'
}

# ------------------------------------------------------------------- zapis --

$state = @{
    dev = @{
        name = 'npm run dev'
        pid = $devProc.Id
        startTime = $devProc.StartTime.ToString('o')
    }
    tunnel = @{
        name = 'cloudflared'
        pid = $tunnelProc.Id
        startTime = $tunnelProc.StartTime.ToString('o')
    }
    url = $tunnelUrl
    host = $tunnelHost
    port = $Port
    startedAt = (Get-Date).ToString('o')
}
Write-Utf8NoBom -Path $PidFile -Content ($state | ConvertTo-Json -Depth 4)

Write-Host ''
Write-Host '============================================================'
Write-Host "  Aplikacja dostepna pod: $tunnelUrl"
Write-Host "  Lokalnie:               http://localhost:$Port"
Write-Host "  Logi:                   .tunnel-run\"
Write-Host "  Zatrzymanie:            -Stop  (dodaj -Restore, zeby cofnac zmiane w vite.config.ts)"
Write-Host '============================================================'
Write-Host ''
Write-Host 'UWAGA: adres jest publiczny dla kazdego, kto go zna. Cloudflare Access'
Write-Host 'nie dziala na trycloudflare.com, wiec jedyna kontrola dostepu jest'
Write-Host 'logowanie samej aplikacji. Nie przekazuj adresu, zanim ono nie dziala.'
