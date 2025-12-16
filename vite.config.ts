import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "mammoth": path.resolve(__dirname, "./node_modules/mammoth/mammoth.browser.js"),
    },
  },
  optimizeDeps: {
    include: ['mammoth', 'pdfjs-dist'],
  },
  build: {
    // Оптимизация размера бандла
    rollupOptions: {
      output: {
        /**
         * Manual chunks для оптимизации загрузки
         *
         * Разделяем тяжёлые библиотеки в отдельные чанки:
         * - vendor-pdf: pdfjs-dist (~1.2MB) - загружается только при просмотре PDF
         * - vendor-charts: recharts - загружается только на страницах с графиками
         * - vendor-dnd: drag-n-drop - загружается только при необходимости
         * - vendor-ui: Radix UI компоненты - общие UI элементы
         */
        manualChunks: {
          // Тяжёлые библиотеки для работы с файлами
          'vendor-pdf': ['pdfjs-dist'],
          'vendor-docx': ['mammoth'],

          // Графики (используются на ограниченных страницах)
          'vendor-charts': ['recharts'],

          // Drag and Drop
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],

          // Radix UI - группируем по частоте использования
          'vendor-ui-dialogs': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-popover',
          ],
          'vendor-ui-menus': [
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-menubar',
          ],
          'vendor-ui-forms': [
            '@radix-ui/react-checkbox',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-select',
            '@radix-ui/react-switch',
            '@radix-ui/react-slider',
          ],

          // React Query и Supabase
          'vendor-data': ['@tanstack/react-query', '@supabase/supabase-js'],

          // Утилиты
          'vendor-utils': ['date-fns', 'clsx', 'tailwind-merge', 'zod'],
        },
      },
    },
    // Увеличиваем лимит предупреждений для чанков
    chunkSizeWarningLimit: 1000, // 1MB
  },
}));
