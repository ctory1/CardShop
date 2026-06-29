param(
    [string]$ResourceGroup = "cardshop-api",
    [string]$WebAppName = "cardshop-api-cahrb7bmgubegjhb",
    [string]$ApiUrl = "https://cardshop-api-cahrb7bmgubegjhb.centralus-01.azurewebsites.net"
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

    Write-Host "Creating deployment zip..." -ForegroundColor Cyan
    if (Test-Path $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $zipPath -Force

    Write-Host "Deploying to Azure Web App '$WebAppName'..." -ForegroundColor Cyan
    az webapp deploy --resource-group $ResourceGroup --name $WebAppName --src-path $zipPath --type zip
}
finally {
    Pop-Location
}

Write-Host "Checking live stock endpoint..." -ForegroundColor Cyan
$stock = Invoke-RestMethod "$ApiUrl/api/stock"
$stock | Select-Object -First 10 apiId, name, set, market, shopPrice, condition, quantity | Format-Table -AutoSize

Write-Host "Done. If you still see only the six test cards, check the Web App's ConnectionStrings:CardShop setting." -ForegroundColor Green
