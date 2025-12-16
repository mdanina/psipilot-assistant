import express from 'express';
import { encrypt, decrypt, isEncryptionConfigured } from '../services/encryption.js';

const router = express.Router();

/**
 * POST /api/crypto/encrypt
 * Шифрует данные с использованием серверного ключа
 *
 * Body: { data: string } или { data: string[] }
 * Response: { success: true, data: { encrypted: string | string[] } }
 */
router.post('/encrypt', async (req, res) => {
  try {
    const { data } = req.body;

    if (data === undefined || data === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: data',
      });
    }

    // Обработка массива данных для batch шифрования
    if (Array.isArray(data)) {
      const encrypted = data.map((item) => {
        if (typeof item !== 'string') {
          throw new Error('Each item in array must be a string');
        }
        return item ? encrypt(item) : '';
      });

      return res.json({
        success: true,
        data: { encrypted },
      });
    }

    // Обработка одиночного значения
    if (typeof data !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Data must be a string or array of strings',
      });
    }

    const encrypted = data ? encrypt(data) : '';

    res.json({
      success: true,
      data: { encrypted },
    });
  } catch (error) {
    console.error('Encryption API error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Encryption failed',
    });
  }
});

/**
 * POST /api/crypto/decrypt
 * Расшифровывает данные с использованием серверного ключа
 *
 * Body: { data: string } или { data: string[] }
 * Response: { success: true, data: { decrypted: string | string[] } }
 */
router.post('/decrypt', async (req, res) => {
  try {
    const { data } = req.body;

    if (data === undefined || data === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: data',
      });
    }

    // Обработка массива данных для batch расшифровки
    if (Array.isArray(data)) {
      const decrypted = [];
      const errors = [];
      
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        
        // Пропускаем не-строки и пустые значения
        if (typeof item !== 'string') {
          console.warn(`[Batch decrypt] Item ${i} is not a string, skipping`);
          decrypted.push('');
          errors.push({ index: i, error: 'Not a string' });
          continue;
        }
        
        if (!item) {
          decrypted.push('');
          continue;
        }
        
        // Пытаемся расшифровать каждый элемент отдельно
        try {
          console.log(`[Batch decrypt] Attempting to decrypt item ${i}, length: ${item?.length || 0}, preview: ${item?.substring(0, 50) || 'N/A'}...`);
          const result = decrypt(item);
          console.log(`[Batch decrypt] Successfully decrypted item ${i}, result length: ${result?.length || 0}, result: "${result?.substring(0, 50) || ''}..."`);
          decrypted.push(result);
        } catch (error) {
          // Логируем ошибку, но не падаем - возвращаем пустую строку для проблемного элемента
          const errorMsg = error.message || 'Unknown decryption error';
          console.error(`[Batch decrypt] Failed to decrypt item ${i}:`, errorMsg, error);
          decrypted.push(''); // Возвращаем пустую строку для нерасшифрованных элементов
          errors.push({ index: i, error: errorMsg });
        }
      }
      
      // Если были ошибки, возвращаем предупреждение, но не падаем
      if (errors.length > 0) {
        console.warn(`[Batch decrypt] ${errors.length} out of ${data.length} items failed to decrypt`);
      }

      return res.json({
        success: true,
        data: { decrypted },
        ...(errors.length > 0 && { warnings: { failedCount: errors.length, errors } }),
      });
    }

    // Обработка одиночного значения
    if (typeof data !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Data must be a string or array of strings',
      });
    }

    const decrypted = data ? decrypt(data) : '';

    res.json({
      success: true,
      data: { decrypted },
    });
  } catch (error) {
    console.error('Decryption API error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Decryption failed',
    });
  }
});

/**
 * GET /api/crypto/status
 * Проверяет, настроено ли шифрование на сервере
 *
 * Response: { success: true, data: { configured: boolean } }
 */
router.get('/status', (req, res) => {
  try {
    const configured = isEncryptionConfigured();
    res.json({
      success: true,
      data: { configured },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check encryption status',
    });
  }
});

export { router as cryptoRoute };
