[CmdletBinding()]
param(
    [ValidateSet('Install', 'Uninstall', 'Start', 'Stop', 'Restart', 'Status', 'Prepare')]
    [string]$Action = 'Status',
    [ValidateRange(1, 65535)][int]$Port = 3001,
    [string]$DataDirectory,
    [switch]$AllowPrivateNetwork
)

$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serviceDirectory = Join-Path $appRoot '.service'
$wrapper = Join-Path $serviceDirectory 'HomeCooked.exe'
$configuration = Join-Path $serviceDirectory 'HomeCooked.xml'
$serviceName = 'HomeCooked'
$firewallName = 'HomeCooked-HTTP'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Open PowerShell as Administrator to manage the Windows service.'
    }
}

function Assert-LocalPath([string]$Location) {
    $driveRoot = [IO.Path]::GetPathRoot($Location)
    if ($Location.StartsWith('\\') -or (New-Object IO.DriveInfo($driveRoot)).DriveType -ne 'Fixed') {
        throw "Services need a fixed local disk path. Move the app and data to a folder such as C:\Apps\HomeCooked. Unsupported path: $Location"
    }
}

function Invoke-Wrapper([string]$Command) {
    if (-not (Test-Path -LiteralPath $wrapper)) { throw 'Service wrapper not found. Run the Install action first.' }
    & $wrapper $Command
    if ($LASTEXITCODE -ne 0) { throw "WinSW $Command failed with exit code $LASTEXITCODE. See .service\logs." }
}

function Grant-ServiceAccess([string]$Location, [string]$Rights) {
    & icacls.exe $Location /grant "*S-1-5-19:(OI)(CI)($Rights)" /T /Q
    if ($LASTEXITCODE -ne 0) { throw "Could not grant LocalService access to $Location" }
}

if ($Action -eq 'Status') {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service) { $service | Select-Object Name, Status, StartType }
    else { Write-Output 'HomeCooked is not installed as a Windows service.' }
    return
}

if ($Action -ne 'Prepare') { Assert-Administrator }

if ($Action -in @('Install', 'Prepare')) {
    if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
        throw 'HomeCooked is already installed. Use Restart for app updates; uninstall first to change service configuration.'
    }
    foreach ($required in @('dist\index.html', 'server\index.js', 'node_modules\express\package.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $appRoot $required))) { throw "Missing $required. Run npm install and npm run build first." }
    }
    $nodeSource = (Get-Command node.exe -ErrorAction Stop).Source
    $runtimeDirectory = Join-Path $serviceDirectory 'runtime'
    $nodeExecutable = Join-Path $runtimeDirectory 'node.exe'
    if (-not $DataDirectory) { $DataDirectory = Join-Path $appRoot 'data' }
    if (-not [IO.Path]::IsPathRooted($DataDirectory)) { $DataDirectory = Join-Path $appRoot $DataDirectory }
    $DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
    if ($Action -eq 'Install') {
        Assert-LocalPath $appRoot
        Assert-LocalPath $DataDirectory
        Assert-LocalPath $nodeSource
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
            throw "Port $Port is in use. Stop the existing app or choose -Port before installing."
        }
    }
    $logDirectory = Join-Path $serviceDirectory 'logs'
    New-Item -ItemType Directory -Path $serviceDirectory -Force | Out-Null
    function Escape-Xml([string]$Value) { [Security.SecurityElement]::Escape($Value) }
    $xml = @"
<service>
  <id>HomeCooked</id>
  <name>HomeCooked</name>
  <description>HomeCooked household kitchen and meal planner</description>
  <executable>$(Escape-Xml $nodeExecutable)</executable>
  <arguments>&quot;$(Escape-Xml (Join-Path $appRoot 'server\index.js'))&quot;</arguments>
  <workingdirectory>$(Escape-Xml $appRoot)</workingdirectory>
  <env name="NODE_ENV" value="production"/>
  <env name="PORT" value="$Port"/>
  <env name="DATA_DIR" value="$(Escape-Xml $DataDirectory)"/>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>
  <onfailure action="restart" delay="10 sec"/>
  <stoptimeout>20 sec</stoptimeout>
  <logpath>$(Escape-Xml $logDirectory)</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
</service>
"@
    [xml]$validated = $xml
    [IO.File]::WriteAllText($configuration, $validated.OuterXml, (New-Object Text.UTF8Encoding($false)))
    if ($Action -eq 'Prepare') { Write-Output "Configuration prepared: $configuration (no service installed)."; return }

    # Pin the service wrapper to a published stable release from its official repository.
    $architecture = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
    $download = Join-Path $serviceDirectory 'WinSW.download'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-$architecture.exe" -OutFile $download
        Move-Item -LiteralPath $download -Destination $wrapper -Force
    } finally { if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download } }
    New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    # NVM installations may resolve into a private user profile. Give the service
    # a standalone runtime with the app's inherited LocalService permissions.
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    Copy-Item -LiteralPath $nodeSource -Destination $nodeExecutable -Force
    Grant-ServiceAccess $appRoot 'RX'
    Grant-ServiceAccess $DataDirectory 'M'
    Grant-ServiceAccess $logDirectory 'M'
    Invoke-Wrapper 'install'
    if ($AllowPrivateNetwork) {
        if (-not (Get-NetFirewallRule -Name $firewallName -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -Name $firewallName -DisplayName 'HomeCooked (private network)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null
        }
    }
    Invoke-Wrapper 'start'
    $healthy = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/profiles" -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $healthy = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $healthy) { throw "Service installed, but the app did not become ready. Inspect $logDirectory and run the Status action." }
    Write-Output "HomeCooked installed and running at http://localhost:$Port. Logs: $logDirectory"
    return
}

if ($Action -eq 'Uninstall') {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service) {
        if ($service.Status -ne 'Stopped') { Invoke-Wrapper 'stop' }
        Invoke-Wrapper 'uninstall'
    }
    Get-NetFirewallRule -Name $firewallName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Output 'HomeCooked service removed. Application, data, logs, and service account file permissions are preserved.'
    return
}

Invoke-Wrapper $Action.ToLowerInvariant()
