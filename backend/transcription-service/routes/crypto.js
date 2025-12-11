import express from 'express';
import { encrypt, decrypt, isEncryptionConfigured } from '../services/encryption.js';

const router = express.Router();

/**
 * POST /api/crypto/encrypt
 * Шифрует данные с использованием серверного ключа
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

    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Encryption is not configured on the server',
      });
    }

    // Поддержка массива данных для batch операций
    if (Array.isArray(data)) {
      const encrypted = data.map((item) => (item ? encrypt(item) : ''));
      return res.json({ success: true, data: { encrypted } });
    }

    const encrypted = encrypt(data);
    res.json({ success: true, data: { encrypted } });
  } catch (error) {
    console.error('Encryption error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to encrypt data',
    });
  }
});

/**
 * POST /api/crypto/decrypt
 * Расшифровывает данные
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

    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Encryption is not configured on the server',
      });
    }

    // Поддержка массива данных для batch операций
    if (Array.isArray(data)) {
      const decrypted = data.map((item) => {
        if (!item) return '';
        try {
          return decrypt(item);
        } catch {
          return '[Ошибка расшифровки]';
        }
      });
      return res.json({ success: true, data: { decrypted } });
    }

    const decrypted = decrypt(data);
    res.json({ success: true, data: { decrypted } });
  } catch (error) {
    console.error('Decryption error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to decrypt data',
    });
  }
});

/**
 * GET /api/crypto/status
 * Проверяет статус шифрования
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: isEncryptionConfigured(),
    },
  });
});

export { router as cryptoRoute };
