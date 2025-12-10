/**
 * Скрипт для быстрого тестирования производительности
 * 
 * Использование:
 * 1. Открыть браузер на http://localhost:3000
 * 2. Открыть Console (F12)
 * 3. Скопировать и вставить этот скрипт
 * 4. Нажать Enter
 * 
 * Скрипт автоматически:
 * - Измерит время загрузки страниц
 * - Проверит количество запросов к БД
 * - Покажет результаты
 */

(function() {
  console.log('🧪 Начинаем тестирование производительности...\n');

  const results = {
    pages: {},
    network: {
      requests: 0,
      totalSize: 0,
      supabaseRequests: 0,
    }
  };

  // Функция для измерения времени загрузки страницы
  function measurePageLoad(pageName, url) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      
      // Очистить Network tab (если возможно)
      if (window.performance && window.performance.clearResourceTimings) {
        window.performance.clearResourceTimings();
      }

      // Перейти на страницу
      window.location.href = url;

      // Ждать загрузки
      window.addEventListener('load', () => {
        const loadTime = performance.now() - startTime;
        
        // Подсчитать запросы к Supabase
        const entries = performance.getEntriesByType('resource');
        const supabaseRequests = entries.filter(entry => 
          entry.name.includes('supabase') || 
          entry.name.includes('rest/v1')
        ).length;

        const totalSize = entries.reduce((sum, entry) => {
          return sum + (entry.transferSize || 0);
        }, 0);

        results.pages[pageName] = {
          loadTime: Math.round(loadTime),
          supabaseRequests,
          totalSize: Math.round(totalSize / 1024), // KB
        };

        console.log(`✅ ${pageName}:`);
        console.log(`   Время загрузки: ${Math.round(loadTime)}ms`);
        console.log(`   Запросов к Supabase: ${supabaseRequests}`);
        console.log(`   Размер данных: ${Math.round(totalSize / 1024)}KB\n`);

        resolve();
      }, { once: true });
    });
  }

  // Функция для проверки кеширования
  function testCaching() {
    console.log('🔄 Тестирование кеширования...\n');
    
    return new Promise((resolve) => {
      // Первая загрузка
      console.log('1️⃣ Первая загрузка /patients...');
      const firstLoadStart = performance.now();
      
      window.location.href = '/patients';
      
      window.addEventListener('load', () => {
        const firstLoadTime = performance.now() - firstLoadStart;
        const firstLoadRequests = performance.getEntriesByType('resource')
          .filter(e => e.name.includes('supabase') || e.name.includes('rest/v1')).length;

        console.log(`   Время: ${Math.round(firstLoadTime)}ms`);
        console.log(`   Запросов: ${firstLoadRequests}\n`);

        // Подождать немного
        setTimeout(() => {
          // Вторая загрузка (должна использовать кеш)
          console.log('2️⃣ Повторная загрузка /patients (должен использоваться кеш)...');
          const secondLoadStart = performance.now();
          
          // Очистить записи производительности
          if (window.performance && window.performance.clearResourceTimings) {
            window.performance.clearResourceTimings();
          }
          
          window.location.reload();
          
          window.addEventListener('load', () => {
            const secondLoadTime = performance.now() - secondLoadStart;
            const secondLoadRequests = performance.getEntriesByType('resource')
              .filter(e => e.name.includes('supabase') || e.name.includes('rest/v1')).length;

            console.log(`   Время: ${Math.round(secondLoadTime)}ms`);
            console.log(`   Запросов: ${secondLoadRequests}\n`);

            // Анализ результатов
            if (secondLoadRequests < firstLoadRequests) {
              console.log('✅ Кеширование работает! Запросов стало меньше.');
            } else if (secondLoadRequests === 0) {
              console.log('✅ Отлично! Кеш работает идеально - запросов нет.');
            } else {
              console.log('⚠️ Кеш может не работать. Проверьте настройки React Query.');
            }

            resolve();
          }, { once: true });
        }, 2000);
      }, { once: true });
    });
  }

  // Функция для проверки React Query
  function checkReactQuery() {
    console.log('🔍 Проверка React Query...\n');
    
    // Проверить, установлен ли React Query
    if (window.__REACT_QUERY_CLIENT__) {
      console.log('✅ React Query клиент найден');
    } else {
      console.log('⚠️ React Query клиент не найден (это нормально, если используется через провайдер)');
    }

    // Проверить наличие QueryClientProvider
    const queryProvider = document.querySelector('[data-react-query-provider]');
    if (queryProvider) {
      console.log('✅ QueryClientProvider найден\n');
    } else {
      console.log('⚠️ QueryClientProvider не найден (проверьте App.tsx)\n');
    }
  }

  // Главная функция
  async function runTests() {
    console.log('📊 Результаты тестирования:\n');
    console.log('='.repeat(50) + '\n');

    // Проверка React Query
    checkReactQuery();

    // Тест кеширования
    await testCaching();

    console.log('='.repeat(50));
    console.log('\n✅ Тестирование завершено!');
    console.log('\n💡 Совет: Откройте Network tab (F12 → Network) для детального анализа запросов.');
  }

  // Запустить тесты
  runTests().catch(err => {
    console.error('❌ Ошибка при тестировании:', err);
  });
})();

