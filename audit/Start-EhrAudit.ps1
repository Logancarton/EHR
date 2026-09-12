<# Run from PowerShell in Codex Desktop's terminal or a normal Windows terminal. #>
[CmdletBinding()]
param(
  [ValidateSet('Init','Run','Status','Doctor','Test')][string]$Mode = 'Doctor',
  [ValidateSet('all','specialists','1','2','3','4','5','6','7','8','9')][string]$Agent = 'all',
  [string]$RunDir,
  [string]$OutputRoot,
  [ValidateRange(1,8)][int]$Jobs = 1,
  [string]$Model,
  [string]$CodexPath,
  [ValidateRange(1,1440)][int]$TimeoutMinutes = 60,
  [switch]$Offline,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Node.js 22 is required. Use the Node installation already used by the EHR.' }
if ($Mode -eq 'Test') {
  & $nodePath --test (Join-Path $PSScriptRoot 'run-audit.test.mjs')
  exit $LASTEXITCODE
}
$launchArgs = @((Join-Path $PSScriptRoot 'run-audit.mjs'), $Mode.ToLowerInvariant(),
  '--repo', (Split-Path -Parent $PSScriptRoot), '--agent', $Agent, '--jobs', "$Jobs",
  '--timeout-minutes', "$TimeoutMinutes")
if ($RunDir) { $launchArgs += @('--run-dir', $RunDir) }
if ($OutputRoot) { $launchArgs += @('--output-root', $OutputRoot) }
if ($Model) { $launchArgs += @('--model', $Model) }
if ($CodexPath) { $launchArgs += @('--codex-path', $CodexPath) }
if ($Offline) { $launchArgs += '--offline' }
if ($DryRun) { $launchArgs += '--dry-run' }
& $nodePath @launchArgs
exit $LASTEXITCODE

