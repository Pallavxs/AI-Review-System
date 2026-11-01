import config from '../config/index.js';
import { GENERATION_STATUS } from '../constants/feedbackOptions.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  saveFeedback,
  generateReviewForFeedback,
} from '../services/feedbackService.js';

/**
 * POST /api/feedback
 * Validates (via middleware), delegates persistence to feedbackService, returns 201.
 * Does not call Gemini.
 */
export const createFeedback = asyncHandler(async (req, res) => {
  const { rating, selectedOptions, comment } = req.body;

  const feedback = await saveFeedback({
    rating,
    selectedOptions,
    comment,
  });

  res.status(201).json({
    success: true,
    data: {
      id: feedback._id,
      rating: feedback.rating,
      selectedOptions: feedback.selectedOptions,
      comment: feedback.comment,
      generationStatus: feedback.generationStatus,
      createdAt: feedback.createdAt,
    },
  });
});

/**
 * Map AI provider/service errors to a safe client-facing payload.
 * Never returns API keys or raw provider details.
 */
function safeGenerationError(error) {
  const code = error?.code || 'AI_FAILURE';

  if (code === 'GEMINI_NOT_CONFIGURED' || code === 'AI_NOT_CONFIGURED') {
    return {
      status: 503,
      code,
      message:
        'Review generation is temporarily unavailable. Your feedback was saved; you can retry later.',
    };
  }

  if (code === 'GEMINI_EMPTY_RESPONSE' || code === 'AI_EMPTY_RESPONSE') {
    return {
      status: 502,
      code,
      message:
        'The AI returned an empty suggestion. Your feedback was saved; you can retry.',
    };
  }

  if (code === 'GEMINI_TIMEOUT' || code === 'AI_TIMEOUT') {
    return {
      status: 504,
      code,
      message:
        'Review generation timed out. Your feedback was saved; you can retry.',
    };
  }

  if (
    code === 'GEMINI_AUTH_FAILURE' ||
    code === 'AI_AUTH_FAILURE' ||
    code === 'GEMINI_UNSUPPORTED_MODEL' ||
    code === 'AI_UNSUPPORTED_MODEL'
  ) {
    return {
      status: 503,
      code,
      message:
        'Review generation is misconfigured. Your feedback was saved; you can retry later.',
    };
  }

  if (code === 'AI_QUOTA_EXHAUSTED') {
    return {
      status: 429,
      code,
      message:
        'Review generation quota has been exhausted. Your feedback was saved; please try again later.',
    };
  }

  if (code === 'GEMINI_RATE_LIMIT' || code === 'AI_RATE_LIMIT') {
    return {
      status: 429,
      code,
      message:
        'Review generation is temporarily busy. Your feedback was saved; please retry shortly.',
    };
  }

  return {
    status: 502,
    code: error?.code || 'AI_FAILURE',
    message:
      'Failed to generate review suggestion. Your feedback was saved; you can retry.',
  };
}

/**
 * POST /api/feedback/:id/generate-review
 * Orchestrates review generation via feedbackService, handles concurrency, errors, and idempotency.
 */
export const generateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const regenerate = Boolean(req.body?.regenerate);

  try {
    const result = await generateReviewForFeedback(id, { regenerate });
    const feedback = result.feedback;

    return res.status(200).json({
      success: true,
      data: {
        id: feedback._id,
        generatedReview: feedback.generatedReview,
        generatedAt: feedback.generatedAt,
        generationStatus: feedback.generationStatus,
        googleReviewUrl: config.googleReviewUrl || null,
        reused: result.reused,
      },
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found',
      });
    }

    if (error.statusCode === 409 || error.code === 'GENERATION_IN_PROGRESS') {
      return res.status(409).json({
        success: false,
        message: error.message,
        code: 'GENERATION_IN_PROGRESS',
        data: {
          id: error.feedback?._id || id,
          generationStatus: error.feedback?.generationStatus || GENERATION_STATUS.GENERATING,
          googleReviewUrl: config.googleReviewUrl || null,
        },
      });
    }

    if (error.statusCode === 500 && error.code === 'PERSISTENCE_FAILURE') {
      return res.status(500).json({
        success: false,
        message: error.message,
        code: 'PERSISTENCE_FAILURE',
        data: {
          id: error.feedback?._id || id,
          generationStatus: GENERATION_STATUS.FAILED,
          googleReviewUrl: config.googleReviewUrl || null,
        },
      });
    }

    const safe = safeGenerationError(error);
    return res.status(safe.status).json({
      success: false,
      message: safe.message,
      code: safe.code,
      data: {
        id,
        generationStatus: GENERATION_STATUS.FAILED,
        googleReviewUrl: config.googleReviewUrl || null,
      },
    });
  }
});
