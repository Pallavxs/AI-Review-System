import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import config, { isProviderConfigured } from '../config/index.js';

/**
 * Test seams for unit testing without live API keys.
 */
let globalTestMock = null;
const providerTestMocks = new Map();

export function __setGenerateReviewSuggestionForTests(fn) {
  globalTestMock = fn;
}

export function __resetGenerateReviewSuggestionForTests() {
  globalTestMock = null;
  providerTestMocks.clear();
}

export function __setProviderMock(providerName, fn) {
  providerTestMocks.set((providerName || '').toLowerCase(), fn);
}

export function __resetProviderMocks() {
  providerTestMocks.clear();
}

/**
 * Builds consistent prompt instructions across all AI providers.
 */
export function buildReviewPrompt({
  rating,
  selectedOptions = [],
  options = [],
  comment = '',
  businessName = config.businessName,
}) {
  const chosenOptions = Array.isArray(selectedOptions) && selectedOptions.length
    ? selectedOptions.filter(Boolean)
    : Array.isArray(options)
      ? options.filter(Boolean)
      : [];
  const cleanComment = (comment || '').trim();

  return [
    'You write a short, authentic Google review draft that a customer can edit and post.',
    'Rules:',
    '- Write in first person as the customer (e.g. "I bought...", "They repaired...", "Maine phone liya...", "Achhi service mili...").',
    '- Language: When selected feedback options or comment are in Hinglish (Hindi written in Roman/English alphabet), compose the review draft in authentic, natural Hinglish matching the customer\'s everyday tone. If inputs are primarily in English, write in natural English.',
    '- Use ONLY the customer rating, selected feedback options, and optional comment below.',
    '- Never invent visits, unselected services, specific product models, staff names, or experiences that the customer did not choose.',
    '- Combine multiple selected options into smooth, cohesive sentences. Avoid awkward repetition or repeating the city name (e.g. Anuppur) multiple times.',
    "- Preserve the customer's rating and sentiment accurately. Do not artificially praise or soften a low rating.",
    '- Keep the review concise, natural, and helpful (2–4 sentences). No hashtags, no quotation marks, no preamble.',
    '- Output ONLY the plain review text.',
    '',
    `Business name: ${businessName}`,
    `Customer rating: ${rating}/5`,
    `Selected feedback options: ${chosenOptions.length ? chosenOptions.join(', ') : '(none)'}`,
    `Customer comment: ${cleanComment || '(none)'}`,
  ].join('\n');
}

/**
 * Standardized error classification across all providers.
 * Distinguishes rate limiting from exhausted quota/billing restrictions,
 * unsupported models, authentication, and transient server errors.
 * Never leaks API keys, secrets, or raw sensitive customer content.
 */
export function classifyError(error, providerName = 'ai') {
  const status = error?.status ?? error?.statusCode ?? error?.code;
  const message = String(error?.message || '').toLowerCase();
  const errorName = error?.name || '';
  const providerCode = error?.code || error?.error?.code;
  const providerType = error?.type || error?.error?.type;

  // 1. Quota Exhaustion / Billing Balance (HTTP 429 with insufficient_quota / credit_balance_exhausted)
  if (
    providerCode === 'credit_balance_exhausted' ||
    providerCode === 'insufficient_quota' ||
    providerType === 'insufficient_quota' ||
    message.includes('credit_balance_exhausted') ||
    message.includes('no credits remaining') ||
    message.includes('billing') ||
    message.includes('insufficient_quota') ||
    message.includes('quota')
  ) {
    const err = new Error(`${providerName} quota or credit balance exhausted`);
    err.code = 'AI_QUOTA_EXHAUSTED';
    err.category = 'QUOTA_EXHAUSTED';
    err.statusCode = 429;
    err.providerCode = providerCode || 'insufficient_quota';
    err.sanitizedMessage = 'Account quota or credit balance exhausted';
    err.retryableOnSameProvider = false;
    return err;
  }

  // 2. Ordinary Rate Limit (HTTP 429 without exhausted billing)
  if (
    status === 429 ||
    errorName === 'RateLimitError' ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('resource_exhausted') ||
    message.includes('429')
  ) {
    const err = new Error(`${providerName} rate limit exceeded`);
    err.code = 'AI_RATE_LIMIT';
    err.category = 'RATE_LIMIT';
    err.statusCode = 429;
    err.providerCode = providerCode || 'rate_limit_exceeded';
    err.sanitizedMessage = 'Rate limit exceeded';
    err.retryableOnSameProvider = false;
    return err;
  }

  // 3. Authentication / API Key / Permission (HTTP 401 / 403)
  if (
    status === 401 ||
    status === 403 ||
    errorName === 'AuthenticationError' ||
    errorName === 'PermissionDeniedError' ||
    message.includes('api key') ||
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('permission') ||
    message.includes('forbidden')
  ) {
    const err = new Error(`${providerName} authentication failed`);
    err.code = 'AI_AUTH_FAILURE';
    err.category = 'AUTH_FAILURE';
    err.statusCode = 503;
    err.providerCode = providerCode || 'unauthorized';
    err.sanitizedMessage = 'Invalid API key or authentication failure';
    err.retryableOnSameProvider = false;
    return err;
  }

  // 4. Model Not Found / Unsupported / Retired Model (HTTP 404)
  if (
    status === 404 ||
    errorName === 'NotFoundError' ||
    providerCode === 'model_not_found' ||
    message.includes('not found') ||
    message.includes('no longer available') ||
    message.includes('unknown model') ||
    message.includes('unsupported') ||
    message.includes('does not exist')
  ) {
    const err = new Error(`Configured ${providerName} model is unavailable`);
    err.code = 'AI_UNSUPPORTED_MODEL';
    err.category = 'UNSUPPORTED_MODEL';
    err.statusCode = 503;
    err.providerCode = providerCode || 'model_not_found';
    err.sanitizedMessage = 'Model is unavailable, retired, or access denied';
    err.retryableOnSameProvider = false;
    return err;
  }

  // 5. Request Timeout / Abort
  if (
    error?.code === 'AI_TIMEOUT' ||
    error?.code === 'GEMINI_TIMEOUT' ||
    error?.code === 'ETIMEDOUT' ||
    errorName === 'APIConnectionTimeoutError' ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('aborterror')
  ) {
    const err = new Error(`${providerName} request timed out`);
    err.code = 'AI_TIMEOUT';
    err.category = 'TIMEOUT';
    err.statusCode = 504;
    err.providerCode = 'timeout';
    err.sanitizedMessage = 'Provider request timed out';
    err.retryableOnSameProvider = true;
    return err;
  }

  // 6. Temporary Server Errors (HTTP 500, 502, 503, 504, connection reset)
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    errorName === 'InternalServerError' ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('connection error') ||
    message.includes('server error')
  ) {
    const err = new Error(`${providerName} temporary server failure`);
    err.code = 'AI_TEMPORARY_FAILURE';
    err.category = 'TEMPORARY_FAILURE';
    err.statusCode = 502;
    err.providerCode = providerCode || 'server_error';
    err.sanitizedMessage = 'Temporary provider server failure';
    err.retryableOnSameProvider = true;
    return err;
  }

  // 7. Empty response
  if (error?.code === 'AI_EMPTY_RESPONSE' || error?.code === 'GEMINI_EMPTY_RESPONSE') {
    const err = new Error(`${providerName} returned an empty review draft`);
    err.code = 'AI_EMPTY_RESPONSE';
    err.category = 'EMPTY_RESPONSE';
    err.statusCode = 502;
    err.providerCode = 'empty_response';
    err.sanitizedMessage = 'Received empty response from provider';
    err.retryableOnSameProvider = false;
    return err;
  }

  // Default Fallback
  const err = new Error(`Failed to generate review with ${providerName}`);
  err.code = 'AI_FAILURE';
  err.category = 'UNKNOWN_FAILURE';
  err.statusCode = 502;
  err.providerCode = providerCode || 'unknown';
  err.sanitizedMessage = 'Unknown provider failure';
  err.retryableOnSameProvider = false;
  return err;
}

/**
 * 1. Google Gemini Provider (Primary)
 */
async function generateWithGemini(feedback, prompt) {
  if (!config.geminiApiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'AI_NOT_CONFIGURED';
    err.category = 'NOT_CONFIGURED';
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const timeoutMs = config.timeoutMs;
  const controller = new AbortController();
  let timeoutId;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: config.geminiModel,
        contents: prompt,
        config: {
          maxOutputTokens: 400,
          temperature: 0.6,
          abortSignal: controller.signal,
        },
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // Ignore abort error
          }
          const err = new Error('Gemini request timed out');
          err.code = 'AI_TIMEOUT';
          reject(err);
        }, timeoutMs);
      }),
    ]);

    const text = (response?.text || '').trim();
    if (!text) {
      const err = new Error('Gemini returned an empty review suggestion');
      err.code = 'AI_EMPTY_RESPONSE';
      throw err;
    }
    return text;
  } catch (err) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      const timeoutErr = new Error('Gemini request timed out');
      timeoutErr.code = 'AI_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * 2. Groq Provider (Fallback)
 */
async function generateWithGroq(feedback, prompt) {
  if (!config.groqApiKey) {
    const err = new Error('GROQ_API_KEY is not configured');
    err.code = 'AI_NOT_CONFIGURED';
    err.category = 'NOT_CONFIGURED';
    throw err;
  }

  const client = new Groq({
    apiKey: config.groqApiKey,
    timeout: config.timeoutMs,
  });

  const completion = await client.chat.completions.create({
    model: config.groqModel,
    messages: [
      {
        role: 'system',
        content: 'You write natural, helpful, first-person Google review drafts based strictly on customer feedback.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 400,
    temperature: 0.6,
  });

  const text = (completion?.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    const err = new Error('Groq returned an empty review draft');
    err.code = 'AI_EMPTY_RESPONSE';
    throw err;
  }
  return text;
}

/**
 * Provider adapter registry.
 */
const PROVIDERS = {
  gemini: {
    name: 'gemini',
    getModelId: () => config.geminiModel,
    isConfigured: () => isProviderConfigured('gemini'),
    generate: generateWithGemini,
  },
  groq: {
    name: 'groq',
    getModelId: () => config.groqModel,
    isConfigured: () => isProviderConfigured('groq'),
    generate: generateWithGroq,
  },
};

/**
 * Orchestrates multi-provider review generation with automatic fallback.
 *
 * @param {{ rating: number, selectedOptions?: string[], options?: string[], comment?: string, businessName?: string }} feedback
 * @returns {Promise<string>}
 */
export async function generateReviewSuggestion(feedback) {
  // Test seam: global mock if configured
  if (globalTestMock) {
    return globalTestMock(feedback);
  }

  const prompt = buildReviewPrompt(feedback);
  const primaryProvider = config.primaryProvider;
  const configuredChain = config.providerOrder;
  const maxAttempts = config.maxAttemptsPerProvider;
  const fallbackEnabled = config.fallbackEnabled;

  const providerFailures = [];
  let triedAtLeastOneProvider = false;

  for (let i = 0; i < configuredChain.length; i++) {
    const providerName = configuredChain[i];
    const provider = PROVIDERS[providerName];

    if (!provider) {
      console.warn(`[AI Orchestrator] Unknown provider "${providerName}" in chain; skipping.`);
      continue;
    }

    const modelId = provider.getModelId();
    const isMocked = providerTestMocks.has(providerName);
    const isReady = isMocked || provider.isConfigured();

    if (!isReady) {
      // Missing or placeholder API key -> skip without making network requests
      console.log(
        `[AI Orchestrator] Provider "${providerName}" (model: "${modelId}") skipped (no valid API key configured).`
      );
      continue;
    }

    triedAtLeastOneProvider = true;
    const isFallback = providerName !== primaryProvider;
    let attempt = 0;
    let providerSucceeded = false;
    let providerResult = null;

    while (attempt < maxAttempts) {
      attempt++;
      const startTime = Date.now();

      try {
        console.log(
          `[AI Orchestrator] Attempting generation with provider "${providerName}" (model: "${modelId}", attempt ${attempt}/${maxAttempts}, fallbackUsed: ${isFallback}).`
        );

        if (isMocked) {
          const mockFn = providerTestMocks.get(providerName);
          providerResult = await mockFn(feedback, prompt);
        } else {
          providerResult = await provider.generate(feedback, prompt);
        }

        const duration = Date.now() - startTime;
        const normalized = (providerResult || '').trim();

        if (!normalized) {
          const emptyErr = new Error(`${providerName} returned empty review`);
          emptyErr.code = 'AI_EMPTY_RESPONSE';
          throw emptyErr;
        }

        console.log(
          `[AI Orchestrator] Provider "${providerName}" (model: "${modelId}") succeeded in ${duration}ms (fallbackUsed: ${isFallback}).`
        );
        providerSucceeded = true;
        return normalized;
      } catch (rawError) {
        const duration = Date.now() - startTime;
        const classified = classifyError(rawError, providerName);

        const failureRecord = {
          provider: providerName,
          model: modelId,
          attempt,
          durationMs: duration,
          status: classified.statusCode,
          category: classified.category,
          code: classified.code,
          sanitizedReason: classified.sanitizedMessage,
        };
        providerFailures.push(failureRecord);

        console.warn(
          `[AI Orchestrator] Provider "${providerName}" (model: "${modelId}") failed on attempt ${attempt} in ${duration}ms (status: ${classified.statusCode}, category: ${classified.category}, code: ${classified.code}). Diagnostic: ${classified.sanitizedMessage}`
        );

        // If error is non-retryable on the same provider (e.g. auth failure, quota exhaustion, unsupported model), break attempt loop
        if (!classified.retryableOnSameProvider) {
          break;
        }
      }
    }

    // If fallback is disabled, do not continue to next provider
    if (!fallbackEnabled) {
      console.log(
        `[AI Orchestrator] Fallback disabled by configuration; stopping after provider "${providerName}".`
      );
      break;
    }
  }

  // If no providers were configured at all
  if (!triedAtLeastOneProvider) {
    const err = new Error('No AI review provider is configured with valid credentials.');
    err.code = 'AI_NOT_CONFIGURED';
    err.category = 'NOT_CONFIGURED';
    err.statusCode = 503;
    throw err;
  }

  // All attempted providers failed: log complete structured failure breakdown
  console.error('[AI Orchestrator] All configured AI providers failed. Breakdown:');
  providerFailures.forEach((f, idx) => {
    console.error(
      `  ${idx + 1}. [${f.provider}] Model "${f.model}": category=${f.category}, status=${f.status}, code=${f.code} (${f.durationMs}ms)`
    );
  });

  // Preserve the primary provider's failure category so the root cause is not masked by downstream fallbacks
  const primaryFailure = providerFailures.find((f) => f.provider === primaryProvider) || providerFailures[0];
  const lastFailure = providerFailures[providerFailures.length - 1];

  const compositeError = new Error(
    `All configured AI providers failed. Primary provider (${primaryProvider}) failed with ${primaryFailure?.category || 'ERROR'}.`
  );
  compositeError.code = primaryFailure?.code || lastFailure?.code || 'AI_FAILURE';
  compositeError.category = primaryFailure?.category || lastFailure?.category || 'UNKNOWN';
  compositeError.statusCode = primaryFailure?.status || lastFailure?.status || 502;
  compositeError.providerFailures = providerFailures;
  compositeError.primaryFailure = primaryFailure;

  throw compositeError;
}

export default {
  buildReviewPrompt,
  classifyError,
  generateReviewSuggestion,
  __setGenerateReviewSuggestionForTests,
  __resetGenerateReviewSuggestionForTests,
  __setProviderMock,
  __resetProviderMocks,
};
