-- PsiPilot Assistant - Complaints Table
-- Migration: 057_complaints_table
-- Description: Таблица для хранения жалоб и обращений через Telegram бота

-- Категории обращений
CREATE TYPE complaint_category AS ENUM (
    'bug',           -- Техническая ошибка
    'feature',       -- Предложение функции
    'complaint',     -- Жалоба на сервис
    'question',      -- Вопрос
    'other'          -- Другое
);

-- Статусы обращений
CREATE TYPE complaint_status AS ENUM (
    'new',           -- Новое
    'in_progress',   -- В обработке
    'resolved',      -- Решено
    'closed'         -- Закрыто
);

-- Таблица обращений
CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Данные отправителя (из Telegram)
    telegram_user_id BIGINT NOT NULL,
    telegram_username VARCHAR(255),
    telegram_first_name VARCHAR(255),
    telegram_last_name VARCHAR(255),

    -- Контактные данные (введенные пользователем)
    contact_info VARCHAR(255),

    -- Содержание обращения
    category complaint_category NOT NULL DEFAULT 'other',
    subject VARCHAR(500),
    message TEXT NOT NULL,

    -- Вложения (массив URL файлов в Telegram)
    attachments JSONB DEFAULT '[]'::jsonb,

    -- Статус обработки
    status complaint_status NOT NULL DEFAULT 'new',

    -- Обработка
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,

    -- Метаданные
    telegram_message_id BIGINT,
    notification_sent BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_complaints_telegram_user_id ON complaints(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_resolved_by ON complaints(resolved_by);

-- Комментарии
COMMENT ON TABLE complaints IS 'Жалобы и обращения от пользователей через Telegram бота';
COMMENT ON COLUMN complaints.telegram_user_id IS 'ID пользователя в Telegram';
COMMENT ON COLUMN complaints.attachments IS 'JSON массив вложений: [{"file_id": "...", "file_type": "photo|document|video", "file_name": "..."}]';
COMMENT ON COLUMN complaints.contact_info IS 'Контактные данные для обратной связи (email, телефон)';

-- Row Level Security
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- Политики RLS
-- Обращения может просматривать любой авторизованный пользователь с ролью admin
DROP POLICY IF EXISTS "Admins can view all complaints" ON complaints;
CREATE POLICY "Admins can view all complaints"
    ON complaints
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Только service role может создавать обращения (бот использует service role)
DROP POLICY IF EXISTS "Service role can insert complaints" ON complaints;
CREATE POLICY "Service role can insert complaints"
    ON complaints
    FOR INSERT
    WITH CHECK (true);

-- Админы могут обновлять обращения
DROP POLICY IF EXISTS "Admins can update complaints" ON complaints;
CREATE POLICY "Admins can update complaints"
    ON complaints
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_complaints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS complaints_updated_at ON complaints;
CREATE TRIGGER complaints_updated_at
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION update_complaints_updated_at();

-- Функция для установки resolved_at при изменении статуса на resolved
CREATE OR REPLACE FUNCTION set_complaint_resolved_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        NEW.resolved_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS complaints_set_resolved_at ON complaints;
CREATE TRIGGER complaints_set_resolved_at
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION set_complaint_resolved_at();
