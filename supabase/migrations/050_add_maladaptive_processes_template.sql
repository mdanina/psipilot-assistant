-- PsiPilot Assistant - AI Analysis Template
-- Migration: 050_add_maladaptive_processes_template
-- Description: Add system block template and note template for maladaptive processes conceptualization

-- ============================================
-- SYSTEM BLOCK TEMPLATE: Концептуализация дезадаптирующих процессов
-- ============================================

-- Проверяем, существует ли уже блок с таким slug (идемпотентность)
DO $$
DECLARE
  existing_block_id UUID;
BEGIN
  SELECT id INTO existing_block_id
  FROM note_block_templates 
  WHERE slug = 'maladaptive_processes' AND is_system = true
  LIMIT 1;

  -- Если блок не существует, создаём его
  IF existing_block_id IS NULL THEN
    INSERT INTO note_block_templates (
      id, clinic_id, name, name_en, slug, description, category, system_prompt, is_system, position
    ) VALUES (
      gen_random_uuid(),
      NULL,
      'Концептуализация дезадаптирующих процессов',
      'Maladaptive Processes Conceptualization',
      'maladaptive_processes',
      'Анализ дезадаптирующих психологических процессов: уязвимости и отклики (копинги)',
      'assessment',
      'Ты — опытный психотерапевт и исследователь терапии (в духе Стивена Хайеса), работающий в парадигме процесс-ориентированного подхода и трансдиагностических факторов.

Задача:
Проанализируй текст сессии и выдели 3–5 наиболее часто встречающихся и влияющих на состояние клиента дезадаптивных психологических процессов. Используй рамку трансдиагностических процессов (например: перфекционизм, руминации, схемы, метакогнитивные убеждения, избегание, интолерантность к неопределённости, самокритика и др.).

Раздели их на два уровня:

Уязвимости — устойчивые когнитивные, эмоциональные или межличностные предрасположенности (например: перфекционизм, негативные схемы, страх оценки).

Отклики (копинг/совладание) — привычные поведенческие и эмоциональные стратегии реагирования (например: избегание, подавление эмоций, руминации).

Формат вывода:

Уязвимости:
1. [название процесса] — [краткое описание проявления в речи клиента]
2. …

Отклики (копинги):
1. [название процесса] — [краткое описание проявления в речи клиента]
2. …

Комментарий: [связь этих паттернов с трудностями клиента и темами сессии]

Если информации недостаточно — ответь "не удалось выделить".',
      true,
      12
    );
  END IF;
END $$;

-- ============================================
-- SYSTEM NOTE TEMPLATE: Концептуализация дезадаптирующих процессов
-- ============================================
-- Create system template that includes only the maladaptive processes block

DO $$
DECLARE
  block_id UUID;
  existing_template_id UUID;
BEGIN
  -- Получаем ID блока (созданного выше или уже существующего)
  SELECT id INTO block_id
  FROM note_block_templates 
  WHERE slug = 'maladaptive_processes' AND is_system = true
  LIMIT 1;

  -- Проверяем, что блок найден
  IF block_id IS NULL THEN
    RAISE EXCEPTION 'Block template with slug maladaptive_processes not found';
  END IF;

  -- Проверяем, существует ли уже шаблон с таким именем для системных шаблонов
  SELECT id INTO existing_template_id
  FROM clinical_note_templates 
  WHERE name = 'Концептуализация дезадаптирующих процессов' 
    AND clinic_id IS NULL 
    AND is_system = true
  LIMIT 1;

  -- Если шаблон не существует, создаём его
  IF existing_template_id IS NULL THEN
    INSERT INTO clinical_note_templates (
      id, clinic_id, name, name_en, description, block_template_ids, is_default, is_system
    ) VALUES (
      gen_random_uuid(),
      NULL,
      'Концептуализация дезадаптирующих процессов',
      'Maladaptive Processes Conceptualization',
      'Анализ дезадаптирующих психологических процессов в парадигме трансдиагностических факторов: уязвимости и отклики (копинги совладания)',
      ARRAY[block_id],
      false,
      true
    );
  END IF;
END $$;

