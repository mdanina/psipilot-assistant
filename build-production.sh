#!/bin/bash
# Скрипт для сборки production версии с проверкой переменных окружения

set -e  # Остановиться при ошибке

echo "🔍 Проверка переменных окружения..."

# Загрузите переменные из .env файла (если есть)
if [ -f .env ]; then
  echo "📄 Загрузка переменных из .env файла..."
  # Используем правильную загрузку переменных с обработкой пробелов
  export $(grep -v '^#' .env | grep '^VITE_' | sed 's/[[:space:]]*=[[:space:]]*/=/' | xargs)
  echo "✅ Переменные загружены из .env"
else
  echo "⚠️  Файл .env не найден"
fi

# Проверка обязательных переменных
REQUIRED_VARS=(
  "VITE_SUPABASE_URL"
  "VITE_SUPABASE_ANON_KEY"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
  echo "❌ ОШИБКА: Отсутствуют обязательные переменные:"
  printf '   - %s\n' "${MISSING_VARS[@]}"
  echo ""
  echo "Установите их явно перед запуском скрипта:"
  echo "  export VITE_SUPABASE_URL=..."
  echo "  export VITE_SUPABASE_ANON_KEY=..."
  exit 1
fi

# Показать значения переменных (частично, для безопасности)
echo ""
echo "📋 Проверка переменных окружения:"
echo "  VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:0:40}..."
echo "  VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY:0:30}..."
if [ ! -z "$VITE_N8N_SUPERVISOR_WEBHOOK_URL" ]; then
  echo "  VITE_N8N_SUPERVISOR_WEBHOOK_URL: ${VITE_N8N_SUPERVISOR_WEBHOOK_URL:0:50}..."
fi
if [ ! -z "$VITE_TRANSCRIPTION_API_URL" ]; then
  # Убрать ведущие и завершающие пробелы если есть
  VITE_TRANSCRIPTION_API_URL=$(echo "$VITE_TRANSCRIPTION_API_URL" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  # Экспортировать исправленное значение
  export VITE_TRANSCRIPTION_API_URL
  echo "  VITE_TRANSCRIPTION_API_URL: $VITE_TRANSCRIPTION_API_URL"
fi

# Проверка на пробелы в начале значений (частый баг)
echo ""
echo "🔍 Проверка формата переменных..."

check_var_format() {
  local var_name=$1
  local var_value="${!var_name}"
  local original_value="$var_value"
  
  # Убрать пробелы для проверки (но не изменять оригинальную переменную здесь)
  local trimmed_value=$(echo "$var_value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  
  if [[ "$var_value" != "$trimmed_value" ]]; then
    echo "⚠️  ВНИМАНИЕ: Переменная $var_name содержит пробелы в начале или конце!"
    echo "   Оригинальное значение: '$var_value'"
    echo "   Исправленное значение: '$trimmed_value'"
    echo "   💡 Скрипт автоматически исправит это при сборке, но лучше исправить в .env файле:"
    echo "      $var_name=$trimmed_value"
    # Автоматически исправить и экспортировать
    export "$var_name=$trimmed_value"
    return 1
  fi
  
  # Проверка на пустое значение (только пробелы)
  if [[ -z "$trimmed_value" ]]; then
    echo "⚠️  ВНИМАНИЕ: Переменная $var_name пуста или содержит только пробелы!"
    return 1
  fi
}

for var in "${REQUIRED_VARS[@]}"; do
  check_var_format "$var"
done

if [ ! -z "$VITE_N8N_SUPERVISOR_WEBHOOK_URL" ]; then
  check_var_format "VITE_N8N_SUPERVISOR_WEBHOOK_URL"
fi

if [ ! -z "$VITE_TRANSCRIPTION_API_URL" ]; then
  check_var_format "VITE_TRANSCRIPTION_API_URL"
fi

# Очистка старой сборки
echo ""
echo "🧹 Очистка старой сборки..."
rm -rf dist
rm -rf node_modules/.vite
echo "✅ Очистка завершена"

# Проверка зависимостей
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦 Установка зависимостей..."
  npm install
fi

# Сборка
echo ""
echo "🔨 Запуск сборки..."
npm run build

echo ""
echo "✅ Сборка завершена успешно!"
echo ""
echo "📝 Следующие шаги:"
echo "  1. Проверьте консоль браузера на наличие диагностики переменных"
echo "  2. Выполните Hard Refresh в браузере (Ctrl+Shift+R)"
echo "  3. Проверьте Network tab - файлы должны загружаться со статусом 200 OK"
