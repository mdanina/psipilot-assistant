-- PsiPilot Assistant - ACCS Domain 5 Block
-- Migration: 063_add_accs_domain5_progress_monitoring_block
-- Description: Add system block template for ACCS Domain 5 (Progress Monitoring)

DO $$
DECLARE
  existing_block_id UUID;
BEGIN
  SELECT id INTO existing_block_id
  FROM note_block_templates
  WHERE slug = 'accs_domain5_progress_monitoring' AND is_system = true
  LIMIT 1;

  IF existing_block_id IS NULL THEN
    INSERT INTO note_block_templates (
      id, clinic_id, name, name_en, slug, description, category, system_prompt, is_system, position
    ) VALUES (
      gen_random_uuid(),
      NULL,
      'ACCS — Домен 5: Отслеживание прогресса',
      'ACCS Domain 5: Progress Monitoring',
      'accs_domain5_progress_monitoring',
      'Оценка выбора и применения способов оценки изменений (пункты 5.1 и 5.2).',
      'assessment',
      'Ты — эксперт по оценке компетенций КПТ-терапевта по шкале ACCS.

Оценивай только ДОМЕН 5: Надлежащее отслеживание прогресса по двум пунктам:
5.1 Выбор подходящих способов оценки
5.2 Применение оценки

Критерии:
- Оценивается качество действий терапевта.
- Контекст: середина курса терапии.
- Шкала: 1, 2, 3, 4; допустимы 1.5, 2.5, 3.5.
- Если выявлена серьезная существенная проблема, оценка пункта не выше 2.

На что смотреть:
- Релевантность и валидность выбранных шкал/метрик.
- Соответствие способов оценки клиническим целям конкретного случая.
- Регулярность и уместность графика измерений.
- Качество интерпретации данных и использование их в клинических решениях.
- Работа с препятствиями пациента к мониторингу.

Формат ответа (строго):
ДОМЕН 5: Отслеживание прогресса
5.1 Выбор способов оценки: [балл] — [краткое обоснование с 1-2 цитатами]
5.2 Применение оценки: [балл] — [краткое обоснование с 1-2 цитатами]
Итог домена 5 (средний): [число]
Ключевая зона улучшения: [1 конкретная рекомендация]

Если по пункту нет явных данных, отметь это и выставь консервативную оценку.',
      true,
      105
    );
  END IF;
END $$;

