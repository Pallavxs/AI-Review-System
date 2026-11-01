import dotenv from 'dotenv';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const required = ['MONGO_URI'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `${key} is required. Copy server/.env.example to server/.env and fill in values.`
    );
  }
}

function sanitizeApiKey(val) {
  const raw = (val || '').trim();
  if (
    !raw ||
    raw.toLowerCase().startsWith('your_') ||
    raw.toLowerCase().includes('placeholder')
  ) {
    return '';
  }
  return raw;
}

const geminiApiKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
const groqApiKey = sanitizeApiKey(process.env.GROQ_API_KEY);

const rawGoogleReviewUrl = (process.env.GOOGLE_REVIEW_URL || '').trim();
const googleReviewUrl =
  !rawGoogleReviewUrl ||
  rawGoogleReviewUrl.includes('YOUR_PLACE_ID') ||
  rawGoogleReviewUrl.toLowerCase().includes('your_')
    ? ''
    : rawGoogleReviewUrl;

const primaryProvider = (process.env.AI_PRIMARY_PROVIDER || 'gemini').trim().toLowerCase();

const rawOrder = process.env.AI_PROVIDER_ORDER
  ? process.env.AI_PROVIDER_ORDER.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)
  : ['gemini', 'groq'];

const providerOrder = [
  primaryProvider,
  ...rawOrder.filter((p) => p !== primaryProvider),
];

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  publicFeedbackUrl:
    process.env.PUBLIC_FEEDBACK_URL || process.env.CLIENT_URL || 'http://localhost:5173',
  businessName: process.env.BUSINESS_NAME || 'Dula mobiles',
  businessLocation: process.env.BUSINESS_LOCATION || 'Anuppur, Madhya Pradesh',
  businessLogoUrl: process.env.BUSINESS_LOGO_URL || '',
  googleReviewUrl,

  // Multi-Provider AI Fallback Configuration (Gemini -> Groq)
  primaryProvider,
  providerOrder,
  fallbackEnabled: process.env.AI_FALLBACK_ENABLED !== 'false',
  timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || process.env.GEMINI_TIMEOUT_MS) || 8000,
  maxAttemptsPerProvider: Math.max(1, Number(process.env.AI_MAX_ATTEMPTS_PER_PROVIDER) || 1),

  // Gemini (Primary)
  geminiApiKey,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',

  // Groq (Fallback)
  groqApiKey,
  groqModel: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
};

export function isProviderConfigured(providerName) {
  const norm = (providerName || '').toLowerCase();
  if (norm === 'gemini') return Boolean(config.geminiApiKey);
  if (norm === 'groq') return Boolean(config.groqApiKey);
  return false;
}

if (config.env !== 'test') {
  const hasAnyKey = Boolean(config.geminiApiKey || config.groqApiKey);
  if (!hasAnyKey) {
    console.warn(
      '[config] No AI provider API keys configured — review generation will fail until an API key is set.'
    );
  } else if (!config.geminiApiKey && config.primaryProvider === 'gemini') {
    console.warn(
      '[config] GEMINI_API_KEY is not configured; fallback provider (groq) will be attempted if configured.'
    );
  }
  if (!config.googleReviewUrl) {
    console.warn(
      '[config] GOOGLE_REVIEW_URL is missing or still a placeholder — set a real Google review write URL.'
    );
  }
}

export default config;
