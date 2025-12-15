# Скрипт для создания профилей через SSH/psql (PowerShell версия)
# 
# Использование:
#   .\create-profiles-via-ssh.ps1
#
# Требует переменных окружения или параметров:
#   $env:DB_HOST - хост базы данных
#   $env:DB_USER - пользователь БД
#   $env:DB_NAME - имя базы данных
#   $env:DB_PASSWORD - пароль БД
#   $env:DATABASE_URL - альтернативно, полная строка подключения

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$Host = $env:DB_HOST,
    [string]$Port = $env:DB_PORT,
    [string]$Database = $env:DB_NAME,
    [string]$User = $env:DB_USER,
    [string]$Password = $env:DB_PASSWORD
)

Write-Host "🔍 Проверка подключения к базе данных..." -ForegroundColor Cyan

# Проверка переменных окружения или DATABASE_URL
if ([string]::IsNullOrEmpty($DatabaseUrl)) {
    if ([string]::IsNullOrEmpty($Host) -or [string]::IsNullOrEmpty($User) -or [string]::IsNullOrEmpty($Database)) {
        Write-Host "❌ Ошибка: Установите переменные окружения:" -ForegroundColor Red
        Write-Host "   `$env:DB_HOST='your-host'"
        Write-Host "   `$env:DB_USER='postgres'"
        Write-Host "   `$env:DB_NAME='postgres'"
        Write-Host "   `$env:DB_PASSWORD='your-password'"
        Write-Host ""
        Write-Host "   ИЛИ используйте DATABASE_URL:"
        Write-Host "   `$env:DATABASE_URL='postgresql://user:password@host:port/database'"
        exit 1
    }
    
    if ([string]::IsNullOrEmpty($Port)) {
        $Port = "5432"
    }
    
    if ([string]::IsNullOrEmpty($Password)) {
        Write-Host "⚠️  Пароль не указан. Будет запрошен интерактивно или через .pgpass" -ForegroundColor Yellow
    } else {
        $env:PGPASSWORD = $Password
    }
    
    $ConnectionString = "host=$Host port=$Port dbname=$Database user=$User"
} else {
    $ConnectionString = $DatabaseUrl
}

Write-Host "📊 Проверка количества пользователей без профилей..." -ForegroundColor Cyan

# Проверка количества пользователей без профилей
$UsersWithoutProfiles = psql $ConnectionString -t -c @"
SELECT COUNT(*) 
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL;
"@ | ForEach-Object { $_.Trim() }

Write-Host "   Найдено пользователей без профилей: $UsersWithoutProfiles" -ForegroundColor Yellow

if ([int]$UsersWithoutProfiles -eq 0) {
    Write-Host "✅ Все пользователи уже имеют профили!" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "🚀 Создание профилей для $UsersWithoutProfiles пользователей..." -ForegroundColor Cyan

# SQL команда для создания профилей
$CreateProfilesSql = @"
-- Создаем профили для всех пользователей, у которых их нет
INSERT INTO profiles (
    id,
    email,
    full_name,
    role,
    specialization,
    mfa_enabled,
    backup_codes,
    settings,
    created_at,
    updated_at
)
SELECT 
    au.id,
    au.email,
    COALESCE(
        au.raw_user_meta_data->>'full_name',
        SPLIT_PART(au.email, '@', 1),
        au.email
    ) as full_name,
    COALESCE(
        (au.raw_user_meta_data->>'role')::VARCHAR(50),
        'specialist'
    ) as role,
    NULLIF(au.raw_user_meta_data->>'specialization', '')::VARCHAR(100) as specialization,
    COALESCE(
        (au.raw_user_meta_data->>'mfa_enabled')::BOOLEAN,
        false
    ) as mfa_enabled,
    ARRAY[]::TEXT[] as backup_codes,
    COALESCE(
        au.raw_user_meta_data->'settings',
        '{}'::JSONB
    ) as settings,
    au.created_at,
    NOW() as updated_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
"@

# Выполнение SQL через psql
$CreateProfilesSql | psql $ConnectionString

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Профили успешно созданы!" -ForegroundColor Green
} else {
    Write-Host "❌ Ошибка при создании профилей" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📋 Результаты:" -ForegroundColor Cyan

$ResultsSql = @"
SELECT 
    au.email,
    p.full_name,
    p.role,
    CASE 
        WHEN p.id IS NULL THEN '❌ Profile still missing'
        ELSE '✅ Profile created'
    END as status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
ORDER BY au.created_at DESC
LIMIT 20;
"@

$ResultsSql | psql $ConnectionString

Write-Host ""
Write-Host "✨ Готово!" -ForegroundColor Green
