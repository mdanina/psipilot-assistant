# Исправление ошибки установки AssemblyAI

## Проблема

При выполнении `npm install` возникает ошибка:
```
npm error notarget No matching version found for assemblyai@^2.8.0
```

## Решение

Версия `2.8.0` не существует в npm registry. Используйте одну из следующих опций:

### Вариант 1: Использовать latest версию (рекомендуется)

В `package.json` измените:
```json
"assemblyai": "latest"
```

Затем выполните:
```bash
npm install
```

### Вариант 2: Использовать конкретную версию

Проверьте доступные версии:
```bash
npm view assemblyai versions
```

Или используйте последнюю стабильную версию (обычно 4.x или выше):
```json
"assemblyai": "^4.0.0"
```

### Вариант 3: Использовать альтернативный пакет

Если основной пакет не работает, можно использовать прямой HTTP API:

```bash
npm install axios
```

И обновить код для использования REST API напрямую (см. документацию AssemblyAI).

## После исправления

1. Удалите `node_modules` и `package-lock.json`:
```bash
rm -rf node_modules package-lock.json
```

2. Установите зависимости заново:
```bash
npm install
```

3. Проверьте, что установка прошла успешно

## Проверка версии

После установки проверьте установленную версию:
```bash
npm list assemblyai
```

## Дополнительная информация

- Документация AssemblyAI: https://www.assemblyai.com/docs
- npm пакет: https://www.npmjs.com/package/assemblyai







