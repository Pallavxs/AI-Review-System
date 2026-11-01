/**
 * Live Gemini end-to-end smoke test.
 * Runs only when a non-placeholder GEMINI_API_KEY is configured.
 * Never prints the API key or raw provider payloads.
 *
 * Usage: node scripts/live-gemini-smoke.js
 */

import mongoose from 'mongoose';
import config from '../src/config/index.js';
import connectDB from '../src/config/db.js';
import Feedback from '../src/models/Feedback.js';
import { generateReviewSuggestion, verifyGeminiModel } from '../src/services/geminiService.js';
import { GENERATION_STATUS } from '../src/constants/feedbackOptions.js';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  console.log('Live Gemini smoke — starting');
  console.log(`Model: ${config.geminiModel}`);
  console.log(`Gemini configured: ${Boolean(config.geminiApiKey)}`);
  console.log(`Google review URL configured: ${Boolean(config.googleReviewUrl)}`);

  if (!config.geminiApiKey) {
    fail(
      'GEMINI_API_KEY is missing or still a placeholder. Set a real key in server/.env (from Google AI Studio), restart the server, then re-run this script. Do not paste the key into chat.'
    );
    return;
  }

  await connectDB();

  const probe = await verifyGeminiModel();
  if (!probe.ok) {
    fail(`Model verification failed (${probe.code || 'unknown'}): ${probe.reason}`);
    await mongoose.disconnect();
    return;
  }
  console.log(`Model verification: ok (${probe.model})`);

  const sample = {
    rating: 4,
    selectedOptions: [
      'Friendly staff',
      'Good service',
      'Product quality',
      'Clean environment',
      'Quick response',
    ],
    comment: 'The staff was friendly and the service was quick.',
  };

  const created = await Feedback.create({
    ...sample,
    generationStatus: GENERATION_STATUS.IDLE,
  });
  console.log(`Feedback saved: ${created._id}`);

  let suggestion;
  try {
    suggestion = await generateReviewSuggestion({
      ...sample,
      businessName: config.businessName,
    });
  } catch (error) {
    await Feedback.findByIdAndUpdate(created._id, {
      $set: { generationStatus: GENERATION_STATUS.FAILED },
    });
    fail(`Generation failed with code ${error.code || 'unknown'} (feedback retained)`);
    const retained = await Feedback.findById(created._id);
    console.log(
      `Retained feedback status=${retained.generationStatus} rating=${retained.rating} commentLen=${retained.comment.length}`
    );
    await mongoose.disconnect();
    return;
  }

  created.generatedReview = suggestion;
  created.generatedAt = new Date();
  created.generationStatus = GENERATION_STATUS.COMPLETED;
  await created.save();

  const reloaded = await Feedback.findById(created._id).lean();
  const unchanged =
    reloaded.rating === sample.rating &&
    JSON.stringify(reloaded.selectedOptions) === JSON.stringify(sample.selectedOptions) &&
    reloaded.comment === sample.comment;

  console.log(`generationStatus: ${reloaded.generationStatus}`);
  console.log(`generatedReview length: ${(reloaded.generatedReview || '').length}`);
  console.log(`original fields unchanged: ${unchanged}`);
  console.log(`googleReviewUrl present in config: ${Boolean(config.googleReviewUrl)}`);

  if (reloaded.generationStatus !== GENERATION_STATUS.COMPLETED || !reloaded.generatedReview || !unchanged) {
    fail('Persistence or integrity checks failed');
  } else {
    console.log('PASS: live generation + MongoDB persistence succeeded');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  fail(error.message || 'Unexpected smoke failure');
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
});
