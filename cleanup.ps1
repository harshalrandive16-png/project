# BhoomiSuraksha Step 0 cleanup (Windows PowerShell)
# Project folder (E:\SIH prototype\project) ke andar chalao:  powershell -ExecutionPolicy Bypass -File cleanup.ps1
# Kuch delete nahi hota — extra files _archive\ folder mein move hoti hain.

$ErrorActionPreference = 'SilentlyContinue'
$archive = Join-Path $PSScriptRoot '_archive'
New-Item -ItemType Directory -Force -Path $archive | Out-Null

$extras = @(
  'index.c', 'app.listen', 'live_feed.py', 'node_module.gitignore',
  'firebase-debug.log', 'demo-sms.html'
)
foreach ($f in $extras) {
  $p = Join-Path $PSScriptRoot $f
  if (Test-Path $p) { Move-Item $p $archive -Force; Write-Host "moved -> _archive\$f" }
}
Get-ChildItem $PSScriptRoot -Filter 'WhatsApp Image*.jp*g' | ForEach-Object {
  Move-Item $_.FullName $archive -Force; Write-Host "moved -> _archive\$($_.Name)"
}

# .env mein duplicate PORT / JWT_SECRET (dono ki value same thi — pehli rakhi jati hai)
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path $envPath) {
  $seen = @{}
  $out = foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=') {
      $k = $Matches[1]
      if ($seen.ContainsKey($k)) { Write-Host "removed duplicate $k from .env"; continue }
      $seen[$k] = $true
    }
    $line
  }
  Set-Content -Path $envPath -Value $out -Encoding UTF8
}

# SENSOR_API_KEY auto-generate (agar .env mein nahi hai)
if ((Test-Path $envPath) -and -not (Select-String -Path $envPath -Pattern '^SENSOR_API_KEY=.+' -Quiet)) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $key = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
  Add-Content -Path $envPath -Value "`nSENSOR_API_KEY=$key"
  Write-Host 'SENSOR_API_KEY generate hui aur .env mein add ho gayi'
}
Write-Host "`nDone. Ab ALERT_NUMBERS .env mein apne 10-digit numbers (comma separated) se bharo."
