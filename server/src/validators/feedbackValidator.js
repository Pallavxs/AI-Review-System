import { z } from 'zod';
import mongoose from 'mongoose';
import { ALLOWED_FEEDBACK_OPTIONS } from '../constants/feedbackOptions.js';

const allowedOptionSet = new Set(ALLOWED_FEEDBACK_OPTIONS);

/**
 * POST /api/feedback body
 * - Rejects unexpected keys (.strict)
 * - Rejects type coercion (z.number() / z.string() without preprocess)
 */
export const createFeedbackSchema = z
  .object({
    rating: z
      .number({
        required_error: 'Rating is required',
        invalid_type_error: 'Rating must be an integer between 1 and 5',
      })
      .int('Rating must be an integer between 1 and 5')
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating must be at most 5'),
    selectedOptions: z
      .array(z.string(), {
        invalid_type_error: 'selectedOptions must be an array of strings',
      })
      .default([])
      .superRefine((options, ctx) => {
        for (const option of options) {
          if (!allowedOptionSet.has(option)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Unknown feedback option: ${option}`,
            });
          }
        }
      }),
    comment: z
      .string({ invalid_type_error: 'comment must be a string' })
      .trim()
      .max(1000, 'comment cannot exceed 1000 characters')
      .optional()
      .default(''),
  })
  .strict();

export const generateReviewParamsSchema = z
  .object({
    id: z
      .string({ required_error: 'Feedback id is required' })
      .refine((value) => mongoose.Types.ObjectId.isValid(value), {
        message: 'Invalid feedback id',
      }),
  })
  .strict();

/**
 * POST /api/feedback/:id/generate-review body
 * Allows optional `regenerate: boolean` flag while rejecting any unexpected keys (.strict)
 */
export const generateReviewBodySchema = z
  .object({
    regenerate: z.boolean({ invalid_type_error: 'regenerate must be a boolean' }).optional().default(false),
  })
  .strict()
  .optional()
  .default({});
