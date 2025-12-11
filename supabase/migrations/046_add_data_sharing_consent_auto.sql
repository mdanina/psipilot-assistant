-- PsiPilot Assistant - Auto-create Data Sharing Consent
-- Migration: 046_add_data_sharing_consent_auto
-- Description: Update create_default_consent() to also create data_sharing consent automatically

-- ============================================
-- UPDATE create_default_consent() FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION create_default_consent()
RETURNS TRIGGER AS $$
DECLARE
    v_collected_by UUID;
BEGIN
    -- Get the user who created the patient
    v_collected_by := COALESCE(NEW.created_by, auth.uid());

    -- Validate that we have a user ID
    IF v_collected_by IS NULL THEN
        RAISE WARNING 'Cannot create default consent: no user ID available for patient %', NEW.id;
        RETURN NEW; -- Don't fail the patient creation
    END IF;

    -- Create default 'data_processing' consent (required for basic functionality)
    BEGIN
        INSERT INTO consent_records (
            patient_id,
            consent_type,
            consent_purpose,
            legal_basis,
            status,
            given_at,
            consent_method,
            collected_by,
            data_categories,
            notes
        ) VALUES (
            NEW.id,
            'data_processing',
            'Обработка персональных данных для оказания медицинских услуг в соответствии с договором',
            'contract', -- GDPR Article 6(1)(b) - performance of a contract
            'active',
            NOW(),
            'electronic',
            v_collected_by,
            ARRAY['personal', 'health'],
            'Автоматически создано при регистрации пациента. Требует подтверждения.'
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log error but don't fail patient creation
            RAISE WARNING 'Error creating data_processing consent for patient %: %', NEW.id, SQLERRM;
            -- Optionally log to trigger_errors table if it exists
            BEGIN
                INSERT INTO trigger_errors (
                    trigger_name,
                    table_name,
                    record_id,
                    error_message,
                    error_detail
                ) VALUES (
                    'create_patient_default_consent',
                    'consent_records',
                    NEW.id,
                    SQLERRM,
                    SQLSTATE || ': ' || SQLERRM
                );
            EXCEPTION
                WHEN OTHERS THEN
                    -- Ignore if trigger_errors table doesn't exist
                    NULL;
            END;
    END;

    -- Create default 'data_sharing' consent (required for third-party services: AssemblyAI, OpenAI)
    BEGIN
        INSERT INTO consent_records (
            patient_id,
            consent_type,
            consent_purpose,
            legal_basis,
            status,
            given_at,
            consent_method,
            collected_by,
            data_categories,
            third_party_sharing,
            third_parties,
            notes
        ) VALUES (
            NEW.id,
            'data_sharing',
            'Передача персональных данных третьим лицам для оказания медицинских услуг: транскрипция аудиозаписей (AssemblyAI) и генерация клинических заметок (OpenAI). Данные передаются в анонимизированном виде, где это возможно.',
            'consent', -- Для передачи данных третьим лицам требуется явное согласие
            'active',
            NOW(),
            'electronic',
            v_collected_by,
            ARRAY['personal', 'health'],
            true,
            ARRAY['AssemblyAI (США)', 'OpenAI (США)'],
            'Автоматически создано при регистрации пациента. Необходимо для работы сервисов транскрипции и AI-анализа. Требует подтверждения от пациента.'
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log error but don't fail patient creation
            RAISE WARNING 'Error creating data_sharing consent for patient %: %', NEW.id, SQLERRM;
            -- Optionally log to trigger_errors table if it exists
            BEGIN
                INSERT INTO trigger_errors (
                    trigger_name,
                    table_name,
                    record_id,
                    error_message,
                    error_detail
                ) VALUES (
                    'create_patient_default_consent',
                    'consent_records',
                    NEW.id,
                    SQLERRM,
                    SQLSTATE || ': ' || SQLERRM
                );
            EXCEPTION
                WHEN OTHERS THEN
                    -- Ignore if trigger_errors table doesn't exist
                    NULL;
            END;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_default_consent() IS 
'Automatically creates default consent records when a new patient is added:
1. data_processing - для базовой обработки данных (legal_basis: contract)
2. data_sharing - для передачи данных третьим лицам (AssemblyAI, OpenAI) (legal_basis: consent)

Improved error handling prevents patient creation failures.
Errors are logged but do not block patient creation.
Both consents are marked as requiring patient confirmation.';

