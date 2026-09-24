#Requires -Version 5.1
<#
.SYNOPSIS
  Buduje wersje produkcyjna, uruchamia react-router-serve na porcie 3000
  i wystawia go przez Cloudflare Quick Tunnel.

.DESCRIPTION
  Wariant produkcyjny skryptu start-tunnel.ps1. Roznice wzgledem tamtego:

  - buduje przed startem (npm run build), bo react-router-serve serwuje build/,
    a nie zrodla;
  - NIE dotyka vite.config.ts. react-router-serve nie sprawdza naglowka Host,
    wiec allowedHosts jest tu bez znaczenia - to ustawienie serwera Vite,
    czyli wylacznie trybu deweloperskiego;
  - trzyma wlasny plik stanu (.tunnel-run/prod-pids.json) i wlasne logi, zeby
    dev i prod daly sie prowadzic rownolegle, a -Stop jednego nie ubijal drugiego;
  - czeka na HTTP 200, a nie na sam nasluch portu. Przy bledzie w
    build/server/index.js port otwiera sie normalnie, a kazde zadanie zwraca 500 -
    nasluch portu potwierdzilby wtedy gotowosc, ktorej nie ma.

.PARAMETER Port
  Port serwera produkcyjnego. Domyslnie 3000.

.PARAMETER SkipBuild
  Pomija npm run build. Do powtornego startu na aktualnym build/.

.PARAMETER Stop
  Zatrzymuje procesy uruchomione poprzednim wywolaniem i konczy dzialanie.
#>
[CmdletBinding()]
param(
    [int]$Port = 3000,
    [string]$ProjectRoot = (Get-Location).Path,
    [int]$BuildTimeoutSeconds = 300,
    [int]$ReadyTimeoutSeconds = 60,
    [int]$TunnelTimeoutSeconds = 60,
    [switch]$SkipBuild,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$StateDir = Join-Path $ProjectRoot '.tunnel-run'
$PidFile  = Join-Path $StateDir 'prod-pids.json'
$UrlFile  = Join-Path $StateDir 'prod-url.txt'
$SrvOut   = Join-Path $StateDir 'prod.out.log'
$SrvErr   = Join-Path $StateDir 'prod.err.log'
$CfOut    = Join-Path $StateDir 'cf-prod.out.log'
$CfErr    = Join-Path $StateDir 'cf-prod.err.log'

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Stop-ProcessTree {
    # 'npm run start' uruchamia lancuch npm -> node. Stop-Process ubija sam proces
    # nadrzedny i osieroca wlasciwy serwer, ktory dalej trzyma port. taskkill /T
    # zamyka cale drzewo potomkow.
    param([int]$ProcessId)
    $null = & taskkill.exe /PID $ProcessId /T /F 2>&1
    return ($LASTEXITCODE -eq 0)
}

function Stop-TrackedProcesses {
    if (-not (Test-Path $PidFile)) {
        Write-Host 'Brak zapisanego stanu produkcyjnego - nic do zatrzymania.'
        return
    }
    $state = Get-Content $PidFile -Raw | ConvertFrom-Json
    foreach ($entry in @($state.server, $state.tunnel)) {
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
    # klamie - curl dostaje odpowiedz z poprzedniego buildu. Dlatego sprzatamy go
    # jawnie, ale tylko jesli nalezy do tego projektu.
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
    Remove-Item $UrlFile -Force -ErrorAction SilentlyContinue
}

if ($Stop) {
    Stop-TrackedProcesses
    exit 0
}

# ---------------------------------------------------------------- preflight --

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "Nie znaleziono package.json w '$ProjectRoot'. Uruchom skrypt z katalogu glownego projektu albo podaj -ProjectRoot."
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

# react-router-serve nie zwalnia portu, gdy ubijesz sam proces nadrzedny. Zajety
# port 3000 to najczestsza przyczyna cichego falszu: tunel wstaje poprawnie, ale
# odpowiada poprzedni build.
$occupied = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
    $holders = ($occupied | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "Port $Port jest juz zajety (PID: $holders). Zatrzymaj stary proces (-Stop) albo uruchom z innym -Port."
}

if (-not (Test-Path $StateDir)) {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}
foreach ($log in @($SrvOut, $SrvErr, $CfOut, $CfErr)) {
    Write-Utf8NoBom -Path $log -Content ''
}

# -------------------------------------------------------------------- build --

if (-not $SkipBuild) {
    Write-Host 'Buduje wersje produkcyjna (npm run build)...'
    # NODE_ENV jawnie, bo Vite ustawia 'production' tylko przy PUSTEJ zmiennej.
    # 'development' odziedziczone z powloki wpuszcza do buildu trasy tylko-dev
    # (wzornik w app/routes.ts) - publiczne, poza brama sesji.
    $prevNodeEnv = $env:NODE_ENV
    $env:NODE_ENV = 'production'
    try {
        $buildProc = Start-Process -FilePath $npm.Source `
            -ArgumentList 'run', 'build' `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden -PassThru
    } finally {
        $env:NODE_ENV = $prevNodeEnv
    }
    if (-not $buildProc.WaitForExit($BuildTimeoutSeconds * 1000)) {
        Stop-ProcessTree -ProcessId $buildProc.Id | Out-Null
        throw "Build nie zakonczyl sie w ciagu $BuildTimeoutSeconds s."
    }
    if ($buildProc.ExitCode -ne 0) {
        throw "Build zakonczyl sie kodem $($buildProc.ExitCode). Nic nie zostalo uruchomione."
    }
    Write-Host 'Build zakonczony.'
}

$serverEntry = Join-Path $ProjectRoot 'build\server\index.js'
if (-not (Test-Path $serverEntry)) {
    throw "Brak $serverEntry. Uruchom bez -SkipBuild."
}

# ------------------------------------------------------- serwer produkcyjny --

# PORT ustawiamy jawnie, bo bez niego react-router-serve wywoluje
# getAvailablePort(3000) i przy zajetym porcie PO CICHU wybiera losowy wolny.
# Z jawnym PORT dostajemy glosny EADDRINUSE zamiast cichego dryfu.
# HOST=127.0.0.1 ogranicza nasluch do petli zwrotnej - bez tego Express slucha na
# wszystkich interfejsach i aplikacja jest widoczna dla calej sieci lokalnej.
# Z petla zwrotna jedyna droga do aplikacji jest tunel.
# NODE_ENV=production z tego samego powodu co przy buildzie: react-router-serve
# ustawia go tylko przy pustej zmiennej, a loader wzornika zwraca 404 wylacznie
# poza 'development'. Obie oslony wzornika czytaja ten sam sygnal.
$prevPort = $env:PORT
$prevHost = $env:HOST
$prevNodeEnv = $env:NODE_ENV
$env:PORT = "$Port"
$env:HOST = '127.0.0.1'
$env:NODE_ENV = 'production'
try {
    Write-Host "Uruchamiam serwer produkcyjny na 127.0.0.1:$Port..."
    $srvProc = Start-Process -FilePath $npm.Source `
        -ArgumentList 'run', 'start' `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $SrvOut `
        -RedirectStandardError $SrvErr `
        -WindowStyle Hidden -PassThru
} finally {
    $env:PORT = $prevPort
    $env:HOST = $prevHost
    $env:NODE_ENV = $prevNodeEnv
}

# Czekamy na HTTP 200, nie na sam nasluch portu - patrz .DESCRIPTION.
$deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
    if ($srvProc.HasExited) {
        $tail = (Get-Content $SrvErr -Tail 20 -ErrorAction SilentlyContinue) -join "`n"
        throw "Serwer zakonczyl sie z kodem $($srvProc.ExitCode).`n$tail"
    }
    try {
        if ((Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) {
    Stop-ProcessTree -ProcessId $srvProc.Id | Out-Null
    throw "Serwer nie zwrocil HTTP 200 w ciagu $ReadyTimeoutSeconds s. Logi: $SrvOut, $SrvErr"
}
Write-Host "Serwer odpowiada: http://127.0.0.1:$Port/"

# -------------------------------------------------------------------- tunel --

# --protocol http2 zamiast domyslnego QUIC: obchodzi udokumentowane petle
# rekonnektu ('timeout: no recent network activity', cloudflared #1440).
Write-Host 'Uruchamiam Cloudflare Quick Tunnel...'
$tunnelProc = Start-Process -FilePath $cloudflared `
    -ArgumentList 'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', "http://localhost:$Port" `
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
        Stop-ProcessTree -ProcessId $srvProc.Id | Out-Null
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
    Stop-ProcessTree -ProcessId $tunnelProc.Id | Out-Null
    Stop-ProcessTree -ProcessId $srvProc.Id | Out-Null
    throw "Nie udalo sie odczytac adresu tunelu w ciagu $TunnelTimeoutSeconds s. Logi: $CfErr, $CfOut"
}

$tunnelHost = ([uri]$tunnelUrl).Host

# --------------------------------------------------------------- zapis stanu --

$state = @{
    server = @{
        name = 'npm run start'
        pid = $srvProc.Id
        startTime = $srvProc.StartTime.ToString('o')
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
Write-Utf8NoBom -Path $UrlFile -Content $tunnelUrl

# ------------------------------------------------- kontrola rozwiazania nazwy --

# Tunel potrafi dzialac poprawnie, a mimo to byc nieosiagalny z TEJ maszyny:
# czesc resolverow (routery domowe z filtrem malware, firmowe DNS, EDR) zwraca
# NXDOMAIN dla subdomen *.trycloudflare.com, bo domena jest masowo naduzywana.
# Apex 'trycloudflare.com' rozwiazuje sie wtedy normalnie, co myli przy diagnozie.
$dnsOk = $true
try {
    $null = Resolve-DnsName $tunnelHost -ErrorAction Stop
} catch {
    $dnsOk = $false
}

Write-Host ''
Write-Host '============================================================'
Write-Host "  Aplikacja dostepna pod: $tunnelUrl"
Write-Host "  Lokalnie:               http://127.0.0.1:$Port"
Write-Host "  Logi:                   .tunnel-run\prod.*.log, cf-prod.*.log"
Write-Host "  Zatrzymanie:            -Stop"
Write-Host '============================================================'
Write-Host ''

if (-not $dnsOk) {
    Write-Warning "Twoj domyslny resolver DNS nie rozwiazuje '$tunnelHost'."
    Write-Host '  Tunel dziala - to lokalne filtrowanie DNS, nie blad wdrozenia.'
    Write-Host '  Sprawdzenie z pominieciem resolvera:'
    # Bez -f: '%{http_code}' to skladnia curla, a operator formatujacy PowerShella
    # wzialby '{http_code}' za wlasny placeholder i wywalil sie na formacie.
    $cfIp = (Resolve-DnsName $tunnelHost -Server '1.1.1.1' -Type A -ErrorAction SilentlyContinue |
             Where-Object { $_.IPAddress } | Select-Object -First 1).IPAddress
    if (-not $cfIp) { $cfIp = '104.16.230.132' }
    Write-Host ('    curl.exe -s -o NUL -w "%{http_code}" --resolve "' + $tunnelHost + ':443:' + $cfIp + '" ' + $tunnelUrl + '/')
    Write-Host '  Trwale rozwiazanie: ustaw DNS na 1.1.1.1 albo wlacz DNS-over-HTTPS'
    Write-Host '  w przegladarce. Odbiorcy w innych sieciach moga miec ten sam problem.'
    Write-Host ''
}

Write-Host 'UWAGA: adres jest publiczny dla kazdego, kto go zna. Cloudflare Access'
Write-Host 'nie dziala na trycloudflare.com, wiec jedyna kontrola dostepu jest'
Write-Host 'logowanie samej aplikacji. Nie przekazuj adresu, zanim ono nie dziala.'
