-- PsiPilot Assistant - Supervisor Conversations
-- Migration: 030_supervisor_conversations
-- Description: Таблица для сохранения бесед с ИИ-супервизором

-- ============================================
-- SUPERVISOR CONVERSATIONS TABLE
-- ============================================
CREATE TABLE supervisor_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Привязка к пациенту и пользователю
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    
    -- Информация о беседе
    title VARCHAR(255) NOT NULL DEFAULT 'Беседа с супервизором',
    
    -- История диалога (JSON массив сообщений)
    -- Формат: [{"role": "user|assistant", "content": "...", "timestamp": "..."}]
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Метаданные
    message_count INTEGER DEFAULT 0, -- Количество сообщений в беседе
    started_at TIMESTAMPTZ DEFAULT NOW(), -- Время начала беседы
    saved_at TIMESTAMPTZ DEFAULT NOW(), -- Время сохранения
    
    -- Статус
    is_draft BOOLEAN DEFAULT false, -- Черновик или сохраненная беседа
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- Индексы
CREATE INDEX idx_supervisor_conversations_patient_id ON supervisor_conversations(patient_id);
CREATE INDEX idx_supervisor_conversations_user_id ON supervisor_conversations(user_id);
CREATE INDEX idx_supervisor_conversations_clinic_id ON supervisor_conversations(clinic_id);
CREATE INDEX idx_supervisor_conversations_created_at ON supervisor_conversations(created_at DESC);
CREATE INDEX idx_supervisor_conversations_deleted_at ON supervisor_conversations(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Включаем RLS
ALTER TABLE supervisor_conversations ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть только беседы своих пациентов из своей клиники
CREATE POLICY "Users can view supervisor conversations for their clinic patients"
    ON supervisor_conversations
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND deleted_at IS NULL
    );

-- Политика: пользователи могут создавать беседы для пациентов своей клиники
CREATE POLICY "Users can create supervisor conversations for their clinic patients"
    ON supervisor_conversations
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND patient_id IN (
            SELECT id FROM patients 
            WHERE clinic_id IN (
                SELECT clinic_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

-- Политика: пользователи могут обновлять только свои беседы
CREATE POLICY "Users can update their own supervisor conversations"
    ON supervisor_conversations
    FOR UPDATE
    USING (user_id = auth.uid() AND deleted_at IS NULL)
    WITH CHECK (user_id = auth.uid());

-- Политика: пользователи могут удалять только свои беседы (soft delete)
CREATE POLICY "Users can delete their own supervisor conversations"
    ON supervisor_conversations
    FOR UPDATE
    USING (user_id = auth.uid() AND deleted_at IS NULL)
    WITH CHECK (user_id = auth.uid());

-- ============================================
-- FUNCTIONS
-- ============================================

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_supervisor_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для обновления updated_at
CREATE TRIGGER supervisor_conversations_updated_at
    BEFORE UPDATE ON supervisor_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_supervisor_conversations_updated_at();

-- Функция для автоматического подсчета количества сообщений
CREATE OR REPLACE FUNCTION update_supervisor_conversations_message_count()
RETURNS TRIGGER AS $$
BEGIN
    NEW.message_count = jsonb_array_length(NEW.messages);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для обновления message_count
CREATE TRIGGER supervisor_conversations_message_count
    BEFORE INSERT OR UPDATE ON supervisor_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_supervisor_conversations_message_count();

