import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Инициализация темы до рендера, чтобы избежать мигания
function initTheme() {
  const THEME_STORAGE_KEY = "theme";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  
  if (stored === "dark") {
    document.documentElement.classList.add("dark");
  } else if (stored === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    // Проверяем системные настройки
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }
  }
}

initTheme();

createRoot(document.getElementById("root")!).render(<App />);
