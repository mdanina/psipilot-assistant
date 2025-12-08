-- Fix user creation trigger to handle new columns from migration 005
-- Migration: 006_fix_user_creation_trigger
-- Description: Updates handle_new_user() function to include mfa_enabled and backup_codes columns

-- Обновляем функцию handle_new_user с поддержкой новых колонок
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (
        id, 
        email, 
        full_name,
        mfa_enabled,
        backup_codes
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE((NEW.raw_user_meta_data->>'mfa_enabled')::boolean, false),
        COALESCE(
            CASE 
                WHEN NEW.raw_user_meta_data->'backup_codes' IS NOT NULL 
                THEN ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'backup_codes'))
                ELSE ARRAY[]::TEXT[]
            END,
            ARRAY[]::TEXT[]
        )
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        updated_at = NOW();
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Логируем ошибку, но не блокируем создание пользователя в auth.users
    -- Это важно, чтобы пользователь мог быть создан даже если профиль не создался
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Убеждаемся, что триггер существует и включен
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Комментарий для документации
COMMENT ON FUNCTION handle_new_user() IS 
'Automatically creates a profile record when a new user is created in auth.users. 
Handles mfa_enabled and backup_codes columns from migration 005.';




