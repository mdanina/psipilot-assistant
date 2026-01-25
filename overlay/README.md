# PsiPilot Overlay

Desktop-приложение для записи заметок поверх видеозвонков (Zoom, Meet, Teams).

## Технологии

- **Tauri 2.0** — легковесный desktop framework (~15MB)
- **React** — UI (переиспользуем компоненты из основного приложения)
- **Supabase** — тот же backend что и веб-версия

## Структура

```
overlay/
├── src/                    # React frontend
│   ├── components/         # UI компоненты
│   ├── hooks/              # React hooks
│   ├── lib/                # Утилиты (копируем из основного проекта)
│   └── App.tsx
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── audio.rs        # Захват аудио
│   │   └── window.rs       # Управление окном
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── README.md
```

## Установка для разработки

```bash
# Установить Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Установить Tauri CLI
npm install -g @tauri-apps/cli

# Установить зависимости
cd overlay
npm install

# Запустить в dev режиме
npm run tauri dev
```

## Сборка

```bash
npm run tauri build
```

## Безопасность

- Токены хранятся в системном Keychain/Credential Manager
- Локальные данные шифруются
- Certificate pinning для API запросов
- Device binding для сессий
