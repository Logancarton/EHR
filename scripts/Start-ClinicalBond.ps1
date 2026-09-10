<#
.SYNOPSIS
  Starts Clinical Bond and opens it in the browser.

.DESCRIPTION
  Runs the production build rather than the development server, so this behaves the
  way the deployed application does. That means two things must be configured, and
  this script owns both:

    EHR_SESSION_SECRET  Generated once on first run and kept in %LOCALAPPDATA%,
                        never in the repository. A secret that changed per launch
                        would sign every clinician out on every restart.

    EHR_DATABASE_PATH   An absolute path to the clinical database. Production
                        refuses to derive this from the working directory, because
                        a record store located by accident moves — or is created
                        empty — when the service starts from somewhere else.

  Already running? This just opens the browser rather than starting a second copy.

.PARAMETER Rebuild
  Force a fresh production build even if one already exists.

.PARAMETER Port
  Port to serve on. Default 3000.

.EXAMPLE
  .\Start-ClinicalBond.ps1
  .\Start-ClinicalBond.ps1 -Rebuild
#>
param(
  [switch]$Rebuild,
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$AppName = "Clinical Bond"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ConfigDir = Join-Path $env:LOCALAPPDATA "ClinicalBond"
$ConfigFile = Join-Path $ConfigDir "config.json"
$BaseUrl = "http://localhost:$Port"

function Write-Step($message) { Write-Host "  $message" -ForegroundColor Cyan }
function Write-Ok($message)   { Write-Host "  $message" -ForegroundColor Green }
function Write-Warn($message) { Write-Host "  $message" -ForegroundColor Yellow }

Write-Host ""
Write-Host " $AppName" -ForegroundColor White
Write-Host " $('-' * 40)" -ForegroundColor DarkGray

# --- Is it already up? ------------------------------------------------------
function Test-ServerUp {
  try {
    $response = Invoke-WebRequest -Uri $BaseUrl -TimeoutSec 3 -UseBasicParsing
    return $response.StatusCode -ge 200
  } catch {
    return $false
  }
}

if (Test-ServerUp) {
  Write-Ok "Already running - opening $BaseUrl"
  Start-Process $BaseUrl
  Start-Sleep -Milliseconds 800
  exit 0
}

# --- Configuration ----------------------------------------------------------
if (-not (Test-Path $ConfigDir)) {
  New-Item -ItemType Directory -Force $ConfigDir | Out-Null
}

if (Test-Path $ConfigFile) {
  $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
} else {
  # A 48-byte random secret, base64url-encoded. Kept outside the repository so it
  # is never committed, and reused across launches so sessions survive a restart.
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')

  $config = [PSCustomObject]@{
    sessionSecret = $secret
    databasePath  = (Join-Path $RepoRoot "data\ehr.db")
    createdAt     = (Get-Date).ToString("o")
  }
  $config | ConvertTo-Json | Out-File -FilePath $ConfigFile -Encoding utf8
  Write-Ok "Created configuration at $ConfigFile"
  Write-Warn "That file holds this installation's session secret. Do not commit or share it."
}

$env:EHR_SESSION_SECRET = $config.sessionSecret
$env:EHR_DATABASE_PATH = $config.databasePath
$env:PORT = "$Port"

$dbDir = Split-Path -Parent $config.databasePath
if (-not (Test-Path $dbDir)) { New-Item -ItemType Directory -Force $dbDir | Out-Null }
Write-Step "Database: $($config.databasePath)"

# --- Build ------------------------------------------------------------------
Set-Location $RepoRoot
$buildId = Join-Path $RepoRoot ".next\BUILD_ID"

if ($Rebuild -or -not (Test-Path $buildId)) {
  Write-Step "Building (first launch or -Rebuild; this takes a minute)..."
  # next build writes warnings to stderr. Under ErrorActionPreference=Stop,
  # PowerShell 5.1 treats native stderr as terminating, so a harmless warning
  # would abort a build that is actually succeeding. Judge it by its exit code.
  $previousBuildPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  npm run build
  $buildExit = $LASTEXITCODE
  $ErrorActionPreference = $previousBuildPreference
  if ($buildExit -ne 0) {
    Write-Host ""
    Write-Host "  Build failed. $AppName was not started." -ForegroundColor Red
    Read-Host "  Press Enter to close"
    exit 1
  }
  Write-Ok "Build complete"
}

# --- Serve ------------------------------------------------------------------
Write-Step "Starting server on port $Port..."

# The server runs in its own window so this launcher can exit once the browser is
# open. Closing that window is how you stop Clinical Bond.
$serverCommand = @"
`$host.UI.RawUI.WindowTitle = '$AppName - Server (close this window to stop)'
Set-Location '$RepoRoot'
`$env:EHR_SESSION_SECRET = '$($config.sessionSecret)'
`$env:EHR_DATABASE_PATH = '$($config.databasePath)'
`$env:PORT = '$Port'
npm start
"@

Start-Process powershell.exe `
  -ArgumentList "-NoProfile", "-NoExit", "-Command", $serverCommand `
  -WindowStyle Minimized

# --- Wait for readiness, then open -------------------------------------------
$deadline = (Get-Date).AddSeconds(90)
$ready = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 700
  if (Test-ServerUp) { $ready = $true; break }
}

if (-not $ready) {
  Write-Host ""
  Write-Host "  Server did not become ready within 90 seconds." -ForegroundColor Red
  Write-Warn "Check the '$AppName - Server' window (minimized) for the reason."
  Read-Host "  Press Enter to close"
  exit 1
}

# --- First-run account -------------------------------------------------------
# A production build has no development sign-in, and a provisioned user has no
# password until they set one. On a brand-new installation that means nobody can
# get in at all, so the first launch mints an activation link. Once any account
# has a credential this reports "skipped" and does nothing.
$bootstrap = ""
$env:CLINICAL_BOND_URL = $BaseUrl
# node prints an ExperimentalWarning for node:sqlite on stderr. Under
# ErrorActionPreference=Stop, PowerShell 5.1 wraps native stderr in error records
# and treats them as terminating, so a harmless warning would look like a failure.
$env:NODE_NO_WARNINGS = "1"
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $bootstrapScript = Join-Path $PSScriptRoot "bootstrap-account.ts"
  # Invoke tsx's CLI through node directly. `npx tsx` resolves unreliably from
  # PowerShell ("could not determine executable to run") even with tsx installed.
  $tsxCli = Join-Path $RepoRoot (Join-Path "node_modules" (Join-Path "tsx" (Join-Path "dist" "cli.mjs")))
  if (Test-Path $tsxCli) {
    $bootstrap = (& node $tsxCli $bootstrapScript | Out-String)
  } else {
    Write-Warn "tsx not installed; skipping the first-run account check."
  }
} catch {
  Write-Warn "Could not check first-run account state: $($_.Exception.Message)"
} finally {
  $ErrorActionPreference = $previousPreference
}

$activationUrl = $null
if ($bootstrap -match 'BOOTSTRAP_URL\s+(\S+)') { $activationUrl = $matches[1] }

if ($activationUrl) {
  $who = if ($bootstrap -match 'BOOTSTRAP_USER\s+(.+)') { $matches[1].Trim() } else { "this account" }
  Write-Host ""
  Write-Host "  First launch: no account has a password yet." -ForegroundColor Yellow
  Write-Host "  Opening the activation page for $who." -ForegroundColor Yellow
  Write-Host "  Choose your own username and password there - nobody else sees them." -ForegroundColor Yellow
  Write-Host ""
  Write-Ok "Ready - opening activation page"
  Start-Process $activationUrl
  Start-Sleep -Milliseconds 1500
  exit 0
}

Write-Ok "Ready - opening $BaseUrl"
Start-Process $BaseUrl
Start-Sleep -Milliseconds 1200
exit 0
