import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { transcribeRoute } from './routes/transcribe.js';
import { webhookRoute } from './routes/webhook.js';
import { aiRoute } from './routes/ai.js';
import { cryptoRoute } from './routes/crypto.js';
import { verifyAuthToken } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// CORS Configuration - Security
// ============================================
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000']; // Default dev origins

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (!origin) {
      return callback(new Error('CORS: Origin required in production'), false);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`CORS blocked request from origin: ${origin}`);
    return callback(new Error('CORS: Origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
};

// ============================================
// Rate Limiting - Security
// ============================================

// General rate limiter for all API endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for AI generation endpoints (expensive operations)
const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 AI generations per hour
  message: { success: false, error: 'AI generation rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip, // Rate limit by user ID if authenticated
});

// Strict rate limiter for transcription endpoints (expensive operations)
const transcriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 transcriptions per hour
  message: { success: false, error: 'Transcription rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Crypto operations limiter - увеличен лимит для batch операций
const cryptoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // 500 crypto operations per minute (увеличено для batch расшифровки)
  message: { success: false, error: 'Crypto rate limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Устанавливаем правильную кодировку для JSON ответов
app.use((req, res, next) => {
  // Устанавливаем charset=utf-8 для всех JSON ответов
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Transcription Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      transcribe: 'POST /api/transcribe',
      status: 'GET /api/transcribe/:recordingId/status',
      sync: 'POST /api/transcribe/:recordingId/sync',
      webhook: 'POST /api/webhook/assemblyai',
      ai: {
        blockTemplates: 'GET /api/ai/block-templates',
        noteTemplates: 'GET /api/ai/note-templates',
        generate: 'POST /api/ai/generate',
        status: 'GET /api/ai/generate/:clinicalNoteId/status',
        regenerateSection: 'POST /api/ai/regenerate-section/:sectionId',
        caseSummary: 'POST /api/ai/case-summary',
        patientCaseSummary: 'POST /api/ai/patient-case-summary'
      },
      crypto: {
        encrypt: 'POST /api/crypto/encrypt',
        decrypt: 'POST /api/crypto/decrypt',
        status: 'GET /api/crypto/status'
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes with specific rate limits for expensive operations

// Transcription routes (POST /api/transcribe has expensive rate limit)
app.post('/api/transcribe', transcriptionLimiter);
app.use('/api', transcribeRoute);

// Webhook routes (no rate limit - called by external services)
app.use('/api', webhookRoute);

// AI routes с аутентификацией и rate limiting
// Strict limits on generation endpoints
app.post('/api/ai/generate', aiGenerationLimiter);
app.post('/api/ai/regenerate-section/:sectionId', aiGenerationLimiter);
app.post('/api/ai/case-summary', aiGenerationLimiter);
app.post('/api/ai/patient-case-summary', aiGenerationLimiter);
app.use('/api/ai', verifyAuthToken, aiRoute);

// Crypto routes с аутентификацией и rate limiting
app.use('/api/crypto', cryptoLimiter, verifyAuthToken, cryptoRoute);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Transcription service running on port ${PORT}`);
});

