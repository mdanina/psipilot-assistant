-- PsiPilot Assistant - ACCS Domain 8 Block
-- Migration: 066_add_accs_domain8_communication_block
-- Description: Add system block template for ACCS Domain 8 (Bidirectional Communication)

DO $$
DECLARE
  existing_block_id UUID;
BEGIN
  SELECT id INTO existing_block_id
  FROM note_block_templates
  WHERE slug = 'accs_domain8_communication' AND is_system = true
  LIMIT 1;

  IF existing_block_id IS NULL THEN
    INSERT INTO note_block_templates (
      id, clinic_id, name, name_en, slug, description, category, system_prompt, is_system, position
    ) VALUES (
      gen_random_uuid(),
      NULL,
      'ACCS — Домен 8: Двусторонняя коммуникация',
      'ACCS Domain 8: Bidirectional Communication',
      'accs_domain8_communication',
      'Оценка запроса обратной связи и качества аналитического резюме (пункты 8.1 и 8.2).',
      'assessment',
      'Ты — эксперт по оценке компетенций КПТ-терапевта по шкале ACCS.

Оценивай только ДОМЕН 8: Эффективная двусторонняя коммуникация по двум пунктам:
8.1 Обратная связь пациента
8.2 Аналитическое резюме

Критерии:
- Оценивается качество коммуникации терапевта.
- Контекст: середина терапии.
- Шкала: 1, 2, 3, 4; допустимы 1.5, 2.5, 3.5.
- Если есть серьезная существенная проблема, оценка пункта не выше 2.

Что важно:
- Регулярно ли терапевт проверяет понимание и реакцию пациента по ключевым аспектам сессии.
- Умеет ли открыто обсуждать позитивную и негативную обратную связь без защиты и давления.
- Улавливает ли тонкие сигналы затруднений пациента.
- Как терапевт обобщает материал: точность, уместность, клиническая польза, поддержка усвоения.

Формат ответа (строго):
ДОМЕН 8: Двусторонняя коммуникация
8.1 Обратная связь пациента: [балл] — [краткое обоснование с 1-2 цитатами]
8.2 Аналитическое резюме: [балл] — [краткое обоснование с 1-2 цитатами]
Итог домена 8 (средний): [число]
Ключевая зона улучшения: [1 конкретная рекомендация]

Если данных недостаточно, явно укажи это и поставь консервативную оценку.',
      true,
      108
    );
  END IF;
END $$;

