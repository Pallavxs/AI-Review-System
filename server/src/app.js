import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import globalErrorHandler from './controllers/errorController.js';
import healthRoutes from './routes/healthRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import configRoutes from './routes/configRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

const isDev = config.env !== 'production';

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.trim().replace(/\/+$/, '');

      // Local development origins
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)) {
        return callback(null, true);
      }

      // Check configured / default allowed origins list
      if (config.allowedOrigins && config.allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // Exact clientUrl check
      if (config.clientUrl && normalizedOrigin === config.clientUrl) {
        return callback(null, true);
      }

      // Always allow deployed Vercel production origin
      if (normalizedOrigin === 'https://dulamobiles.vercel.app') {
        return callback(null, true);
      }

      // Allow Vercel preview deployments for dulamobiles
      if (/^https:\/\/dulamobiles(-[a-z0-9-]+)?\.vercel\.app$/.test(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    optionsSuccessStatus: 204,
    maxAge: 86400,
    credentials: true,
  })
);

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

const isTest = config.env === 'test';

const getClientIp = (req) =>
  req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10_000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
  },
});

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  message: {
    success: false,
    message: 'Too many review generation requests, please try again later',
  },
});

app.use('/api/health', healthRoutes);
app.use('/api/config', apiLimiter, configRoutes);
app.use('/api/feedback', apiLimiter, (req, res, next) => {
  if (req.method === 'POST' && /\/generate-review\/?$/.test(req.path)) {
    return generateLimiter(req, res, next);
  }
  return next();
});
app.use('/api/feedback', feedbackRoutes);

// Catch unmatched /api routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Client static file serving (for unified deployments or direct port 5000 access)
const clientDistPath = path.resolve(__dirname, '../../client/dist');
const clientPath = path.resolve(__dirname, '../../client');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
} else if (fs.existsSync(clientPath)) {
  app.use(express.static(clientPath));
}

// Single-page application route fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    const indexFile = fs.existsSync(clientDistPath)
      ? path.join(clientDistPath, 'index.html')
      : path.join(clientPath, 'index.html');

    if (fs.existsSync(indexFile)) {
      return res.sendFile(indexFile);
    }
  }
  return next();
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use(globalErrorHandler);

export default app;
