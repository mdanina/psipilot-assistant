-- PsiPilot Assistant - Supervisor Conversations
-- Migration: 049_supervisor_conversations
-- Description: Создание таблицы для хранения бесед с AI супервизором

CREATE TABLE IF NOT EXISTS supervisor_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Беседа с супервизором',
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    message_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    is_draft BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_supervisor_conversations_patient_id ON supervisor_conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_conversations_user_id ON supervisor_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_conversations_clinic_id ON supervisor_conversations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_conversations_created_at ON supervisor_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_conversations_deleted_at ON supervisor_conversations(deleted_at) WHERE deleted_at IS NULL;

-- Комментарии
COMMENT ON TABLE supervisor_conversations IS 'Беседы с AI супервизором, привязанные к пациентам';
COMMENT ON COLUMN supervisor_conversations.messages IS 'JSON массив сообщений: [{"role": "user|assistant", "content": "...", "timestamp": "..."}]';
COMMENT ON COLUMN supervisor_conversations.is_draft IS 'Черновик (несохраненная беседа)';

-- Row Level Security
ALTER TABLE supervisor_conversations ENABLE ROW LEVEL SECURITY;

-- Политики RLS
DROP POLICY IF EXISTS "Users can view supervisor conversations for their clinic patients" ON supervisor_conversations;
CREATE POLICY "Users can view supervisor conversations for their clinic patients"
    ON supervisor_conversations
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND deleted_at IS NULL
    );

DROP POLICY IF EXISTS "Users can insert supervisor conversations for their clinic patients" ON supervisor_conversations;
CREATE POLICY "Users can insert supervisor conversations for their clinic patients"
    ON supervisor_conversations
    FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND user_id = auth.uid()
        AND patient_id IN (
            SELECT id FROM patients 
            WHERE clinic_id IN (
                SELECT clinic_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update their own supervisor conversations" ON supervisor_conversations;
CREATE POLICY "Users can update their own supervisor conversations"
    ON supervisor_conversations
    FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND user_id = auth.uid()
        AND deleted_at IS NULL
    )
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Users can soft delete their own supervisor conversations" ON supervisor_conversations;
CREATE POLICY "Users can soft delete their own supervisor conversations"
    ON supervisor_conversations
    FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND user_id = auth.uid()
        AND deleted_at IS NULL
    )
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM profiles WHERE id = auth.uid()
        )
        AND user_id = auth.uid()
    );

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_supervisor_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS supervisor_conversations_updated_at ON supervisor_conversations;
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

DROP TRIGGER IF EXISTS supervisor_conversations_message_count ON supervisor_conversations;
CREATE TRIGGER supervisor_conversations_message_count
    BEFORE INSERT OR UPDATE ON supervisor_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_supervisor_conversations_message_count();

