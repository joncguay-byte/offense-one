param(
  [string]$EnvPath = "apps/api/.env"
)

$resolvedEnvPath = Resolve-Path -Path $EnvPath -ErrorAction SilentlyContinue
if (-not $resolvedEnvPath) {
  throw "Could not find $EnvPath. Run this script from the repository root."
}

$secureKey = Read-Host "Paste your OpenAI API key" -AsSecureString
$plainKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
)

if (-not $plainKey -or -not $plainKey.Trim()) {
  throw "No API key was entered."
}

$lines = Get-Content -Path $resolvedEnvPath
$nextLines = $lines | ForEach-Object {
  if ($_ -match "^OPENAI_API_KEY=") {
    "OPENAI_API_KEY=$($plainKey.Trim())"
  } else {
    $_
  }
}

if (-not ($nextLines | Select-String -Pattern "^OPENAI_API_KEY=" -Quiet)) {
  $nextLines += "OPENAI_API_KEY=$($plainKey.Trim())"
}

Set-Content -Path $resolvedEnvPath -Value $nextLines
Write-Host "OPENAI_API_KEY saved to $resolvedEnvPath. Restart the API server for the change to take effect."
