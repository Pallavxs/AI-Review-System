import { GoogleGenAI } from '@google/genai';
import config from '../config/index.js';
import aiProviderService, {
  generateReviewSuggestion as multiProviderGenerate,
  __setGenerateReviewSuggestionForTests as setMock,
  __resetGenerateReviewSuggestionForTests as resetMock,
  __setProviderMock as setProviderMock,
  __resetProviderMocks as resetProviderMocks,
} from './aiProviderService.js';

let client = null;

export const __setGenerateReviewSuggestionForTests = setMock;
export const __resetGenerateReviewSuggestionForTests = resetMock;
export const __setProviderMock = setProviderMock;
export const __resetProviderMocks = resetProviderMocks;

/**
 * Lazily create the Gemini client. API key stays on the server only.
 */
function getClient() {
  if (!config.geminiApiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  return client;
}

/**
 * Classify provider errors into safe internal codes.
 * Never attaches raw provider payloads or API keys to the thrown error.
 */
function classifyProviderError(error) {
  return aiProviderService.classifyError(error, 'Gemini');
}

/**
 * Verify the configured model responds (optional deep check).
 * Does not log secrets.
 */
export async function verifyGeminiModel() {
  if (!config.geminiApiKey) {
    return { ok: false, reason: 'GEMINI_API_KEY is not configured' };
  }

  if (!config.geminiModel) {
    return { ok: false, reason: 'GEMINI_MODEL is not configured' };
  }

  try {
    const ai = getClient();
    await ai.models.generateContent({
      model: config.geminiModel,
      contents: 'Reply with the single word: ok',
      config: { maxOutputTokens: 8 },
    });

    return { ok: true, model: config.geminiModel };
  } catch (error) {
    const classified = classifyProviderError(error);
    return {
      ok: false,
      reason: classified.message,
      code: classified.code,
      model: config.geminiModel,
    };
  }
}

/**
 * Generate a short first-person review suggestion from saved feedback only.
 * Delegates to multi-provider orchestrator with automatic fallback.
 *
 * @param {{ rating: number, selectedOptions?: string[], options?: string[], comment?: string, businessName?: string }} feedback
 * @returns {Promise<string>}
 */
export async function generateReviewSuggestion(feedback) {
  return multiProviderGenerate(feedback);
}

export default {
  verifyGeminiModel,
  generateReviewSuggestion,
  __setGenerateReviewSuggestionForTests,
  __resetGenerateReviewSuggestionForTests,
  __setProviderMock,
  __resetProviderMocks,
};
