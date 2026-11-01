import mongoose from 'mongoose';
import {
  ALLOWED_FEEDBACK_OPTIONS,
  GENERATION_STATUS,
} from '../constants/feedbackOptions.js';

/**
 * Stores the customer's original feedback and, separately, any AI-generated
 * review suggestion. Original fields are never overwritten by generation.
 *
 * API contract (Phase 2): request/response use `selectedOptions` (not `options`).
 */
const feedbackSchema = new mongoose.Schema(
  {
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5'],
    },
    selectedOptions: {
      type: [String],
      default: [],
      validate: {
        validator(value) {
          if (!Array.isArray(value)) return false;
          return value.every((item) => ALLOWED_FEEDBACK_OPTIONS.includes(item));
        },
        message: 'selectedOptions contains an invalid value',
      },
    },
    comment: {
      type: String,
      default: '',
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
      trim: true,
    },
    // AI output — stored separately; never replaces rating/selectedOptions/comment
    generatedReview: {
      type: String,
      default: null,
      maxlength: [5000, 'Generated review cannot exceed 5000 characters'],
    },
    generatedAt: {
      type: Date,
      default: null,
    },
    generationStatus: {
      type: String,
      enum: Object.values(GENERATION_STATUS),
      default: GENERATION_STATUS.IDLE,
    },
  },
  {
    timestamps: true,
  }
);

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
