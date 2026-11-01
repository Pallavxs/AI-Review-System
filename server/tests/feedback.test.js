import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// Env must be set before config/app modules load
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.MONGO_URI =
  process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/ai-review-system-test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.BUSINESS_NAME = 'Test Cafe';
process.env.GOOGLE_REVIEW_URL =
  'https://search.google.com/local/writereview?placeid=TEST_PLACE_ID';
process.env.GEMINI_API_KEY = '';
process.env.GEMINI_MODEL = 'gemini-2.0-flash';

const { startTestServer, jsonRequest } = await import('./helpers/testApp.js');
const {
  __setGenerateReviewSuggestionForTests,
  __resetGenerateReviewSuggestionForTests,
} = await import('../src/services/geminiService.js');
const { default: Feedback } = await import('../src/models/Feedback.js');
const { GENERATION_STATUS } = await import('../src/constants/feedbackOptions.js');

describe('Feedback API (Phase 2)', () => {
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
    __resetGenerateReviewSuggestionForTests();
  });

  afterEach(() => {
    __resetGenerateReviewSuggestionForTests();
  });

  it('submits valid feedback and returns 201 with id (no Gemini call)', async () => {
    let geminiCalled = false;
    __setGenerateReviewSuggestionForTests(async () => {
      geminiCalled = true;
      return 'should not run';
    });

    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Friendly staff', 'Good service'],
      comment: 'Great visit',
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.id);
    assert.equal(res.data.data.rating, 5);
    assert.deepEqual(res.data.data.selectedOptions, ['Friendly staff', 'Good service']);
    assert.equal(res.data.data.comment, 'Great visit');
    assert.equal(res.data.data.generationStatus, GENERATION_STATUS.IDLE);
    assert.equal(geminiCalled, false);

    const saved = await Feedback.findById(res.data.data.id);
    assert.ok(saved);
    assert.equal(saved.generatedReview, null);
  });

  it('rejects invalid rating', async () => {
    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 6,
      selectedOptions: [],
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
    assert.match(res.data.message, /rating/i);
  });

  it('rejects coerced string rating', async () => {
    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: '5',
      selectedOptions: [],
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
  });

  it('rejects unknown feedback option', async () => {
    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 4,
      selectedOptions: ['Free dessert'],
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /Unknown feedback option/i);
  });

  it('rejects invalid comment type', async () => {
    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 3,
      comment: 12345,
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /comment/i);
  });

  it('rejects oversized comment', async () => {
    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 3,
      comment: 'x'.repeat(1001),
    });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /1000/i);
  });

  it('rejects unexpected request properties', async () => {
    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: [],
      hackerField: true,
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
  });

  it('rejects malformed ObjectId for generate-review', async () => {
    const res = await jsonRequest(
      baseUrl,
      'POST',
      '/api/feedback/not-a-valid-id/generate-review',
      {}
    );
    assert.equal(res.status, 400);
    assert.match(res.data.message, /Invalid feedback id/i);
  });

  it('returns 404 when feedback is not found', async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${missingId}/generate-review`,
      {}
    );
    assert.equal(res.status, 404);
    assert.match(res.data.message, /not found/i);
  });

  it('keeps feedback when Gemini generation fails', async () => {
    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 2,
      selectedOptions: ['Product quality'],
      comment: 'Could be better',
    });
    const id = created.data.data.id;

    __setGenerateReviewSuggestionForTests(async () => {
      const err = new Error('provider boom with key sk-secret');
      err.code = 'GEMINI_FAILURE';
      throw err;
    });

    const res = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      {}
    );

    assert.equal(res.status, 502);
    assert.equal(res.data.success, false);
    assert.equal(res.data.code, 'GEMINI_FAILURE');
    assert.doesNotMatch(JSON.stringify(res.data), /sk-secret|provider boom/i);

    const saved = await Feedback.findById(id);
    assert.ok(saved);
    assert.equal(saved.rating, 2);
    assert.equal(saved.comment, 'Could be better');
    assert.equal(saved.generatedReview, null);
    assert.equal(saved.generationStatus, GENERATION_STATUS.FAILED);
  });

  it('persists a successful generated review separately', async () => {
    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Clean environment'],
      comment: 'Loved it',
    });
    const id = created.data.data.id;

    __setGenerateReviewSuggestionForTests(async (feedback) => {
      assert.equal(feedback.rating, 5);
      assert.deepEqual(feedback.selectedOptions, ['Clean environment']);
      return 'I loved the clean environment here.';
    });

    const res = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      {}
    );

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.generatedReview, 'I loved the clean environment here.');
    assert.equal(res.data.data.generationStatus, GENERATION_STATUS.COMPLETED);
    assert.equal(res.data.data.reused, false);
    assert.ok(res.data.data.googleReviewUrl);

    const saved = await Feedback.findById(id);
    assert.equal(saved.comment, 'Loved it');
    assert.equal(saved.generatedReview, 'I loved the clean environment here.');
    assert.equal(saved.generationStatus, GENERATION_STATUS.COMPLETED);
  });

  it('reuses an existing generated review without calling Gemini again', async () => {
    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 4,
      selectedOptions: ['Quick response'],
    });
    const id = created.data.data.id;

    let calls = 0;
    __setGenerateReviewSuggestionForTests(async () => {
      calls += 1;
      return 'Quick and helpful response.';
    });

    const first = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      {}
    );
    const second = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      {}
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.data.data.reused, true);
    assert.equal(calls, 1);
  });

  it('regenerates a fresh review draft when regenerate: true is passed', async () => {
    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: ['Friendly staff'],
      comment: 'Super visit',
    });
    const id = created.data.data.id;

    let calls = 0;
    __setGenerateReviewSuggestionForTests(async () => {
      calls += 1;
      return `Draft version ${calls}`;
    });

    const first = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      {}
    );
    assert.equal(first.status, 200);
    assert.equal(first.data.data.generatedReview, 'Draft version 1');
    assert.equal(first.data.data.reused, false);
    assert.equal(calls, 1);

    // Call with regenerate: true
    const regen = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      { regenerate: true }
    );
    assert.equal(regen.status, 200);
    assert.equal(regen.data.data.generatedReview, 'Draft version 2');
    assert.equal(regen.data.data.reused, false);
    assert.equal(calls, 2);

    const saved = await Feedback.findById(id);
    assert.equal(saved.generatedReview, 'Draft version 2');
  });

  it('rejects unexpected fields in generate-review body', async () => {
    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 4,
      selectedOptions: [],
    });
    const id = created.data.data.id;

    const res = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      { extraField: true }
    );
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
  });

  it('rejects invalid type for regenerate in generate-review body', async () => {
    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 4,
      selectedOptions: [],
    });
    const id = created.data.data.id;

    const res = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      { regenerate: 'true' }
    );
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
  });

  it('excludes API keys from public /api/config', async () => {
    const res = await jsonRequest(baseUrl, 'GET', '/api/config');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.businessName);
    assert.equal(Object.hasOwn(res.data.data, 'geminiApiKey'), false);
    assert.equal(Object.hasOwn(res.data.data, 'apiKey'), false);
    assert.doesNotMatch(JSON.stringify(res.data), /GEMINI|api[_-]?key/i);
  });

  it('returns feedbackOptions in public /api/config', async () => {
    const res = await jsonRequest(baseUrl, 'GET', '/api/config');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data.feedbackOptions));
    assert.ok(res.data.data.feedbackOptions.includes('Friendly staff'));
    assert.ok(res.data.data.feedbackOptions.includes('Good service'));
  });

  it('returns feedbackCategories in public /api/config with 3 mobile shop categories', async () => {
    const res = await jsonRequest(baseUrl, 'GET', '/api/config');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data.feedbackCategories));
    assert.equal(res.data.data.feedbackCategories.length, 3);

    const names = res.data.data.feedbackCategories.map((c) => c.name);
    assert.deepEqual(names, ['Mobile Phones', 'Mobile Accessories', 'Mobile Repairing']);

    const phonesCat = res.data.data.feedbackCategories.find((c) => c.name === 'Mobile Phones');
    assert.equal(phonesCat.options.length, 4);
    assert.ok(phonesCat.options.includes('Online se bhi kam rate mein phone mile'));
    assert.ok(phonesCat.options.includes('Achhi quality ke saath sabhi tarah ke phones available hain'));
    assert.ok(phonesCat.options.includes('Anuppur ki best mobile shop'));
    assert.ok(phonesCat.options.includes('Anuppur mein sabse kam rate par phones milte hain'));

    const accCat = res.data.data.feedbackCategories.find((c) => c.name === 'Mobile Accessories');
    assert.equal(accCat.options.length, 4);
    assert.ok(accCat.options.includes('Original mobile accessories milte hain'));
    assert.ok(accCat.options.includes('Premium quality ke phone covers milte hain'));
    assert.ok(accCat.options.includes('Phone covers reasonable rate mein milte hain'));
    assert.ok(accCat.options.includes('Anuppur mein mobile accessories ki best variety hai'));

    const repairCat = res.data.data.feedbackCategories.find((c) => c.name === 'Mobile Repairing');
    assert.equal(repairCat.options.length, 4);
    assert.ok(repairCat.options.includes('Kam rate mein achhi mobile repairing hoti hai'));
    assert.ok(repairCat.options.includes('Original parts available hain'));
    assert.ok(repairCat.options.includes('Anuppur mein original mobile displays milte hain'));
    assert.ok(repairCat.options.includes('Anuppur mein fast mobile repairing service milti hai'));
  });

  it('submits feedback with Hinglish mobile shop options from multiple categories', async () => {
    const hinglishOptions = [
      'Online se bhi kam rate mein phone mile',
      'Original mobile accessories milte hain',
      'Anuppur mein fast mobile repairing service milti hai',
    ];

    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: hinglishOptions,
      comment: 'Bohot badiya service Anuppur mein',
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.deepEqual(res.data.data.selectedOptions, hinglishOptions);
    assert.equal(res.data.data.comment, 'Bohot badiya service Anuppur mein');
  });

  it('generates a natural Hinglish review incorporating selected Hinglish options', async () => {
    const hinglishOptions = [
      'Anuppur ki best mobile shop',
      'Original parts available hain',
    ];

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: hinglishOptions,
      comment: 'Display jaldi repair ho gaya',
    });
    const id = created.data.data.id;

    let receivedOptions = null;
    __setGenerateReviewSuggestionForTests(async (feedback) => {
      receivedOptions = feedback.selectedOptions;
      return 'Dula mobiles Anuppur ki best shop hai aur yahan original parts ke sath fast display repair hua.';
    });

    const res = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      {}
    );

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.deepEqual(receivedOptions, hinglishOptions);
    assert.equal(
      res.data.data.generatedReview,
      'Dula mobiles Anuppur ki best shop hai aur yahan original parts ke sath fast display repair hua.'
    );
  });

  it('submits legacy English feedback options successfully for backward compatibility', async () => {
    const legacyOptions = [
      'Phones at prices lower than online stores',
      'Original mobile accessories',
      'Friendly staff',
    ];

    const res = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: legacyOptions,
      comment: 'Legacy format submission',
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.deepEqual(res.data.data.selectedOptions, legacyOptions);
  });

  it('preserves reviews longer than 10 words completely without word limit or truncation', async () => {
    const longReviewText =
      'I visited Dula mobiles in Anuppur to buy a new smartphone and get my cracked display repaired. ' +
      'Their prices are genuinely lower than online stores, and they used original replacement parts with fast, friendly service. ' +
      'I am completely satisfied with the quality and recommend them to everyone in Anuppur!';

    // Verify test input itself is substantially longer than 10 words (47 words)
    const wordCount = longReviewText.split(/\s+/).filter(Boolean).length;
    assert.ok(wordCount > 10, `Expected wordCount > 10, got ${wordCount}`);

    const created = await jsonRequest(baseUrl, 'POST', '/api/feedback', {
      rating: 5,
      selectedOptions: [
        'Phones at prices lower than online stores',
        'Original replacement parts available',
        'Fast mobile repair service in Anuppur',
      ],
      comment: 'Replaced my display and purchased a phone',
    });
    const id = created.data.data.id;

    __setGenerateReviewSuggestionForTests(async () => {
      return longReviewText;
    });

    const res = await jsonRequest(
      baseUrl,
      'POST',
      `/api/feedback/${id}/generate-review`,
      {}
    );

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    // Verifies full text is returned without any truncation
    assert.equal(res.data.data.generatedReview, longReviewText);
    assert.equal(res.data.data.generatedReview.split(/\s+/).filter(Boolean).length, wordCount);

    // Verifies database persisted the entire review without truncation
    const saved = await Feedback.findById(id);
    assert.equal(saved.generatedReview, longReviewText);
    assert.equal(saved.generatedReview.length, longReviewText.length);
  });

  it('health check reports mongodb without leaking secrets', async () => {
    const res = await jsonRequest(baseUrl, 'GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.data.mongodb, 'connected');
    assert.equal(typeof res.data.data.geminiConfigured, 'boolean');
    assert.doesNotMatch(JSON.stringify(res.data), /mongodb:\/\/|apiKey|sk-/i);
  });
});
