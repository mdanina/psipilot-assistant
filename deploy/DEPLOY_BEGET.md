# Деплой PsiPilot Assistant на Beget VPS

## Требования

- VPS с Ubuntu/Debian
- Docker и Docker Compose
- Минимум 2 GB RAM
- Self-hosted Supabase (уже настроен)

## Шаг 1: Подключение к серверу

```bash
ssh root@5.181.108.89
```

## Шаг 2: Установка Docker (если не установлен)

```bash
# Установка Docker
curl -fsSL https://get.docker.com | sh

# Добавление пользователя в группу docker (опционально)
usermod -aG docker $USER

# Проверка
docker --version
docker compose version
```

## Шаг 3: Клонирование репозитория

```bash
# Создание директории для приложения
mkdir -p /opt/psipilot
cd /opt/psipilot

# Клонирование (замените на ваш репозиторий)
git clone https://github.com/YOUR_USERNAME/psipilot-assistant.git .
# или скопируйте файлы через SCP
```

## Шаг 4: Настройка переменных окружения

```bash
# Копирование примера конфигурации
cp deploy/.env.production.example .env

# Редактирование
nano .env
```

### Заполните следующие переменные:

```env
# Frontend
VITE_SUPABASE_URL=https://lulebraggalast.beget.app
VITE_SUPABASE_ANON_KEY=ваш-anon-key
VITE_API_URL=/api

# Backend
SUPABASE_URL=https://lulebraggalast.beget.app
SUPABASE_SERVICE_ROLE_KEY=ваш-service-role-key
SUPABASE_ANON_KEY=ваш-anon-key
ASSEMBLYAI_API_KEY=ваш-assemblyai-key
OPENAI_API_KEY=ваш-openai-key
```

### Где найти ключи Supabase:

1. Откройте Supabase Dashboard
2. Settings > API
3. Скопируйте:
   - `anon public` → VITE_SUPABASE_ANON_KEY и SUPABASE_ANON_KEY
   - `service_role` → SUPABASE_SERVICE_ROLE_KEY

## Шаг 5: Запуск (HTTP - для тестирования)

```bash
# Сделать скрипт исполняемым
chmod +x deploy/deploy.sh

# Запуск
./deploy/deploy.sh

# Или напрямую через docker compose
docker compose up -d --build
```

Приложение будет доступно по адресу: `http://5.181.108.89`

## Шаг 6: Настройка домена и SSL (Production)

### 6.1 Настройка DNS

В панели управления доменом добавьте A-запись:
```
Тип: A
Имя: @ (или поддомен, например psipilot)
Значение: 5.181.108.89
```

### 6.2 Обновление Caddyfile

```bash
nano deploy/Caddyfile
```

Замените `YOUR_DOMAIN` на ваш домен:
```
psipilot.yourdomain.ru {
    reverse_proxy frontend:80
    ...
}
```

### 6.3 Запуск с SSL

```bash
# Остановка текущих контейнеров
docker compose down

# Запуск production версии с Caddy (автоматический SSL)
./deploy/deploy.sh --prod

# Или напрямую
docker compose -f docker-compose.prod.yml up -d --build
```

## Полезные команды

```bash
# Просмотр логов
docker compose logs -f

# Логи конкретного сервиса
docker compose logs -f backend
docker compose logs -f frontend

# Перезапуск
docker compose restart

# Остановка
docker compose down

# Полная пересборка
docker compose up -d --build --force-recreate

# Проверка статуса
docker compose ps
```

## Обновление приложения

```bash
cd /opt/psipilot

# Получение обновлений
git pull

# Пересборка и перезапуск
docker compose up -d --build
```

## Troubleshooting

### Проблема: Контейнер не запускается

```bash
# Проверьте логи
docker compose logs backend
docker compose logs frontend

# Проверьте .env файл
cat .env
```

### Проблема: Ошибка подключения к Supabase

1. Проверьте, что Supabase доступен: `curl https://lulebraggalast.beget.app`
2. Проверьте правильность ключей в .env

### Проблема: 502 Bad Gateway

```bash
# Проверьте, что backend запущен
docker compose ps
docker compose logs backend
```

### Проблема: SSL не работает

1. Проверьте, что домен направлен на ваш IP
2. Порты 80 и 443 должны быть открыты
3. Проверьте логи Caddy: `docker compose -f docker-compose.prod.yml logs caddy`

## Структура файлов деплоя

```
psipilot-assistant/
├── Dockerfile                    # Frontend Dockerfile
├── docker-compose.yml            # Development (HTTP)
├── docker-compose.prod.yml       # Production (SSL)
├── backend/
│   └── transcription-service/
│       └── Dockerfile           # Backend Dockerfile
└── deploy/
    ├── nginx.conf               # Nginx config for frontend
    ├── Caddyfile                # Caddy config for SSL
    ├── .env.production.example  # Environment template
    ├── deploy.sh                # Deployment script
    └── DEPLOY_BEGET.md          # This file
```
