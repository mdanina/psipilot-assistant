# PsiPilot Telegram Bot
FROM node:20-alpine

WORKDIR /app

# Копирование package files
COPY package*.json ./

# Установка зависимостей
RUN npm install --omit=dev

# Копирование исходного кода
COPY src ./src

# Запуск бота
CMD ["node", "src/index.js"]
