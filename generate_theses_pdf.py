#!/usr/bin/env python3
"""Generate a one-page PDF with theses on AI for psychotherapist competency assessment."""

from fpdf import FPDF

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
OUTPUT = "/home/user/psipilot-assistant/AI_Therapist_Competency_Assessment.pdf"


class ThesesPDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-15)
        self.set_font("DejaVu", size=8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"— {self.page_no()} —", align="C")


def build_pdf():
    pdf = ThesesPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)

    # Register fonts
    pdf.add_font("DejaVu", "", FONT_DIR + "DejaVuSans.ttf")
    pdf.add_font("DejaVu", "B", FONT_DIR + "DejaVuSans-Bold.ttf")
    pdf.add_font("DejaVuSerif", "", FONT_DIR + "DejaVuSerif.ttf")
    pdf.add_font("DejaVuSerif", "B", FONT_DIR + "DejaVuSerif-Bold.ttf")

    pdf.add_page()

    # --- Title ---
    pdf.set_font("DejaVu", "B", 14)
    pdf.set_text_color(30, 30, 30)
    pdf.multi_cell(0, 7, "Искусственный интеллект для оценки компетенций\nпсихотерапевта", align="C")
    pdf.ln(2)

    # --- Subtitle ---
    pdf.set_font("DejaVu", "", 10)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 6, "Тезисы", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # --- Separator ---
    pdf.set_draw_color(180, 180, 180)
    pdf.set_line_width(0.3)
    x_start = pdf.l_margin
    x_end = pdf.w - pdf.r_margin
    pdf.line(x_start, pdf.get_y(), x_end, pdf.get_y())
    pdf.ln(5)

    # --- Content ---
    theses = [
        (
            "Актуальность проблемы",
            "Качество психотерапевтической помощи напрямую зависит от уровня "
            "профессиональных компетенций специалиста. Традиционные методы оценки — "
            "супервизия, экспертные разборы, самоотчёты — субъективны, трудоёмки "
            "и трудно масштабируемы. ИИ-технологии открывают возможности для "
            "объективного, воспроизводимого и непрерывного мониторинга компетенций."
        ),
        (
            "Анализируемые компоненты компетенций",
            "ИИ позволяет оценивать: (а) коммуникативные навыки — эмпатию, "
            "активное слушание, отражение чувств; (б) соблюдение протокола терапии "
            "(КБТ, ДБТ, психодинамический подход); (в) терапевтический альянс по "
            "лингвистическим маркерам; (г) адекватность интервенций клинической картине."
        ),
        (
            "Технологическая основа",
            "Ключевые технологии: автоматическая транскрипция речи (ASR) с диаризацией "
            "говорящих, обработка естественного языка (NLP), большие языковые модели (LLM) "
            "для контекстного анализа диалога, классификация речевых актов, анализ "
            "просодических и паралингвистических характеристик."
        ),
        (
            "Возможности ИИ-оценки",
            "Автоматическая обратная связь по каждой сессии; выявление паттернов, "
            "невидимых при ручном разборе; отслеживание динамики развития навыков "
            "во времени; формирование индивидуальных рекомендаций по обучению; "
            "стандартизация оценки для программ подготовки и сертификации."
        ),
        (
            "Этические и методологические вызовы",
            "Конфиденциальность данных пациента (HIPAA, GDPR, 152-ФЗ); информированное "
            "согласие на запись и анализ; риск алгоритмической предвзятости, связанной "
            "с культурными и языковыми особенностями; опасность редукции сложных "
            "терапевтических процессов к формальным метрикам; необходимость "
            "валидации ИИ-оценок относительно экспертного золотого стандарта."
        ),
        (
            "Практическое применение",
            "Интеграция ИИ-оценки в системы клинической документации позволяет "
            "совмещать ведение записей с автоматическим анализом качества сессии. "
            "Примером служат платформы, которые на основе транскрипции формируют "
            "клинические заметки и параллельно оценивают соответствие сессии "
            "выбранному терапевтическому подходу."
        ),
        (
            "Перспективы развития",
            "Мультимодальный анализ (речь + мимика + физиологические данные); "
            "адаптивные системы обучения с ИИ-наставником; межъязыковые модели "
            "оценки; интеграция с VR-симуляторами для безопасной отработки навыков; "
            "создание национальных стандартов ИИ-ассистированной супервизии."
        ),
    ]

    for i, (title, body) in enumerate(theses, 1):
        # Thesis number + title
        pdf.set_font("DejaVu", "B", 10)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 6, f"{i}. {title}", new_x="LMARGIN", new_y="NEXT")

        # Thesis body
        pdf.set_font("DejaVuSerif", "", 9)
        pdf.set_text_color(50, 50, 50)
        pdf.multi_cell(0, 5, body)
        pdf.ln(2)

    # --- Bottom separator ---
    pdf.ln(1)
    pdf.set_draw_color(180, 180, 180)
    pdf.line(x_start, pdf.get_y(), x_end, pdf.get_y())
    pdf.ln(3)

    # --- Footer note ---
    pdf.set_font("DejaVu", "", 8)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 5, "Март 2026", align="R")

    pdf.output(OUTPUT)
    print(f"PDF saved: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
