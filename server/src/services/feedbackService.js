import Feedback from '../models/Feedback.js';
import config from '../config/index.js';
import { generateReviewSuggestion } from './geminiService.js';
import { GENERATION_STATUS } from '../constants/feedbackOptions.js';

/**
 * Service layer for feedback persistence, state transitions, and review generation orchestration.
 */

/**
 * Create and persist customer feedback.
 * Does not invoke Gemini.
 */
export async function saveFeedback({ rating, selectedOptions = [], comment = '' }) {
  const feedback = await Feedback.create({
    rating,
    selectedOptions,
    comment,
    generationStatus: GENERATION_STATUS.IDLE,
  });

  return feedback;
}

/**
 * Find a feedback record by ID.
 */
export async function getFeedbackById(id) {
  return Feedback.findById(id).select(
    'rating selectedOptions comment generatedReview generatedAt generationStatus'
  );
}

/**
 * Generate (or regenerate) an AI review suggestion for a saved feedback record.
 * Handles concurrency, state safety, idempotency, and error handling.
 */
export async function generateReviewForFeedback(id, { regenerate = false } = {}) {
  const existing = await getFeedbackById(id);

  if (!existing) {
    const error = new Error('Feedback not found');
    error.statusCode = 404;
    throw error;
  }

  // Idempotency: return existing suggestion if not explicitly regenerating
  if (!regenerate && existing.generatedReview && existing.generationStatus === GENERATION_STATUS.COMPLETED) {
    return {
      feedback: existing,
      reused: true,
    };
  }

  // Concurrent generation protection
  if (existing.generationStatus === GENERATION_STATUS.GENERATING) {
    const error = new Error('Review generation is already in progress for this feedback');
    error.statusCode = 409;
    error.code = 'GENERATION_IN_PROGRESS';
    error.feedback = existing;
    throw error;
  }

  // Allowed statuses to transition from
  const claimableStatuses = [GENERATION_STATUS.IDLE, GENERATION_STATUS.FAILED];
  if (regenerate) {
    claimableStatuses.push(GENERATION_STATUS.COMPLETED);
  }

  // Atomically claim generation so concurrent requests cannot duplicate AI calls
  const claimed = await Feedback.findOneAndUpdate(
    {
      _id: id,
      generationStatus: { $in: claimableStatuses },
    },
    { $set: { generationStatus: GENERATION_STATUS.GENERATING } },
    { new: true }
  );

  if (!claimed) {
    // Race condition check: another worker claimed or completed between reads
    const latest = await getFeedbackById(id);
    if (!regenerate && latest?.generatedReview) {
      return {
        feedback: latest,
        reused: true,
      };
    }

    const error = new Error('Review generation is already in progress for this feedback');
    error.statusCode = 409;
    error.code = 'GENERATION_IN_PROGRESS';
    error.feedback = latest || { _id: id, generationStatus: GENERATION_STATUS.GENERATING };
    throw error;
  }

  let suggestion;
  try {
    suggestion = await generateReviewSuggestion({
      rating: claimed.rating,
      selectedOptions: claimed.selectedOptions,
      comment: claimed.comment,
      businessName: config.businessName,
    });
  } catch (error) {
    // Never leave generation status stuck at 'generating'
    await Feedback.findByIdAndUpdate(id, {
      $set: { generationStatus: GENERATION_STATUS.FAILED },
    });
    throw error;
  }

  try {
    claimed.generatedReview = suggestion;
    claimed.generatedAt = new Date();
    claimed.generationStatus = GENERATION_STATUS.COMPLETED;
    await claimed.save();
  } catch {
    await Feedback.findByIdAndUpdate(id, {
      $set: { generationStatus: GENERATION_STATUS.FAILED },
    });

    const error = new Error(
      'Review was generated but could not be saved. Your original feedback is intact; you can retry.'
    );
    error.statusCode = 500;
    error.code = 'PERSISTENCE_FAILURE';
    error.feedback = claimed;
    throw error;
  }

  return {
    feedback: claimed,
    reused: false,
  };
}

export default {
  saveFeedback,
  getFeedbackById,
  generateReviewForFeedback,
};

