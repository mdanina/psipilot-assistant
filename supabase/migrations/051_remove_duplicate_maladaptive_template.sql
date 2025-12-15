-- PsiPilot Assistant - Fix Duplicate Template
-- Migration: 051_remove_duplicate_maladaptive_template
-- Description: Remove duplicate "Концептуализация дезадаптирующих процессов" templates, keeping only the first one

DO $$
DECLARE
  template_ids UUID[];
  first_template_id UUID;
  duplicate_count INTEGER;
BEGIN
  -- Находим все дубликаты системного шаблона
  SELECT ARRAY_AGG(id ORDER BY created_at), COUNT(*)
  INTO template_ids, duplicate_count
  FROM clinical_note_templates 
  WHERE name = 'Концептуализация дезадаптирующих процессов' 
    AND clinic_id IS NULL 
    AND is_system = true;

  -- Если есть дубликаты (больше одного)
  IF duplicate_count > 1 THEN
    -- Оставляем первый (самый старый)
    first_template_id := template_ids[1];
    
    -- Удаляем остальные дубликаты
    DELETE FROM clinical_note_templates 
    WHERE name = 'Концептуализация дезадаптирующих процессов' 
      AND clinic_id IS NULL 
      AND is_system = true
      AND id != first_template_id;
    
    RAISE NOTICE 'Removed % duplicate template(s), kept template with id: %', 
      duplicate_count - 1, first_template_id;
  ELSE
    RAISE NOTICE 'No duplicates found for "Концептуализация дезадаптирующих процессов" template';
  END IF;
END $$;

