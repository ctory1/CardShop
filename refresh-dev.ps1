<#
CardShop
Copyright © 2026 Colin Toryfter
All Rights Reserved.

Unauthorized copying or distribution of this file is prohibited.
#>

[CmdletBinding()]
param(
    [int]$ApiPort = 5000,
    [int]$WebPort = 8000,
    [switch]$SkipClean,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$ApiDir = Join-Path $Root "api"
$DocsDir = Join-Path $Root "docs"
$ScriptsDir = Join-Path $Root "scripts"
$DevDir = Join-Path $Root ".dev"

function Stop-CardShopDevProcesses {
    param([string]$ProjectRoot)

    $processes = Get-CimInstance Win32_Process |
        Where-Object {
            $isInProject = $_.CommandLine -and $_.CommandLine -like "*$ProjectRoot*"
            $_.CommandLine -and (
                ($_.Name -eq "CardShop.Api.exe" -and $isInProject) -or
                ($_.Name -eq "dotnet.exe" -and ($_.CommandLine -like "*CardShop.Api*" -or $isInProject)) -or
                (($_.Name -eq "python.exe" -or $_.Name -eq "py.exe") -and $isInProject -and ($_.CommandLine -like "*dev-static-server.py*" -or $_.CommandLine -like "*http.server*"))
            )
        }

    foreach ($process in $processes) {
        Write-Host "Stopping old dev process $($process.ProcessId): $($process.Name)"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$Seconds = 20
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)

    return $false
}

if (-not (Test-Path -LiteralPath $ApiDir)) {
    throw "API folder not found: $ApiDir"
}

if (-not (Test-Path -LiteralPath $DocsDir)) {
    throw "Docs folder not found: $DocsDir"
}

New-Item -ItemType Directory -Force -Path $DevDir | Out-Null

Write-Host "Refreshing CardShop dev environment..."
Stop-CardShopDevProcesses -ProjectRoot $Root

if (-not (Test-CommandExists "dotnet")) {
    throw "dotnet was not found. Install the .NET 8 SDK, then run this script again."
}

$sdks = dotnet --list-sdks
if (-not $sdks) {
    throw "dotnet is installed, but no SDK was found. Install the .NET 8 SDK, then run this script again."
}

dotnet build-server shutdown | Out-Null

if (-not $SkipClean) {
    foreach ($folderName in @("bin", "obj")) {
        $target = Join-Path $ApiDir $folderName
        $resolvedApi = [System.IO.Path]::GetFullPath($ApiDir)
        $resolvedTarget = [System.IO.Path]::GetFullPath($target)

        if ((Test-Path -LiteralPath $target) -and $resolvedTarget.StartsWith($resolvedApi, [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "Removing API build cache: $target"
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
}

Write-Host "Restoring API packages..."
dotnet restore (Join-Path $ApiDir "CardShop.Api.csproj")

$apiOut = Join-Path $DevDir "api.out.log"
$apiErr = Join-Path $DevDir "api.err.log"
$webOut = Join-Path $DevDir "web.out.log"
$webErr = Join-Path $DevDir "web.err.log"

Remove-Item -LiteralPath $apiOut, $apiErr, $webOut, $webErr -Force -ErrorAction SilentlyContinue

Write-Host "Starting API on http://localhost:$ApiPort ..."
$apiArgs = @(
    "run",
    "--project", (Join-Path $ApiDir "CardShop.Api.csproj"),
    "--urls", "http://localhost:$ApiPort"
)
$apiProcess = Start-Process -FilePath "dotnet" `
    -ArgumentList $apiArgs `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $apiOut `
    -RedirectStandardError $apiErr `
    -WindowStyle Hidden `
    -PassThru

if (Test-CommandExists "py") {
    $pythonExe = "py"
    $pythonArgs = @("-3", (Join-Path $ScriptsDir "dev-static-server.py"), "--directory", $DocsDir, "--port", "$WebPort")
}
elseif (Test-CommandExists "python") {
    $pythonExe = "python"
    $pythonArgs = @((Join-Path $ScriptsDir "dev-static-server.py"), "--directory", $DocsDir, "--port", "$WebPort")
}
else {
    throw "Python was not found. Install Python or run the docs folder through another no-cache web server."
}

Write-Host "Starting no-cache frontend server on http://localhost:$WebPort ..."
$webProcess = Start-Process -FilePath $pythonExe `
    -ArgumentList $pythonArgs `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $webOut `
    -RedirectStandardError $webErr `
    -WindowStyle Hidden `
    -PassThru

$healthUrl = "http://localhost:$ApiPort/api/health"
$webUrl = "http://localhost:$WebPort/scanner.html?refresh=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

if (Wait-ForUrl -Url $healthUrl -Seconds 25) {
    Write-Host "API is ready: $healthUrl"
}
else {
    Write-Warning "API did not answer yet. Check $apiOut and $apiErr"
}

if (Wait-ForUrl -Url "http://localhost:$WebPort/" -Seconds 10) {
    Write-Host "Frontend is ready: $webUrl"
}
else {
    Write-Warning "Frontend did not answer yet. Check $webOut and $webErr"
}

if (-not $NoBrowser) {
    Start-Process $webUrl
}

Write-Host ""
Write-Host "Running processes:"
Write-Host "  API PID:      $($apiProcess.Id)"
Write-Host "  Frontend PID: $($webProcess.Id)"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $apiOut"
Write-Host "  $apiErr"
Write-Host "  $webOut"
Write-Host "  $webErr"
Write-Host ""
Write-Host "Run this script again after code changes to restart the API and refresh browser caching."
