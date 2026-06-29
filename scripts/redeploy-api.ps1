param(
    [string]$ResourceGroup = "cardshop-api",
    [string]$WebAppName = "cardshop-api",
    [string]$ApiUrl = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "api"
$publishDir = Join-Path $apiDir "publish"
$zipPath = Join-Path $apiDir "publish.zip"

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI was not found. Install it, restart PowerShell, then run: az login"
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw ".NET SDK was not found. Install the .NET 8 SDK, restart PowerShell, then try again."
}

Write-Host "Publishing API..." -ForegroundColor Cyan
Push-Location $apiDir
try {
    if (Test-Path $publishDir) {
        Remove-Item -LiteralPath $publishDir -Recurse -Force
    }
    dotnet publish -c Release -o $publishDir
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed with exit code $LASTEXITCODE."
    }

    Write-Host "Creating deployment zip..." -ForegroundColor Cyan
    if (Test-Path $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $zipPath -Force

    Write-Host "Deploying to Azure Web App '$WebAppName'..." -ForegroundColor Cyan
    az webapp deploy --resource-group $ResourceGroup --name $WebAppName --src-path $zipPath --type zip
    if ($LASTEXITCODE -ne 0) {
        throw "Azure deploy failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
    $hostName = az webapp show --resource-group $ResourceGroup --name $WebAppName --query "defaultHostName" -o tsv
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($hostName)) {
        throw "Could not resolve the Web App hostname after deployment."
    }
    $ApiUrl = "https://$hostName"
}

Write-Host "Checking live stock endpoint at $ApiUrl..." -ForegroundColor Cyan
$stock = Invoke-RestMethod "$ApiUrl/api/stock"
$stock | Select-Object -First 10 apiId, name, set, market, shopPrice, condition, quantity | Format-Table -AutoSize

Write-Host "Done. If you still see only the six test cards, check the Web App's ConnectionStrings:CardShop setting." -ForegroundColor Green
