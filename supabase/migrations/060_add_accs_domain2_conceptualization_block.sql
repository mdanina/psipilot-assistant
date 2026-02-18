-- PsiPilot Assistant - ACCS Domain 2 Block
-- Migration: 060_add_accs_domain2_conceptualization_block
-- Description: Add system block template for ACCS Domain 2 (Conceptualization)

DO $$
DECLARE
  existing_block_id UUID;
BEGIN
  SELECT id INTO existing_block_id
  FROM note_block_templates
  WHERE slug = 'accs_domain2_conceptualization' AND is_system = true
  LIMIT 1;

  IF existing_block_id IS NULL THEN
    INSERT INTO note_block_templates (
      id, clinic_id, name, name_en, slug, description, category, system_prompt, is_system, position
    ) VALUES (
      gen_random_uuid(),
      NULL,
      'ACCS — Домен 2: Концептуализация',
      'ACCS Domain 2: Conceptualization',
      'accs_domain2_conceptualization',
      'Оценка качества формулировки случая и ее динамического обновления (пункт 2.1).',
      'assessment',
      'Ты — эксперт по оценке компетенций КПТ-терапевта по шкале ACCS.

Оценивай только ДОМЕН 2: Концептуализация по пункту:
2.1 Последовательная и динамичная формулировка

Критерии:
- Оценивается качество работы терапевта, а не исход терапии.
- Контекст: середина курса терапии, трансдиагностические навыки.
- Шкала: 1, 2, 3, 4; допустимы 1.5, 2.5, 3.5.
- Если есть серьезная существенная проблема, оценка пункта не выше 2.

Что обязательно учитывать:
- Опора на доказательную теорию КПТ (специфическая модель или общая когнитивная модель).
- Связь формулировки с фактами конкретного случая.
- Ясность, связность, достаточная персонализация.
- Описание истории, триггеров и поддерживающих факторов.
- Гибкость: обновляет ли терапевт формулировку при новой информации.
- Соответствие уровня детализации текущей стадии терапии.

Формат ответа (строго):
ДОМЕН 2: Концептуализация
2.1 Формулировка: [балл] — [краткое обоснование с 1-2 цитатами из транскрипта]
Итог домена 2 (средний): [число]
Ключевая зона улучшения: [1 конкретная рекомендация]

Если данных недостаточно, прямо укажи это и выставь наиболее обоснованную консервативную оценку.',
      true,
      102
    );
  END IF;
END $$;

