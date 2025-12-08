# Script to generate encryption key and add to .env.local
# Encoding: UTF-8 with BOM

Write-Host "Generating encryption key..." -ForegroundColor Cyan

# Generate random key (32 bytes, Base64 encoded)
$key = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

Write-Host ""
Write-Host "=== GENERATED KEY ===" -ForegroundColor Green
Write-Host $key -ForegroundColor Yellow
Write-Host "====================" -ForegroundColor Green
Write-Host ""

# Check if .env.local exists
if (Test-Path .env.local) {
    Write-Host "File .env.local found. Updating key..." -ForegroundColor Cyan
    
    $lines = Get-Content .env.local -Encoding UTF8
    $updated = $false
    $newLines = $lines | ForEach-Object {
        if ($_ -match '^\s*VITE_ENCRYPTION_KEY\s*=') {
            $updated = $true
            "VITE_ENCRYPTION_KEY=$key"
        } else {
            $_
        }
    }
    
    if (-not $updated) {
        $newLines += ""
        $newLines += "# Encryption Key for PHI Data (Field-level encryption)"
        $newLines += "# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        $newLines += "VITE_ENCRYPTION_KEY=$key"
    }
    
    $newLines | Set-Content .env.local -Encoding UTF8
    Write-Host "[OK] Key successfully added/updated in .env.local" -ForegroundColor Green
} else {
    Write-Host "File .env.local not found. Creating from example..." -ForegroundColor Yellow
    
    if (Test-Path env.example.txt) {
        Copy-Item env.example.txt .env.local
        $content = Get-Content .env.local -Raw -Encoding UTF8
        $content = $content -replace 'VITE_ENCRYPTION_KEY=.*', "VITE_ENCRYPTION_KEY=$key"
        Set-Content .env.local -Value $content -NoNewline -Encoding UTF8
        Write-Host "[OK] Created .env.local with key" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] File env.example.txt not found!" -ForegroundColor Red
        Write-Host "Creating .env.local manually..." -ForegroundColor Yellow
        @"
# PsiPilot Assistant - Environment Variables
# Encryption Key for PHI Data (Field-level encryption)
VITE_ENCRYPTION_KEY=$key
"@ | Set-Content .env.local -Encoding UTF8
        Write-Host "[OK] Created .env.local with key" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Red
Write-Host "- Never commit .env.local to git!" -ForegroundColor Yellow
Write-Host "- Keep the key secure!" -ForegroundColor Yellow
Write-Host "- Restart dev server to apply changes!" -ForegroundColor Yellow
Write-Host ""
