import { Router } from 'express';
import mongoose from 'mongoose';
import config, { isProviderConfigured } from '../config/index.js';

const router = Router();

/**
 * GET /api/health
 * Lightweight liveness + MongoDB connectivity check + AI provider readiness.
 */
router.get('/', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const dbStatus =
    dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';

  const healthy = dbState === 1;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'OK' : 'Degraded',
    data: {
      service: 'smart-ai-google-review',
      env: config.env,
      mongodb: dbStatus,
      geminiConfigured: isProviderConfigured('gemini'),
      geminiModel: config.geminiModel,
      primaryProvider: config.primaryProvider,
      fallbackEnabled: config.fallbackEnabled,
      configuredProviders: ['gemini', 'groq'].filter((p) =>
        isProviderConfigured(p)
      ),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
