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
}));
