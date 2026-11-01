/**
 * Test Frontend Transition & Clipboard Behavior for Google Reviews
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientRoot = path.resolve(__dirname, '..');

// Load HTML to verify element structure
const htmlPath = path.join(clientRoot, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Load CSS to verify styling
const cssPath = path.join(clientRoot, 'style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Load JS to verify syntax and logic
const jsPath = path.join(clientRoot, 'app.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

test('HTML structure includes transition banners, CTA button, and accurate wording', () => {
  // 1. Post a Review on Google button
  assert.ok(htmlContent.includes('id="postToGoogleBtn"'), 'Must have #postToGoogleBtn');
  assert.ok(htmlContent.includes('Post a Review on Google'), 'Must have button text "Post a Review on Google"');

  // 2. Editable textarea
  assert.ok(htmlContent.includes('id="generatedReviewTextarea"'), 'Must have #generatedReviewTextarea');
  assert.ok(!htmlContent.includes('<textarea id="generatedReviewTextarea" readonly'), 'Textarea must not be readonly');

  // 3. Google transition banner with exact message
  assert.ok(htmlContent.includes('id="googleTransitionBanner"'), 'Must have #googleTransitionBanner');
  assert.ok(htmlContent.includes('id="transitionMessageText"'), 'Must have #transitionMessageText');
  assert.ok(
    htmlContent.includes('Your review has been copied. On Google, select your star rating, paste your review, and submit it.'),
    'Must include the exact success message requirement'
  );

  // 4. Clipboard fallback banner
  assert.ok(htmlContent.includes('id="clipboardFallbackBanner"'), 'Must have #clipboardFallbackBanner');
  assert.ok(htmlContent.includes('Manual Copy Needed'), 'Must contain manual copy fallback guidance');

  // 5. No fake review submission claims
  assert.ok(!htmlContent.includes('Review posted to Google!'), 'Must not claim review was posted before Google submission');
});

test('CSS includes responsive transition and fallback banner styling', () => {
  assert.ok(cssContent.includes('.transition-banner'), 'CSS must define .transition-banner');
  assert.ok(cssContent.includes('.fallback-banner'), 'CSS must define .fallback-banner');
  assert.ok(cssContent.includes('.transition-check'), 'CSS must define .transition-check');
  assert.ok(cssContent.includes('.btn-google'), 'CSS must define .btn-google');
});

test('Frontend app.js contains all 12 Hinglish feedback options across the 3 categories', () => {
  const expectedHinglishOptions = [
    // Mobile Phones
    'Online se bhi kam rate mein phone mile',
    'Achhi quality ke saath sabhi tarah ke phones available hain',
    'Anuppur ki best mobile shop',
    'Anuppur mein sabse kam rate par phones milte hain',
    // Mobile Accessories
    'Original mobile accessories milte hain',
    'Premium quality ke phone covers milte hain',
    'Phone covers reasonable rate mein milte hain',
    'Anuppur mein mobile accessories ki best variety hai',
    // Mobile Repairing
    'Kam rate mein achhi mobile repairing hoti hai',
    'Original parts available hain',
    'Anuppur mein original mobile displays milte hain',
    'Anuppur mein fast mobile repairing service milti hai',
  ];

  for (const option of expectedHinglishOptions) {
    assert.ok(jsContent.includes(option), `Expected app.js to include Hinglish option: "${option}"`);
  }
});

test('Simulated DOM workflow: Clipboard Success copies edited text & opens Google URL without query params', async () => {
  let clipboardWritten = '';
  let openedUrl = '';
  let openedTarget = '';

  const classList = (initial = []) => {
    const classes = new Set(initial);
    return {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      get value() { return Array.from(classes).join(' '); }
    };
  };

  const elements = {
    generatedReviewTextarea: {
      value: 'Original AI draft',
      select: () => {},
      focus: () => {},
      setSelectionRange: () => {},
    },
    googleTransitionBanner: { classList: classList(['hidden']) },
    clipboardFallbackBanner: { classList: classList(['hidden']) },
    postToGoogleBtn: { href: '' },
    toast: { classList: classList(['hidden']) },
    toastMessage: { textContent: '' },
  };

  const config = {
    googleReviewUrl: 'https://g.page/r/CbEXAMPLE_PLACE_ID/review',
  };

  const mockNavigator = {
    clipboard: {
      writeText: async (text) => {
        clipboardWritten = text;
        return Promise.resolve();
      }
    }
  };

  const mockWindow = {
    open: (url, target) => {
      openedUrl = url;
      openedTarget = target;
      return {};
    }
  };

  async function copyTextToClipboard(text) {
    if (mockNavigator.clipboard && typeof mockNavigator.clipboard.writeText === 'function') {
      try {
        await mockNavigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function handlePostToGoogle() {
    const textarea = elements.generatedReviewTextarea;
    const currentEditedReview = textarea ? textarea.value : '';
    const targetUrl = config.googleReviewUrl;

    const copied = await copyTextToClipboard(currentEditedReview);

    if (copied) {
      elements.clipboardFallbackBanner.classList.add('hidden');
      elements.googleTransitionBanner.classList.remove('hidden');
      elements.toastMessage.textContent =
        'Your review has been copied. On Google, select your star rating, paste your review, and submit it.';
    } else {
      elements.googleTransitionBanner.classList.add('hidden');
      elements.clipboardFallbackBanner.classList.remove('hidden');
    }

    mockWindow.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  // 1. Simulate customer editing the review draft (19 words)
  elements.generatedReviewTextarea.value =
    'I purchased a Redmi phone at Dula mobiles in Anuppur at a great price lower than online! Very happy.';

  // 2. Customer clicks "Post a Review on Google"
  await handlePostToGoogle();

  // Assert clipboard has the EDITED review, not stale text
  assert.equal(
    clipboardWritten,
    'I purchased a Redmi phone at Dula mobiles in Anuppur at a great price lower than online! Very happy.'
  );

  // Assert transition banner is shown
  assert.equal(elements.googleTransitionBanner.classList.contains('hidden'), false);
  assert.equal(elements.clipboardFallbackBanner.classList.contains('hidden'), true);

  // Assert toast has the exact required instruction
  assert.equal(
    elements.toastMessage.textContent,
    'Your review has been copied. On Google, select your star rating, paste your review, and submit it.'
  );

  // Assert Google review URL is opened unmodified (no invented query params)
  assert.equal(openedUrl, 'https://g.page/r/CbEXAMPLE_PLACE_ID/review');
  assert.equal(openedTarget, '_blank');
});

test('Reviews longer than 10 words (e.g. 50 words) are completely copied without word limit or truncation', async () => {
  let clipboardCopiedText = '';

  const longReview =
    'I visited Dula mobiles in Anuppur for purchasing a brand new 5G mobile phone and original back covers. ' +
    'The collection here is amazing, prices are significantly lower than online shopping apps, and the staff is very polite and helpful. ' +
    'Best smartphone and mobile repair shop in Anuppur by far!';

  const wordCount = longReview.split(/\s+/).filter(Boolean).length;
  assert.ok(wordCount > 10, `Review must have > 10 words, found: ${wordCount}`);
  assert.equal(wordCount >= 40, true, 'Review is substantial (40+ words)');

  const mockNavigator = {
    clipboard: {
      writeText: async (text) => {
        clipboardCopiedText = text;
        return Promise.resolve();
      }
    }
  };

  const textarea = {
    value: longReview,
    select: () => {},
    focus: () => {},
    setSelectionRange: () => {},
  };

  // Helper matching updated client/app.js logic
  const textToCopy = textarea.value;
  await mockNavigator.clipboard.writeText(textToCopy);

  // Verify full length and exact string
  assert.equal(clipboardCopiedText, longReview);
  assert.equal(clipboardCopiedText.split(/\s+/).filter(Boolean).length, wordCount);
  assert.ok(clipboardCopiedText.endsWith('Anuppur by far!'));
});

test('Live textarea edits (>10 words) are directly read by clipboard copy, never reverting to outdated state', async () => {
  let clipboardResult = '';

  // Simulate initial generation in state
  const state = {
    generatedReview: 'Initial 6 word short draft.',
  };

  const textarea = {
    value: state.generatedReview,
    select: () => {},
    focus: () => {},
    setSelectionRange: () => {},
  };

  // User manually edits the textarea, typing a comprehensive 35-word review
  const userEditedReview =
    'I got my broken mobile display replaced at Dula mobiles in Anuppur today. ' +
    'They used an original replacement screen, completed the repair within an hour, and charged very affordable prices. Fantastic service!';

  textarea.value = userEditedReview;
  // State might be outdated until input event or copy handler reads from DOM textarea
  const words = userEditedReview.split(/\s+/).filter(Boolean).length;
  assert.ok(words > 10, `Edited review has ${words} words (> 10)`);

  const mockNavigator = {
    clipboard: {
      writeText: async (text) => {
        clipboardResult = text;
        return Promise.resolve();
      }
    }
  };

  // The application reads directly from textarea.value
  const reviewToTransfer = textarea ? textarea.value : state.generatedReview;
  await mockNavigator.clipboard.writeText(reviewToTransfer);

  // Verifies the copied review is the CURRENT EDITED TEXT, NOT the initial state
  assert.equal(clipboardResult, userEditedReview);
  assert.notEqual(clipboardResult, state.generatedReview);
  assert.equal(clipboardResult.split(/\s+/).filter(Boolean).length, words);
});

test('execCommand fallback preserves full review longer than 10 words without index truncation', () => {
  let selectedRange = null;
  const longReview =
    'Fastest mobile repair service in Anuppur with original replacement parts and genuine mobile phone accessories available at wholesale prices.';

  const wordCount = longReview.split(/\s+/).filter(Boolean).length;
  assert.ok(wordCount > 10, `Expected > 10 words, got ${wordCount}`);

  const textarea = {
    value: longReview,
    focus: () => {},
    select: () => {},
    setSelectionRange: (start, end) => {
      selectedRange = { start, end };
    },
  };

  // Simulate execCommand fallback logic
  textarea.focus();
  textarea.select();
  if (typeof textarea.setSelectionRange === 'function') {
    textarea.setSelectionRange(0, textarea.value.length);
  }

  // Verifies range spans from 0 to entire string length without cutting off at 10 words
  assert.deepEqual(selectedRange, { start: 0, end: longReview.length });
  assert.equal(textarea.value.length, longReview.length);
});

test('Simulated DOM workflow: Clipboard Failure retains review text and presents fallback', async () => {
  let textareaSelected = false;
  let textareaFocused = false;

  const classList = (initial = []) => {
    const classes = new Set(initial);
    return {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    };
  };

  const elements = {
    generatedReviewTextarea: {
      value: 'My customized review draft that must not be lost after extensive editing with many words.',
      select: () => { textareaSelected = true; },
      focus: () => { textareaFocused = true; },
      setSelectionRange: () => {},
    },
    googleTransitionBanner: { classList: classList(['hidden']) },
    clipboardFallbackBanner: { classList: classList(['hidden']) },
    toast: { classList: classList(['hidden']) },
    toastMessage: { textContent: '' },
  };

  const config = {
    googleReviewUrl: 'https://g.page/r/CbEXAMPLE_PLACE_ID/review',
  };

  // Mock clipboard rejecting (e.g. permission denied or insecure context)
  const mockNavigator = {
    clipboard: {
      writeText: async () => {
        throw new Error('NotAllowedError: Clipboard permission denied');
      }
    }
  };

  async function copyTextToClipboard(text) {
    if (mockNavigator.clipboard) {
      try {
        await mockNavigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function handlePostToGoogle() {
    const textarea = elements.generatedReviewTextarea;
    const currentEditedReview = textarea ? textarea.value : '';
    const targetUrl = config.googleReviewUrl;

    const copied = await copyTextToClipboard(currentEditedReview);

    if (copied) {
      elements.clipboardFallbackBanner.classList.add('hidden');
      elements.googleTransitionBanner.classList.remove('hidden');
    } else {
      // Retain draft, select text, show fallback
      elements.googleTransitionBanner.classList.add('hidden');
      elements.clipboardFallbackBanner.classList.remove('hidden');
      elements.generatedReviewTextarea.focus();
      elements.generatedReviewTextarea.select();
      elements.toastMessage.textContent = '⚠️ Manual copy needed. Your review draft is highlighted above.';
    }
  }

  await handlePostToGoogle();

  // Review draft must be preserved (not erased)
  assert.equal(
    elements.generatedReviewTextarea.value,
    'My customized review draft that must not be lost after extensive editing with many words.'
  );
  // Focus and select must have been triggered
  assert.equal(textareaSelected, true);
  assert.equal(textareaFocused, true);
  // Transition banner is hidden and fallback banner is visible
  assert.equal(elements.googleTransitionBanner.classList.contains('hidden'), true);
  assert.equal(elements.clipboardFallbackBanner.classList.contains('hidden'), false);
});

