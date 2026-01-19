import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ShrimpIcon } from '@/components/ShrimpIcon';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/register"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к регистрации
          </Link>
        </div>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
            <ShrimpIcon className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold">Supershrimp</span>
        </div>

        {/* Content */}
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Условия использования</h1>

          <p className="text-sm text-muted-foreground mb-8">
            Дата вступления в силу: 1 января 2025 г.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Общие положения</h2>
            <p className="text-muted-foreground mb-4">
              Настоящие Условия использования (далее — «Условия») регулируют порядок использования
              веб-сервиса Supershrimp (далее — «Сервис»), предоставляемого некоммерческим сообществом
              «Лаборатория Mental Tech» (далее — «Мы», «Нас», «Наш»).
            </p>
            <p className="text-muted-foreground mb-4">
              Используя Сервис, вы подтверждаете, что ознакомились с настоящими Условиями и принимаете
              их в полном объёме. Если вы не согласны с какими-либо положениями Условий, пожалуйста,
              воздержитесь от использования Сервиса.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. Описание Сервиса</h2>
            <p className="text-muted-foreground mb-4">
              Supershrimp — это ИИ-копайлот для психологов и психиатров, предназначенный для:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Автоматизации ведения клинической документации</li>
              <li>Транскрибации и анализа терапевтических сессий</li>
              <li>Управления расписанием и записями пациентов</li>
              <li>Формирования структурированных отчётов и заметок</li>
            </ul>
            <p className="text-muted-foreground mb-4">
              Сервис является вспомогательным инструментом и не заменяет профессиональное
              клиническое суждение специалиста.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. Регистрация и учётная запись</h2>
            <p className="text-muted-foreground mb-4">
              Для использования Сервиса необходимо создать учётную запись. Вы обязуетесь:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Предоставлять достоверную информацию при регистрации</li>
              <li>Обеспечивать конфиденциальность данных своей учётной записи</li>
              <li>Незамедлительно уведомлять нас о несанкционированном доступе к вашей учётной записи</li>
              <li>Нести ответственность за все действия, совершённые под вашей учётной записью</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Правила использования</h2>
            <p className="text-muted-foreground mb-4">
              При использовании Сервиса запрещается:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Нарушать действующее законодательство Российской Федерации</li>
              <li>Загружать данные пациентов без их информированного согласия</li>
              <li>Использовать Сервис для целей, не связанных с профессиональной деятельностью</li>
              <li>Пытаться получить несанкционированный доступ к данным других пользователей</li>
              <li>Нарушать работу Сервиса техническими средствами</li>
              <li>Передавать доступ к учётной записи третьим лицам</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Интеллектуальная собственность</h2>
            <p className="text-muted-foreground mb-4">
              Все права на Сервис, включая программный код, дизайн, логотипы и торговые знаки,
              принадлежат Лаборатории Mental Tech. Использование Сервиса не предоставляет вам
              каких-либо прав на интеллектуальную собственность.
            </p>
            <p className="text-muted-foreground mb-4">
              Данные, которые вы загружаете в Сервис, остаются вашей собственностью. Вы
              предоставляете нам ограниченную лицензию на обработку этих данных исключительно
              для предоставления функциональности Сервиса.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Ограничение ответственности</h2>
            <p className="text-muted-foreground mb-4">
              Сервис предоставляется «как есть». Мы не гарантируем:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Бесперебойную работу Сервиса</li>
              <li>Полную точность результатов анализа и транскрибации</li>
              <li>Соответствие Сервиса всем вашим ожиданиям</li>
            </ul>
            <p className="text-muted-foreground mb-4">
              Вы несёте полную ответственность за верификацию результатов работы Сервиса и
              принятие клинических решений. Мы не несём ответственности за последствия
              использования результатов работы Сервиса без надлежащей проверки.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Некоммерческий характер</h2>
            <p className="text-muted-foreground mb-4">
              Supershrimp является проектом некоммерческого сообщества и предоставляется
              на безвозмездной основе. Мы оставляем за собой право вводить платные функции
              в будущем с предварительным уведомлением пользователей.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Изменение Условий</h2>
            <p className="text-muted-foreground mb-4">
              Мы вправе изменять настоящие Условия в любое время. О существенных изменениях
              мы уведомим вас по электронной почте или через интерфейс Сервиса. Продолжение
              использования Сервиса после внесения изменений означает ваше согласие с новой
              редакцией Условий.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">9. Прекращение использования</h2>
            <p className="text-muted-foreground mb-4">
              Вы можете прекратить использование Сервиса в любое время, удалив свою учётную
              запись. Мы вправе приостановить или прекратить ваш доступ к Сервису в случае
              нарушения настоящих Условий.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">10. Применимое право</h2>
            <p className="text-muted-foreground mb-4">
              Настоящие Условия регулируются законодательством Российской Федерации.
              Все споры подлежат разрешению в соответствии с действующим законодательством РФ.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">11. Контактная информация</h2>
            <p className="text-muted-foreground mb-4">
              По всем вопросам, связанным с настоящими Условиями, вы можете связаться с нами:
            </p>
            <p className="text-muted-foreground">
              <strong>Лаборатория Mental Tech</strong><br />
              Email: <a href="mailto:info@mentaltech.ru" className="text-primary hover:underline">info@mentaltech.ru</a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Лаборатория Mental Tech. Все права защищены.</p>
        </div>
      </div>
    </div>
  );
}
