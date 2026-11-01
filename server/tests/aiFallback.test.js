import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.MONGO_URI =
  process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/ai-review-system-fallback-test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.BUSINESS_NAME = 'Dula mobiles';
process.env.GOOGLE_REVIEW_URL =
  'https://search.google.com/local/writereview?placeid=TEST_FALLBACK_PLACE_ID';
process.env.GEMINI_API_KEY = 'test_gemini_key';
delete process.env.OPENAI_API_KEY;
process.env.GROQ_API_KEY = 'test_groq_key';
process.env.AI_PRIMARY_PROVIDER = 'gemini';
process.env.AI_PROVIDER_ORDER = 'gemini,groq';
process.env.AI_FALLBACK_ENABLED = 'true';
process.env.AI_REQUEST_TIMEOUT_MS = '8000';
process.env.AI_MAX_ATTEMPTS_PER_PROVIDER = '1';

const { startTestServer, jsonRequest } = await import('./helpers/testApp.js');
const {
  __setProviderMock,
  __resetProviderMocks,
  __resetGenerateReviewSuggestionForTests,
  classifyError,
} = await import('../src/services/aiProviderService.js');
const { default: Feedback } = await import('../src/models/Feedback.js');
const { GENERATION_STATUS } = await import('../src/constants/feedbackOptions.js');
const { default: config, isProviderConfigured } = await import('../src/config/index.js');

describe('AI Multi-Provider Fallback System (Gemini -> Groq)', () => {
  let baseUrl;
  let closeServer;

  before(async () => {
    const server = await startTestServer();
    baseUrl = server.baseUrl;
    closeServer = server.close;
  });

  after(async () => {
    await closeServer();
  });

  beforeEach(async () => {
    await Feedback.deleteMany({});
    __resetProviderMocks();
    __resetGenerateReviewSuggestionForTests();
  });

  afterEach(() => {
    __resetProviderMocks();
    __resetGenerateReviewSuggestionForTests();
  });

  it('1. Gemini succeeds directly without fallback', async () => {
    let geminiCalled = false;
    let groqCalled = false;

    __setProviderMock('gemini', async () => {
      geminiCalled = true;
      return 'Dula mobiles mein achha phone mila lowest price par.';
    });
    __setProviderMock('groq', async () => {
      groqCalled = true;
      return 'Groq review should not be called';
    });

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Online se bhi kam rate mein phone mile'],
    });
    const id = created.data.data.id;

    const res = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.generatedReview, 'Dula mobiles mein achha phone mila lowest price par.');
    assert.equal(geminiCalled, true);
    assert.equal(groqCalled, false, 'Groq should not be called when Gemini succeeds');
  });

  it('2. Gemini times out (8000ms budget) and Groq succeeds', async () => {
    let geminiAttempts = 0;
    let groqAttempts = 0;

    __setProviderMock('gemini', async () => {
      geminiAttempts++;
      const err = new Error('Gemini request timed out');
      err.code = 'AI_TIMEOUT';
      throw err;
    });

    __setProviderMock('groq', async () => {
      groqAttempts++;
      return 'Anuppur mein fast mobile repairing service milti hai Dula mobiles par.';
    });

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Anuppur mein fast mobile repairing service milti hai'],
    });
    const id = created.data.data.id;

    const res = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(
      res.data.data.generatedReview,
      'Anuppur mein fast mobile repairing service milti hai Dula mobiles par.'
    );
    assert.equal(geminiAttempts, 1);
    assert.equal(groqAttempts, 1);

    const saved = await Feedback.findById(id);
    assert.equal(saved.generationStatus, GENERATION_STATUS.COMPLETED);
    assert.equal(
      saved.generatedReview,
      'Anuppur mein fast mobile repairing service milti hai Dula mobiles par.'
    );
  });

  it('3. Gemini returns unsupported-model error and Groq succeeds', async () => {
    let geminiCalled = false;
    let groqCalled = false;

    __setProviderMock('gemini', async () => {
      geminiCalled = true;
      const err = new Error('Model is no longer available to new users');
      err.status = 404;
      err.code = 'model_not_found';
      throw err;
    });

    __setProviderMock('groq', async () => {
      groqCalled = true;
      return 'Groq qwen/qwen3.8-27b successfully recovered from unsupported model.';
    });

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Online se bhi kam rate mein phone mile'],
    });
    const id = created.data.data.id;

    const res = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(
      res.data.data.generatedReview,
      'Groq qwen/qwen3.8-27b successfully recovered from unsupported model.'
    );
    assert.equal(geminiCalled, true);
    assert.equal(groqCalled, true);
  });

  it('4. Gemini authentication or quota failure triggers fallback to Groq', async () => {
    let geminiAttempts = 0;
    let groqAttempts = 0;

    __setProviderMock('gemini', async () => {
      geminiAttempts++;
      const err = new Error('Invalid API Key provided');
      err.status = 401;
      throw err;
    });

    __setProviderMock('groq', async () => {
      groqAttempts++;
      return 'Original parts available hain aur fast display repair mila.';
    });

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Original parts available hain'],
    });
    const id = created.data.data.id;

    const res = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(
      res.data.data.generatedReview,
      'Original parts available hain aur fast display repair mila.'
    );
    assert.equal(geminiAttempts, 1);
    assert.equal(groqAttempts, 1);
  });

  it('5. Groq succeeds when Gemini is unconfigured or skipped', async () => {
    const originalGeminiKey = config.geminiApiKey;
    config.geminiApiKey = '';

    let groqCalled = false;

    __setProviderMock('groq', async () => {
      groqCalled = true;
      return 'Generated by Groq fallback because Gemini was unconfigured.';
    });

    try {
      const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
        rating: 5,
        selectedOptions: ['Anuppur ki best mobile shop'],
      });
      const id = created.data.data.id;

      const res = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(
        res.data.data.generatedReview,
        'Generated by Groq fallback because Gemini was unconfigured.'
      );
      assert.equal(groqCalled, true);
    } finally {
      config.geminiApiKey = originalGeminiKey;
    }
  });

  it('6. Both providers failing returns a safe error and preserves submitted feedback', async () => {
    __setProviderMock('gemini', async () => {
      const err = new Error('Gemini quota reached');
      err.status = 429;
      throw err;
    });

    __setProviderMock('groq', async () => {
      const err = new Error('Groq 503 service unavailable');
      err.status = 503;
      throw err;
    });

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 4,
      selectedOptions: ['Phone covers reasonable rate mein milte hain'],
      comment: 'Safe error test',
    });
    const id = created.data.data.id;

    const res = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});

    assert.ok(res.status >= 400 && res.status < 600);
    assert.equal(res.data.success, false);
    assert.ok(res.data.message);
    assert.doesNotMatch(JSON.stringify(res.data), /gemini_key|groq_key|stack/i);

    const saved = await Feedback.findById(id);
    assert.ok(saved);
    assert.equal(saved.rating, 4);
    assert.equal(saved.comment, 'Safe error test');
    assert.equal(saved.generatedReview, null);
    assert.equal(saved.generationStatus, GENERATION_STATUS.FAILED);
  });

  it('7. Placeholder keys cause providers to be skipped without network calls', async () => {
    assert.equal(isProviderConfigured('openai'), false);
    assert.equal(Object.hasOwn(config, 'openaiApiKey'), false);
    assert.equal(Object.hasOwn(config, 'openaiModel'), false);
  });

  it('8. Successful fallback persists exactly one generated review', async () => {
    __setProviderMock('gemini', async () => {
      const err = new Error('429 Too Many Requests');
      err.status = 429;
      throw err;
    });
    __setProviderMock('groq', async () => {
      return 'Exactly one review generated via Groq fallback.';
    });

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Anuppur ki best mobile shop'],
    });
    const id = created.data.data.id;

    const res = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});
    assert.equal(res.status, 200);

    const saved = await Feedback.findById(id);
    assert.equal(saved.generatedReview, 'Exactly one review generated via Groq fallback.');
    assert.equal(saved.generationStatus, GENERATION_STATUS.COMPLETED);

    const count = await Feedback.countDocuments({});
    assert.equal(count, 1);
  });

  it('9. Existing review reuse and regeneration work with Groq fallback', async () => {
    let callCount = 0;
    __setProviderMock('gemini', async () => {
      throw new Error('Gemini unavailable');
    });
    __setProviderMock('groq', async () => {
      callCount++;
      return `Draft number ${callCount}`;
    });

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Original parts available hain'],
    });
    const id = created.data.data.id;

    // First call: generates draft 1 via Groq fallback
    const first = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});
    assert.equal(first.status, 200);
    assert.equal(first.data.data.generatedReview, 'Draft number 1');
    assert.equal(first.data.data.reused, false);
    assert.equal(callCount, 1);

    // Second call without regenerate: REUSES draft 1 without calling any provider
    const second = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {});
    assert.equal(second.status, 200);
    assert.equal(second.data.data.generatedReview, 'Draft number 1');
    assert.equal(second.data.data.reused, true);
    assert.equal(callCount, 1, 'Should NOT call AI again when reusing');

    // Third call with regenerate: true -> generates fresh draft 2
    const third = await jsonRequest(baseUrl, 'POST', `/api/feedback/${id}/generate-review`, {
      regenerate: true,
    });
    assert.equal(third.status, 200);
    assert.equal(third.data.data.generatedReview, 'Draft number 2');
    assert.equal(third.data.data.reused, false);
    assert.equal(callCount, 2);
  });

  it('10. No OpenAI provider or configuration remains in the active architecture', async () => {
    assert.deepEqual(config.providerOrder, ['gemini', 'groq']);
    assert.equal(isProviderConfigured('openai'), false);

    const health = await jsonRequest(baseUrl, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.data.data.configuredProviders, ['gemini', 'groq']);
    assert.ok(!health.data.data.configuredProviders.includes('openai'));
  });

  it('11. API keys are never exposed in public endpoints or logs', async () => {
    const res = await jsonRequest(baseUrl, 'GET', '/api/config');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);

    const payload = JSON.stringify(res.data);
    assert.doesNotMatch(payload, /test_gemini_key/i);
    assert.doesNotMatch(payload, /test_groq_key/i);
    assert.doesNotMatch(payload, /api[_-]?key/i);
    assert.equal(Object.hasOwn(res.data.data, 'geminiApiKey'), false);
    assert.equal(Object.hasOwn(res.data.data, 'groqApiKey'), false);
  });

  it('12. Standardized error classifications properly handle quotas, timeouts, and unavailabilities', () => {
    // 1. Quota Exhaustion
    const quotaErr = classifyError(
      {
        status: 429,
        error: { code: 'credit_balance_exhausted', type: 'insufficient_quota' },
        message: '429 You have no credits remaining.',
      },
      'Provider'
    );
    assert.equal(quotaErr.category, 'QUOTA_EXHAUSTED');
    assert.equal(quotaErr.code, 'AI_QUOTA_EXHAUSTED');
    assert.equal(quotaErr.retryableOnSameProvider, false);

    // 2. Ordinary Rate Limit
    const rateLimitErr = classifyError(
      {
        status: 429,
        error: { code: 'rate_limit_exceeded', type: 'requests' },
        message: '429 Rate limit reached for requests.',
      },
      'Provider'
    );
    assert.equal(rateLimitErr.category, 'RATE_LIMIT');
    assert.equal(rateLimitErr.code, 'AI_RATE_LIMIT');
    assert.equal(rateLimitErr.retryableOnSameProvider, false);

    // 3. Unsupported Model (HTTP 404)
    const modelErr = classifyError(
      {
        status: 404,
        error: { code: 'model_not_found', type: 'invalid_request_error' },
        message: 'The model `llama-3.3-70b-versatile` does not exist.',
      },
      'Groq'
    );
    assert.equal(modelErr.category, 'UNSUPPORTED_MODEL');
    assert.equal(modelErr.code, 'AI_UNSUPPORTED_MODEL');
    assert.equal(modelErr.retryableOnSameProvider, false);

    // 4. Timeout
    const timeoutErr = classifyError(
      {
        code: 'AI_TIMEOUT',
        message: 'Gemini request timed out',
      },
      'Gemini'
    );
    assert.equal(timeoutErr.category, 'TIMEOUT');
    assert.equal(timeoutErr.code, 'AI_TIMEOUT');
    assert.equal(timeoutErr.statusCode, 504);
  });
});
