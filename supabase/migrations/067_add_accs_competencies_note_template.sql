-- PsiPilot Assistant - ACCS Competencies Note Template
-- Migration: 067_add_accs_competencies_note_template
-- Description: Create system note template "КПТ компетенции" from 8 ACCS domain blocks

DO $$
DECLARE
  existing_template_id UUID;
  block_ids UUID[];
BEGIN
  -- Проверяем, существует ли системный шаблон с таким именем
  SELECT id INTO existing_template_id
  FROM clinical_note_templates
  WHERE name = 'КПТ компетенции'
    AND clinic_id IS NULL
    AND is_system = true
  LIMIT 1;

  IF existing_template_id IS NULL THEN
    -- Собираем блоки ACCS доменов в фиксированном порядке
    SELECT ARRAY_AGG(id ORDER BY position)
    INTO block_ids
    FROM note_block_templates
    WHERE is_system = true
      AND slug IN (
        'accs_domain1_agenda',
        'accs_domain2_conceptualization',
        'accs_domain3_interventions',
        'accs_domain4_homework',
        'accs_domain5_progress_monitoring',
        'accs_domain6_time_management',
        'accs_domain7_relationship',
        'accs_domain8_communication'
      );

    -- Защита от неполного набора блоков
    IF block_ids IS NULL OR array_length(block_ids, 1) != 8 THEN
      RAISE EXCEPTION 'ACCS blocks are missing. Expected 8 blocks, got %', COALESCE(array_length(block_ids, 1), 0);
    END IF;

    INSERT INTO clinical_note_templates (
      id,
      clinic_id,
      user_id,
      name,
      name_en,
      description,
      block_template_ids,
      is_default,
      is_system,
      is_active
    ) VALUES (
      gen_random_uuid(),
      NULL,
      NULL,
      'КПТ компетенции',
      'CBT Competencies',
      'Комплексная оценка компетенций КПТ-терапевта по шкале ACCS (8 доменов)',
      block_ids,
      false,
      true,
      true
    );
  END IF;
END $$;

