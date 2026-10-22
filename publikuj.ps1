#Requires -Version 5.1
<#
.SYNOPSIS
  Buduje cel lokalny albo dwie paczki ZIP do recznego wgrania na MonsterASP
  (witryna GUI i witryna API). Przelacznik -KopiaBazy dokleja spojna kopie
  bazy do pierwszego wgrania.

.DESCRIPTION
  Jeden punkt wejscia dla obu celow wdrozenia (plan hosting-monsterasp, Faza 4).

  -Cel Lokalny (domyslnie) - to samo, co przed MonsterASP:
    1. npm run typecheck,
    2. npm run build bez TG_CEL i TG_HOST (allowedActionOrigins dla quick
       tunnelu, *.trycloudflare.com),
    3. dotnet build TreeGrid.sln (Debug - na nim startuje start-api.ps1),
  a na koncu wypisuje polecenia startu (start-api.ps1, start-prod-tunnel.ps1).
  Niczego nie uruchamia.

  -Cel MonsterAsp - dwie paczki w katalogu wyjsciowym:
    - treegrid-gui-<krotki sha>.zip: build z TG_CEL=monsterasp
      i TG_HOST=<HostGui> (allowedActionOrigins to dokladnie host GUI),
      build/, package.json, package-lock.json, produkcyjne node_modules
      (npm ci --omit=dev w stagingu) i web.config z
      deploy/monsterasp/gui.web.config z podstawionymi hostami obu witryn;
    - treegrid-api-<krotki sha>.zip: dotnet publish src/Api -c Release
      -r win-x64 --self-contained (na serwerze nie ma wspoldzielonego .NET 10,
      framework-dependent daje 500.31) z web.config z
      deploy/monsterasp/api.web.config, kopiowanym PO publikacji, bo publikacja
      generuje wlasny plik; bez db/, Log/, MailOutbox/, plikow bazy
      i appsettings.Development.json.
  Na koncu wypisuje kolejnosc wgrania. Skrypt nie potrzebuje zadnych
  poswiadczen i niczego nie wysyla - wgranie jest reczne (panel albo FTP).
  Sekrety ustawia sie w panelu witryn; skrypt wypisuje wylacznie ich nazwy.

  UWAGA: po -Cel MonsterAsp katalog build/ w repo zawiera build MonsterASP
  (allowedActionOrigins = host GUI). start-prod-tunnel.ps1 bez -SkipBuild
  buduje go od nowa; z -SkipBuild akcje zza tunelu konczylyby sie 400.
  Przywraca go tez .\publikuj.ps1 -Cel Lokalny.

  -KopiaBazy (tylko z -Cel MonsterAsp) kopiuje src/Api/db/treegrid.db do
  <Wyjscie>/db/ do pierwszego wgrania do tg-data. Odmawia, gdy API slucha na
  porcie 5180, gdy src/Api/db/treegrid.db-wal nie jest pusty (czesc zapisow
  jest jeszcze tylko w WAL) albo gdy plik bazy trzyma inny proces. Kopia niesie
  konta i hasze hasel - out/ jest w .gitignore.

.PARAMETER Cel
  Lokalny (domyslnie) albo MonsterAsp.

.PARAMETER HostGui
  Sama nazwa hosta witryny GUI (np. g.runasp.net) - bez schematu, sciezki
  i portu. Wymagany dla MonsterAsp. Trafia do allowedActionOrigins w buildzie
  i do przekierowania HTTP -> HTTPS w web.config GUI.

.PARAMETER HostApi
  Sama nazwa hosta witryny API (np. a.runasp.net), rozna od HostGui. Wymagany
  dla MonsterAsp. Trafia do TREEGRID_API_URL (https://<HostApi>) w web.config GUI.

.PARAMETER KopiaBazy
  Dokleja do wyniku kopie bazy (patrz .DESCRIPTION). Tylko z -Cel MonsterAsp.

.PARAMETER Wyjscie
  Katalog wyjsciowy. Domyslnie out\<cel> w katalogu projektu (out\monsterasp).
  Poprzednie paczki treegrid-*.zip z tego katalogu sa usuwane.

.EXAMPLE
  .\publikuj.ps1

.EXAMPLE
  .\publikuj.ps1 -Cel MonsterAsp -HostGui g.runasp.net -HostApi a.runasp.net -KopiaBazy
#>
[CmdletBinding()]
param(
    [ValidateSet('Lokalny', 'MonsterAsp')]
    [string]$Cel = 'Lokalny',
    [string]$HostGui,
    [string]$HostApi,
    [switch]$KopiaBazy,
    [string]$Wyjscie,
    [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

# PowerShell 5.1 uruchomiony z -File zostawia $PSScriptRoot pusty w bloku
# param() - w ciele skryptu jest juz ustawiony.
if (-not $ProjectRoot) { $ProjectRoot = $PSScriptRoot }

$ApiPort      = 5180
$ApiProject   = Join-Path $ProjectRoot 'src\Api'
$DatabasePath = Join-Path $ApiProject 'db\treegrid.db'
$GuiTemplate  = Join-Path $ProjectRoot 'deploy\monsterasp\gui.web.config'
$ApiTemplate  = Join-Path $ProjectRoot 'deploy\monsterasp\api.web.config'
$ScriptsRel   = '.\.claude\skills\run-tunel-app\scripts'

# Zrodla paczek - zmiana w nich po ostatnim commicie znaczy, ze krotki sha
# w nazwie ZIP nie identyfikuje zawartosci.
$PackageSources = @('app', 'public', 'src/Api', 'deploy', 'package.json', 'package-lock.json',
                    'react-router.config.ts', 'vite.config.ts', 'tsconfig.json')

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

function Invoke-WithEnvironment {
    # Ustawia zmienne procesu tylko na czas jednego polecenia i przywraca
    # poprzednie wartosci w finally, wiec terminal zostaje taki jak przed
    # skryptem. Wartosc $null usuwa zmienna na ten czas - np. TG_CEL
    # odziedziczone z powloki nie moze trafic do builda lokalnego.
    param([hashtable]$Variables, [scriptblock]$Command)
    $previous = @{}
    foreach ($name in $Variables.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $Variables[$name], 'Process')
    }
    try {
        & $Command
    } finally {
        foreach ($name in $previous.Keys) {
            [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
        }
    }
}

function Resolve-HostName {
    # Sama nazwa hosta: etykiety z liter, cyfr i lacznikow, co najmniej jedna
    # kropka. Odrzuca schemat, sciezke, port i wildcard - taki wpis nie pasowalby
    # do zadnego Origin w allowedActionOrigins, a w web.config dalby zly adres.
    # Male litery, bo przegladarki wysylaja Origin z hostem malymi literami.
    param([string]$Value, [string]$Parameter, [string]$Example)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "-Cel MonsterAsp wymaga parametru -$Parameter (sama nazwa hosta, np. $Example)."
    }
    $pattern = '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
    if ($Value -notmatch $pattern) {
        throw "-$Parameter '$Value' nie jest sama nazwa hosta. Podaj ja bez schematu, sciezki i portu, np. $Example."
    }
    return $Value.ToLowerInvariant()
}

function Get-ShortSha {
    $ErrorActionPreference = 'Continue'
    $sha = & git -C $ProjectRoot rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace("$sha")) {
        throw 'Nie udalo sie odczytac skrotu commita (git rev-parse --short HEAD).'
    }
    return "$sha".Trim()
}

function Test-SourcesDirty {
    $ErrorActionPreference = 'Continue'
    $changes = & git -C $ProjectRoot status --porcelain -- $PackageSources 2>$null
    return ($LASTEXITCODE -eq 0 -and $changes)
}

function Assert-DatabaseCopyAllowed {
    # Kopia samego pliku bazy jest spojna tylko wtedy, gdy nikt do niej nie
    # pisze, a WAL jest pusty - inaczej czesc zapisow zostaje w treegrid.db-wal
    # i kopia by ich nie miala (lekcja SQLite: baza dziala w trybie WAL).
    if (-not (Test-Path -LiteralPath $DatabasePath)) {
        throw "Brak pliku bazy '$DatabasePath' - nie ma czego kopiowac."
    }
    $listeners = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
        $holders = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
        throw ("API slucha na porcie $ApiPort (PID: $holders) - kopia bazy przy dzialajacym API moze byc niespojna.`n" +
               "Zatrzymaj API (.\buduj_app_dev.ps1 -Stop albo $ScriptsRel\start-api.ps1 -Stop) i uruchom skrypt ponownie.")
    }
    $wal = Get-Item -LiteralPath "$DatabasePath-wal" -ErrorAction SilentlyContinue
    if ($wal -and $wal.Length -gt 0) {
        throw ("Plik '$($wal.FullName)' nie jest pusty ($($wal.Length) B) - czesc zapisow jest jeszcze tylko w WAL,`n" +
               "a kopia samego treegrid.db by ich nie miala. Zatrzymaj API, zeby WAL sie zamknal, i uruchom skrypt ponownie.")
    }
}

function Copy-DatabaseSnapshot {
    param([string]$TargetDir)
    Assert-DatabaseCopyAllowed
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Get-ChildItem -LiteralPath $TargetDir -Filter 'treegrid.db*' -File -ErrorAction SilentlyContinue |
        Remove-Item -Force
    $target = Join-Path $TargetDir 'treegrid.db'

    # FileShare.None: otwarcie udaje sie tylko wtedy, gdy zaden inny proces nie
    # trzyma pliku (API na innym porcie, narzedzie SQLite), i nikt go nie
    # otworzy, dopoki kopia trwa.
    try {
        $source = [System.IO.File]::Open($DatabasePath, 'Open', 'Read', 'None')
    } catch {
        throw ("Plik bazy '$DatabasePath' jest otwarty przez inny proces (API na innym porcie? narzedzie SQLite?).`n" +
               "Zamknij go i uruchom skrypt ponownie. Szczegoly: $($_.Exception.Message)")
    }
    try {
        $destination = [System.IO.File]::Open($target, 'Create', 'Write', 'None')
        try {
            $source.CopyTo($destination)
        } finally {
            $destination.Dispose()
        }
    } finally {
        $source.Dispose()
    }
    return $target
}

function Remove-Directory {
    # rd /s /q zamiast Remove-Item -Recurse: node_modules w stagingu ma tysiace
    # katalogow, a Remove-Item w PowerShell 5.1 jest na nich wolny i potrafi
    # zawiesc na dlugich sciezkach.
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $ErrorActionPreference = 'Continue'
    $null = & cmd.exe /d /c "rd /s /q `"$Path`"" 2>&1
    if (Test-Path -LiteralPath $Path) {
        throw "Nie udalo sie usunac katalogu '$Path'."
    }
}

function New-ZipFromDirectory {
    # Wlasna petla po ZipArchive zamiast Compress-Archive i
    # ZipFile.CreateFromDirectory: w PowerShell 5.1 (.NET Framework) oba potrafia
    # zapisac nazwy wpisow z '\', a rozpakowanie takiego archiwum poza Windows
    # (albo przez narzedzie panelu) daje pliki z ukosnikami w nazwie zamiast
    # katalogow. Tu kazda nazwa jest wzgledna wobec korzenia paczki i ma '/'.
    # Puste katalogi (np. logs/ w paczce GUI) dostaja wlasny wpis 'nazwa/'.
    param([string]$Source, [string]$Destination)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $Destination) {
        Remove-Item -LiteralPath $Destination -Force
    }
    $root = [System.IO.Path]::GetFullPath($Source).TrimEnd('\') + '\'
    $level = [System.IO.Compression.CompressionLevel]::Optimal
    $zip = [System.IO.Compression.ZipFile]::Open($Destination, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $entries = [System.IO.Directory]::EnumerateFileSystemEntries($root, '*', [System.IO.SearchOption]::AllDirectories)
        foreach ($path in $entries) {
            $name = $path.Substring($root.Length).Replace('\', '/')
            if ([System.IO.Directory]::Exists($path)) {
                $isEmpty = -not [System.IO.Directory]::EnumerateFileSystemEntries($path).GetEnumerator().MoveNext()
                if ($isEmpty) { [void]$zip.CreateEntry("$name/") }
            } else {
                [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $path, $name, $level)
            }
        }
    } finally {
        $zip.Dispose()
    }
}

function Assert-Paths {
    # Kontrola zawartosci stagingu przed spakowaniem - brak pliku albo plik,
    # ktory nie mial trafic do paczki, przerywa skrypt zamiast dac paczke,
    # ktora wywali sie dopiero na serwerze.
    param([string]$Root, [string]$Label, [string[]]$Required, [string[]]$Forbidden)
    foreach ($rel in $Required) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $rel))) {
            throw "Paczka $Label nie zawiera '$rel'."
        }
    }
    foreach ($rel in $Forbidden) {
        if (Test-Path -LiteralPath (Join-Path $Root $rel)) {
            throw "Paczka $Label zawiera '$rel', ktory nie moze trafic na serwer."
        }
    }
}

# ---------------------------------------------------------------- preflight --

if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "Nie znaleziono package.json w '$ProjectRoot'."
}

$isMonsterAsp = ($Cel -eq 'MonsterAsp')

if ($isMonsterAsp) {
    $HostGui = Resolve-HostName -Value $HostGui -Parameter 'HostGui' -Example 'g.runasp.net'
    $HostApi = Resolve-HostName -Value $HostApi -Parameter 'HostApi' -Example 'a.runasp.net'
    if ($HostGui -eq $HostApi) {
        throw "-HostGui i -HostApi musza byc rozne ('$HostGui'): GUI i API to dwie osobne witryny MonsterASP."
    }
    foreach ($template in @($GuiTemplate, $ApiTemplate)) {
        if (-not (Test-Path -LiteralPath $template)) { throw "Nie znaleziono wzorca '$template'." }
    }
} else {
    if ($HostGui -or $HostApi) {
        Write-Warning '-HostGui i -HostApi dotycza tylko -Cel MonsterAsp - pomijam.'
    }
    if ($KopiaBazy) {
        throw '-KopiaBazy dotyczy tylko -Cel MonsterAsp (kopia do pierwszego wgrania do tg-data).'
    }
    if ($Wyjscie) {
        Write-Warning '-Wyjscie dotyczy tylko -Cel MonsterAsp - cel lokalny nie tworzy paczek, pomijam.'
    }
}

if (-not (Get-Command 'dotnet' -ErrorAction SilentlyContinue)) {
    throw 'Nie znaleziono dotnet w PATH.'
}
$npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command 'npm' -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'Nie znaleziono npm w PATH.' }

if ($isMonsterAsp) {
    if (-not $Wyjscie) {
        $Wyjscie = Join-Path $ProjectRoot ('out\' + $Cel.ToLowerInvariant())
    } elseif (-not [System.IO.Path]::IsPathRooted($Wyjscie)) {
        $Wyjscie = Join-Path (Get-Location).Path $Wyjscie
    }
    $Wyjscie = [System.IO.Path]::GetFullPath($Wyjscie)

    # Przed buildem: odmowa kopii bazy ma pasc od razu, a nie po kilku minutach.
    if ($KopiaBazy) { Assert-DatabaseCopyAllowed }

    $sha = Get-ShortSha
    if (Test-SourcesDirty) {
        Write-Warning ("Zrodla paczek maja niezacommitowane zmiany - nazwa ZIP niesie skrot $sha, " +
                       'ale zawartosc nie odpowiada temu commitowi.')
    }
}

# ---------------------------------------------------------------- budowanie --

Push-Location $ProjectRoot
try {
    if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
        Write-Step 'Instalacja zaleznosci (npm ci)'
        Invoke-Checked 'npm ci' { & $npm.Source ci }
    }

    if (-not $isMonsterAsp) {
        # NODE_ENV jawnie, jak w start-prod-tunnel.ps1: Vite ustawia
        # 'production' tylko przy PUSTEJ zmiennej, a 'development' z powloki
        # wpuszcza do builda trasy tylko-dev (wzornik) - publiczne, poza brama.
        $localEnv = @{ TG_CEL = $null; TG_HOST = $null; NODE_ENV = 'production' }

        Write-Step 'Typecheck (npm run typecheck)'
        Invoke-WithEnvironment $localEnv { Invoke-Checked 'npm run typecheck' { & $npm.Source run typecheck } }

        Write-Step 'Build frontendu (npm run build, cel lokalny)'
        Invoke-WithEnvironment $localEnv { Invoke-Checked 'npm run build' { & $npm.Source run build } }

        Write-Step 'Build backendu (dotnet build TreeGrid.sln)'
        try {
            Invoke-Checked 'dotnet build' { dotnet build (Join-Path $ProjectRoot 'TreeGrid.sln') --nologo -v q }
        } catch {
            throw ("$($_.Exception.Message) Przy bledzie MSB3021/MSB3027 ('file is locked by Api') zatrzymaj API " +
                   "(.\buduj_app_dev.ps1 -Stop albo $ScriptsRel\start-api.ps1 -Stop).")
        }
    } else {
        $stagingRoot = Join-Path $Wyjscie 'staging'
        $guiStage = Join-Path $stagingRoot 'gui'
        $apiStage = Join-Path $stagingRoot 'api'
        $guiZip = Join-Path $Wyjscie "treegrid-gui-$sha.zip"
        $apiZip = Join-Path $Wyjscie "treegrid-api-$sha.zip"

        New-Item -ItemType Directory -Path $Wyjscie -Force | Out-Null
        Remove-Directory $stagingRoot
        # Paczki z poprzednich commitow obok nowych to proszenie sie o wgranie
        # niewlasciwej - zostaja tylko te z tego przebiegu.
        Get-ChildItem -LiteralPath $Wyjscie -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^treegrid-(gui|api)-.+\.zip$' } |
            Remove-Item -Force

        # ------------------------------------------------------- paczka GUI --

        Write-Step "Paczka GUI: build (TG_CEL=monsterasp, TG_HOST=$HostGui)"
        $guiEnv = @{ TG_CEL = 'monsterasp'; TG_HOST = $HostGui; NODE_ENV = 'production' }
        Invoke-WithEnvironment $guiEnv { Invoke-Checked 'npm run build' { & $npm.Source run build } }

        # Host GUI jest wpisywany w build w chwili budowania - sprawdzamy, ze
        # trafil tam dokladnie on, zanim build pojedzie do paczki.
        $serverEntry = Join-Path $ProjectRoot 'build\server\index.js'
        $expectedOrigins = 'allowedActionOrigins = ["' + $HostGui + '"]'
        if (-not ([System.IO.File]::ReadAllText($serverEntry)).Contains($expectedOrigins)) {
            throw "build\server\index.js nie zawiera '$expectedOrigins' - build nie jest buildem MonsterASP dla tego hosta."
        }

        Write-Step 'Paczka GUI: staging i zaleznosci produkcyjne (npm ci --omit=dev)'
        New-Item -ItemType Directory -Path $guiStage -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $ProjectRoot 'build') -Destination $guiStage -Recurse
        Copy-Item -LiteralPath (Join-Path $ProjectRoot 'package.json') -Destination $guiStage
        Copy-Item -LiteralPath (Join-Path $ProjectRoot 'package-lock.json') -Destination $guiStage
        Push-Location $guiStage
        try {
            Invoke-Checked 'npm ci --omit=dev' { & $npm.Source ci --omit=dev --no-audit --no-fund }
        } finally {
            Pop-Location
        }

        Write-Step 'Paczka GUI: web.config z deploy\monsterasp\gui.web.config'
        $template = [System.IO.File]::ReadAllText($GuiTemplate, [System.Text.Encoding]::UTF8)
        foreach ($placeholder in @('{{HOST_GUI}}', '{{HOST_API}}')) {
            if (-not $template.Contains($placeholder)) {
                throw "Wzorzec '$GuiTemplate' nie zawiera $placeholder - podstawienie nic by nie zmienilo."
            }
        }
        $guiConfig = $template.Replace('{{HOST_API}}', $HostApi).Replace('{{HOST_GUI}}', $HostGui)
        if ($guiConfig.Contains('{{')) {
            throw "Po podstawieniu hostow w web.config GUI zostal placeholder '{{' - popraw wzorzec '$GuiTemplate'."
        }
        try {
            $null = [xml]$guiConfig
        } catch {
            throw "web.config GUI po podstawieniu nie jest poprawnym XML: $($_.Exception.Message)"
        }
        Write-Utf8NoBom -Path (Join-Path $guiStage 'web.config') -Content $guiConfig
        # Katalog na stdoutLogFile (.\logs\node-stdout): sonda z Fazy 1 zakladala
        # go recznie, bo HttpPlatformHandler moze go sam nie utworzyc - wtedy
        # linie api_failure po cichu by przepadaly.
        New-Item -ItemType Directory -Path (Join-Path $guiStage 'logs') -Force | Out-Null

        Assert-Paths -Root $guiStage -Label 'GUI' `
            -Required @('web.config', 'build\server\index.js', 'build\client',
                        'node_modules\@react-router\serve\dist\cli.js') `
            -Forbidden @('node_modules\vite', 'node_modules\@react-router\dev', 'node_modules\@playwright')
        # typescript w node_modules jest tu poprawny: to peer dependency
        # @react-router/node i @react-router/express, ktora npm instaluje
        # takze przy --omit=dev.

        Write-Step "Paczka GUI: $guiZip"
        New-ZipFromDirectory -Source $guiStage -Destination $guiZip

        # ------------------------------------------------------- paczka API --

        Write-Step 'Paczka API: dotnet publish (Release, win-x64, self-contained)'
        Invoke-Checked 'dotnet publish' {
            dotnet publish $ApiProject -c Release -r win-x64 --self-contained -o $apiStage --nologo -v q
        }

        # PO publikacji - publikacja generuje wlasny web.config (bez
        # ASPNETCORE_ENVIRONMENT=MonsterAsp) i nadpisalaby wzorzec.
        Copy-Item -LiteralPath $ApiTemplate -Destination (Join-Path $apiStage 'web.config') -Force

        # Dane, logi i poczta petli deweloperskiej nie jada na serwer: baza
        # i log witryny leza w tg-data (appsettings.MonsterAsp.json), a
        # appsettings.Development.json nie ma tam czego szukac. Pliki bazy po
        # rozszerzeniu, a nie wzorcem *.db*, ktory zlapalby tez np. *.DbContext.dll.
        foreach ($dir in @('db', 'Log', 'MailOutbox', 'logs')) {
            Remove-Directory (Join-Path $apiStage $dir)
        }
        Get-ChildItem -LiteralPath $apiStage -Recurse -File -Force |
            Where-Object { $_.Name -match '\.db(-wal|-shm|-journal)?$' -or $_.Name -eq 'appsettings.Development.json' } |
            Remove-Item -Force

        Assert-Paths -Root $apiStage -Label 'API' `
            -Required @('Api.exe', 'Api.dll', 'e_sqlite3.dll', 'web.config', 'appsettings.json', 'appsettings.MonsterAsp.json') `
            -Forbidden @('db', 'Log', 'MailOutbox', 'appsettings.Development.json')
        $apiConfig = [System.IO.File]::ReadAllText((Join-Path $apiStage 'web.config'))
        if (-not ($apiConfig.Contains('.\Api.exe') -and $apiConfig.Contains('MonsterAsp'))) {
            throw 'web.config API nie jest wzorcem z deploy\monsterasp\api.web.config.'
        }

        Write-Step "Paczka API: $apiZip"
        New-ZipFromDirectory -Source $apiStage -Destination $apiZip

        Remove-Directory $stagingRoot

        # ------------------------------------------------------- kopia bazy --

        $dbCopy = $null
        if ($KopiaBazy) {
            Write-Step 'Kopia bazy do pierwszego wgrania'
            $dbCopy = Copy-DatabaseSnapshot -TargetDir (Join-Path $Wyjscie 'db')
        }
    }
} finally {
    Pop-Location
}

# ------------------------------------------------------------- podsumowanie --

Write-Host ''
Write-Host '============================================================'
if (-not $isMonsterAsp) {
    Write-Host '  Cel lokalny zbudowany (build\ i Debug API). Start:'
    Write-Host "    $ScriptsRel\start-api.ps1 -SkipBuild"
    Write-Host "    $ScriptsRel\start-prod-tunnel.ps1 -SkipBuild"
    Write-Host '  start-api.ps1 startuje domyslnie w Production - przy oczekujacych'
    Write-Host '  migracjach odmawia startu (dotnet ef database update --project src/Api).'
    Write-Host '  Petla deweloperska bez tunelu: .\buduj_app_dev.ps1'
    Write-Host '============================================================'
    exit 0
}

Write-Host "  Paczka GUI:  $guiZip"
Write-Host "  Paczka API:  $apiZip"
if ($dbCopy) {
    Write-Host "  Kopia bazy:  $dbCopy"
}
Write-Host "  GUI:         https://$HostGui"
Write-Host "  API:         https://$HostApi  (TREEGRID_API_URL w web.config GUI)"
Write-Host '============================================================'
Write-Host ''
Write-Host 'Kolejnosc wgrania (skrypt niczego nie wysyla):'
Write-Host ''
Write-Host "  1. Witryna API ($HostApi), panel: Scripting -> Bitness = 64-bit."
Write-Host '     Przed pierwszym wgraniem - paczka win-x64 nie wstanie w puli 32-bit.'
Write-Host ''
Write-Host '  2. Zmienne srodowiskowe (panel: Scripting -> Environment variables).'
Write-Host '     Wartosci wpisz samodzielnie w panelu - nigdy w repo ani w rozmowie z agentem.'
Write-Host "     Witryna API ($HostApi):"
Write-Host '       Auth__InternalApiSecret'
Write-Host '       Auth__SessionSigningKey'
Write-Host '       Mail__Smtp__UserName'
Write-Host '       Mail__Smtp__Password'
Write-Host '       Mail__From'
Write-Host "     Witryna GUI ($HostGui):"
Write-Host '       Auth__InternalApiSecret   (ta sama wartosc co w witrynie API)'
Write-Host ''
if ($dbCopy) {
    Write-Host '  3. Baza: przy zatrzymanej witrynie API wgraj przez FTP albo menedzer plikow'
    Write-Host "     $dbCopy"
    Write-Host '     do katalogu tg-data (rodzic wwwroot witryny API, np. D:\Sites\siteNNN\tg-data).'
} else {
    Write-Host '  3. Baza do tg-data (rodzic wwwroot witryny API) - tylko przy pierwszym wgraniu.'
    Write-Host '     Ten przebieg nie zrobil kopii; uruchom ponownie z -KopiaBazy przy zatrzymanym API.'
}
Write-Host ''
Write-Host "  4. ZIP API do wwwroot witryny API przy ZATRZYMANEJ witrynie (albo z app_offline.htm):"
Write-Host "     $apiZip"
Write-Host '     InProcess trzyma Api.dll w w3wp, wiec rozpakowanie na zywa witryne moze sie nie udac.'
Write-Host '     Odmowy startu sa w tg-data\Log, kopie przed migracja (*.bak) w tg-data.'
Write-Host "     Sprawdzenie: https://$HostApi/health -> 200"
Write-Host ''
Write-Host "  5. ZIP GUI do wwwroot witryny GUI:"
Write-Host "     $guiZip"
Write-Host "     Sprawdzenie: https://$HostGui/api/health, a http://$HostGui/logowanie -> 301 na https."
Write-Host '     Logi Node (linie api_failure): wwwroot\logs\node-stdout* witryny GUI.'
Write-Host ''
Write-Host 'UWAGA: build\ w repo zawiera teraz build MonsterASP. Przed start-prod-tunnel.ps1 -SkipBuild'
Write-Host 'uruchom .\publikuj.ps1 -Cel Lokalny albo start-prod-tunnel.ps1 bez -SkipBuild.'
