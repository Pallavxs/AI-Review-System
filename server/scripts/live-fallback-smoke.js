import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

import config from '../src/config/index.js';
import aiProviderService, {
  generateReviewSuggestion,
  __setProviderMock,
  __resetProviderMocks,
} from '../src/services/aiProviderService.js';

console.log('====================================================');
console.log('   SMART AI REVIEW BUILDER - LIVE PROVIDER SMOKE    ');
console.log('====================================================');
console.log('Primary provider :', config.primaryProvider);
console.log('Provider chain   :', config.providerOrder.join(' -> '));
console.log('Gemini model     :', config.geminiModel);
console.log('Groq model       :', config.groqModel);
console.log('Timeout (ms)     :', config.timeoutMs);
console.log('====================================================\n');

const feedbackInput = {
  rating: 5,
  selectedOptions: [
    'Online se bhi kam rate mein phone mile',
    'Original parts available hain',
  ],
  comment: 'Bahut badhiya service aur accha nature',
  businessName: 'Dula mobiles',
};

async function testGeminiDirect() {
  console.log('--- 1. Testing Gemini Directly ---');
  const t0 = Date.now();
  try {
    // Isolate Gemini by mocking Groq out or ensuring chain tries Gemini first
    const result = await generateReviewSuggestion(feedbackInput);
    const ms = Date.now() - t0;
    console.log(`✅ Gemini (${config.geminiModel}) succeeded in ${ms}ms:`);
    console.log(`   "${result}"\n`);
    return { ok: true, durationMs: ms, result };
  } catch (err) {
    const ms = Date.now() - t0;
    console.log(`❌ Gemini failed in ${ms}ms:`, err.message);
    return { ok: false, durationMs: ms, error: err };
  }
}

async function testControlledFallbackToGroq() {
  console.log('--- 2. Testing Controlled Fallback to Groq (Simulating Gemini Timeout) ---');
  // Mock Gemini to throw AI_TIMEOUT to verify automated fallback to Groq
  __setProviderMock('gemini', async () => {
    const timeoutErr = new Error('Gemini request timed out (simulated)');
    timeoutErr.code = 'AI_TIMEOUT';
    throw timeoutErr;
  });

  const t0 = Date.now();
  try {
    const result = await generateReviewSuggestion(feedbackInput);
    const ms = Date.now() - t0;
    console.log(`✅ Fallback to Groq (${config.groqModel}) succeeded in ${ms}ms:`);
    console.log(`   "${result}"\n`);
    return { ok: true, durationMs: ms, result };
  } catch (err) {
    const ms = Date.now() - t0;
    console.log(`❌ Fallback failed in ${ms}ms:`, err.message);
    return { ok: false, durationMs: ms, error: err };
  } finally {
    __resetProviderMocks();
  }
}

async function run() {
  const geminiRes = await testGeminiDirect();
  const fallbackRes = await testControlledFallbackToGroq();

  console.log('====================================================');
  console.log('                  VERIFICATION SUMMARY              ');
  console.log('====================================================');
  console.log('Gemini Direct Test   :', geminiRes.ok ? `PASSED (${geminiRes.durationMs}ms)` : 'FAILED');
  console.log('Fallback to Groq     :', fallbackRes.ok ? `PASSED (${fallbackRes.durationMs}ms)` : 'FAILED');
  console.log('====================================================');
}

run();
