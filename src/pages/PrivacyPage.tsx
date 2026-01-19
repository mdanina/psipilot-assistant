import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ShrimpIcon } from '@/components/ShrimpIcon';

export default function PrivacyPage() {
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
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Политика конфиденциальности</h1>

          <p className="text-sm text-muted-foreground mb-8">
            Дата вступления в силу: 1 января 2025 г.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">1. Введение</h2>
            <p className="text-muted-foreground mb-4">
              Настоящая Политика конфиденциальности (далее — «Политика») описывает, как
              некоммерческое сообщество «Лаборатория Mental Tech» (далее — «Мы», «Нас», «Наш»)
              собирает, использует и защищает персональные данные пользователей веб-сервиса
              Supershrimp (далее — «Сервис»).
            </p>
            <p className="text-muted-foreground mb-4">
              Мы серьёзно относимся к защите ваших персональных данных и данных ваших пациентов.
              Обработка данных осуществляется в соответствии с Федеральным законом № 152-ФЗ
              «О персональных данных».
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">2. Какие данные мы собираем</h2>

            <h3 className="text-lg font-medium mb-3">2.1. Данные пользователей (специалистов)</h3>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>ФИО и контактные данные (email)</li>
              <li>Данные учётной записи (логин, зашифрованный пароль)</li>
              <li>Информация о клинике/организации</li>
              <li>Настройки и предпочтения в Сервисе</li>
              <li>Техническая информация (IP-адрес, тип браузера, временные метки)</li>
            </ul>

            <h3 className="text-lg font-medium mb-3">2.2. Данные пациентов</h3>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>ФИО пациентов</li>
              <li>Контактная информация пациентов</li>
              <li>Аудиозаписи терапевтических сессий</li>
              <li>Транскрипции и анализ сессий</li>
              <li>Клинические заметки и отчёты</li>
              <li>История записей и консультаций</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">3. Цели обработки данных</h2>
            <p className="text-muted-foreground mb-4">
              Мы обрабатываем персональные данные для следующих целей:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Предоставление функциональности Сервиса</li>
              <li>Авторизация и аутентификация пользователей</li>
              <li>Транскрибация и анализ аудиозаписей сессий</li>
              <li>Формирование клинической документации</li>
              <li>Управление расписанием и записями</li>
              <li>Техническая поддержка и улучшение Сервиса</li>
              <li>Обеспечение безопасности и предотвращение мошенничества</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">4. Правовые основания обработки</h2>
            <p className="text-muted-foreground mb-4">
              Обработка персональных данных осуществляется на следующих правовых основаниях:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li><strong>Согласие субъекта данных</strong> — вы даёте согласие при регистрации</li>
              <li><strong>Исполнение договора</strong> — для предоставления услуг Сервиса</li>
              <li><strong>Законные интересы</strong> — для обеспечения безопасности и улучшения Сервиса</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">5. Хранение и защита данных</h2>

            <h3 className="text-lg font-medium mb-3">5.1. Меры безопасности</h3>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Шифрование данных при передаче (TLS/SSL)</li>
              <li>Шифрование данных при хранении</li>
              <li>Контроль доступа на основе ролей</li>
              <li>Регулярное резервное копирование</li>
              <li>Мониторинг безопасности и обнаружение вторжений</li>
              <li>Аудит доступа к данным</li>
            </ul>

            <h3 className="text-lg font-medium mb-3">5.2. Сроки хранения</h3>
            <p className="text-muted-foreground mb-4">
              Персональные данные хранятся в течение всего периода использования Сервиса.
              После удаления учётной записи данные удаляются в течение 30 дней, за исключением
              случаев, когда законодательство требует более длительного хранения.
            </p>

            <h3 className="text-lg font-medium mb-3">5.3. Аудиозаписи</h3>
            <p className="text-muted-foreground mb-4">
              Аудиозаписи сессий обрабатываются для транскрибации и анализа. После завершения
              обработки исходные аудиофайлы могут быть удалены по вашему запросу. Транскрипции
              хранятся в соответствии с общими сроками хранения данных.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">6. Передача данных третьим лицам</h2>
            <p className="text-muted-foreground mb-4">
              Мы можем передавать данные следующим категориям получателей:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li><strong>Провайдеры облачной инфраструктуры</strong> — для хранения данных</li>
              <li><strong>Сервисы транскрибации</strong> — для обработки аудиозаписей</li>
              <li><strong>Провайдеры ИИ-моделей</strong> — для анализа текста</li>
            </ul>
            <p className="text-muted-foreground mb-4">
              Все третьи лица обязаны соблюдать конфиденциальность и обрабатывать данные
              только в соответствии с нашими инструкциями. Мы не продаём и не передаём
              персональные данные для маркетинговых целей.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">7. Ваши права</h2>
            <p className="text-muted-foreground mb-4">
              В соответствии с законодательством о персональных данных вы имеете право:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li><strong>Доступ</strong> — получить информацию о ваших персональных данных</li>
              <li><strong>Исправление</strong> — исправить неточные или неполные данные</li>
              <li><strong>Удаление</strong> — потребовать удаления ваших данных</li>
              <li><strong>Ограничение</strong> — ограничить обработку ваших данных</li>
              <li><strong>Переносимость</strong> — получить данные в машиночитаемом формате</li>
              <li><strong>Отзыв согласия</strong> — отозвать согласие на обработку данных</li>
            </ul>
            <p className="text-muted-foreground mb-4">
              Для реализации своих прав обратитесь к нам по указанным контактным данным.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">8. Ответственность специалиста</h2>
            <p className="text-muted-foreground mb-4">
              Как пользователь Сервиса (специалист), вы несёте ответственность за:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Получение информированного согласия пациентов на обработку их данных</li>
              <li>Законность загрузки данных пациентов в Сервис</li>
              <li>Соблюдение врачебной тайны и профессиональной этики</li>
              <li>Безопасность своей учётной записи</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">9. Файлы cookie</h2>
            <p className="text-muted-foreground mb-4">
              Мы используем файлы cookie и аналогичные технологии для:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
              <li>Поддержания авторизации пользователя</li>
              <li>Сохранения настроек и предпочтений</li>
              <li>Анализа использования Сервиса</li>
              <li>Обеспечения безопасности</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">10. Изменения Политики</h2>
            <p className="text-muted-foreground mb-4">
              Мы можем обновлять настоящую Политику. О существенных изменениях мы уведомим
              вас по электронной почте или через интерфейс Сервиса. Актуальная версия
              Политики всегда доступна на данной странице.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">11. Контактная информация</h2>
            <p className="text-muted-foreground mb-4">
              По вопросам обработки персональных данных и реализации ваших прав
              обращайтесь к нам:
            </p>
            <p className="text-muted-foreground">
              <strong>Лаборатория Mental Tech</strong><br />
              Email: <a href="mailto:info@mentaltech.ru" className="text-primary hover:underline">info@mentaltech.ru</a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">12. Надзорный орган</h2>
            <p className="text-muted-foreground mb-4">
              Если вы считаете, что обработка ваших персональных данных нарушает ваши права,
              вы можете подать жалобу в Роскомнадзор (Федеральная служба по надзору в сфере
              связи, информационных технологий и массовых коммуникаций).
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
