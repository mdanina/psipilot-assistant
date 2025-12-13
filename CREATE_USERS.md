# Быстрое создание пользователей

## Быстрый старт

1. **Добавьте Service Role Key в `.env.local`:**
   ```env
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```
   
   Где найти: Supabase Dashboard → Settings → API → service_role

2. **Создайте пользователя:**
   ```bash
   npm run create:user user@example.com password123
   ```

## Примеры

```bash
# Базовое создание
npm run create:user user@example.com password123

# С именем и ролью
npm run create:user user@example.com password123 --name "Иван Иванов" --role admin

# С привязкой к клинике
npm run create:user user@example.com password123 \
  --name "Иван Иванов" \
  --role specialist \
  --clinic-id "uuid-клиники"
```

## Роли

- `admin` - Администратор (полный доступ)
- `specialist` - Специалист (работа с пациентами)
- `assistant` - Ассистент (ограниченный доступ)

## Полная документация

📖 [docs/USER_CREATION.md](./docs/USER_CREATION.md) - Подробное руководство




