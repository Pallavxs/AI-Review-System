import { Router } from 'express';
import config from '../config/index.js';
import {
  ALLOWED_FEEDBACK_OPTIONS,
  FEEDBACK_CATEGORIES,
} from '../constants/feedbackOptions.js';

const router = Router();

/**
 * GET /api/config
 * Public business branding + Google Review URL + available feedback attributes and categories.
 * Never exposes Gemini API keys or sensitive internals.
 */
router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      businessName: config.businessName,
      businessLocation: config.businessLocation || null,
      businessLogoUrl: config.businessLogoUrl || null,
      googleReviewUrl: config.googleReviewUrl,
      publicFeedbackUrl: config.publicFeedbackUrl,
      feedbackOptions: ALLOWED_FEEDBACK_OPTIONS,
      feedbackCategories: FEEDBACK_CATEGORIES,
    },
  });
});

export default router;
