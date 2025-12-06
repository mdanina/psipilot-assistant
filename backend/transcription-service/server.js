import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { transcribeRoute } from './routes/transcribe.js';
import { webhookRoute } from './routes/webhook.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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
      webhook: 'POST /api/webhook/assemblyai'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', transcribeRoute);
app.use('/api', webhookRoute);

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

