import { Router } from 'express';
import {
  createFeedback,
  generateReview,
} from '../controllers/feedbackController.js';
import { validate } from '../middleware/validate.js';
import {
  createFeedbackSchema,
  generateReviewParamsSchema,
  generateReviewBodySchema,
} from '../validators/feedbackValidator.js';

const router = Router();

router.post('/', validate(createFeedbackSchema, 'body'), createFeedback);

router.post(
  '/:id/generate-review',
  validate(generateReviewParamsSchema, 'params'),
  validate(generateReviewBodySchema, 'body'),
  generateReview
);

export default router;
