/**
 * Smart AI Google Review Builder — Client Application
 */
import { generateGoogleThemedQrSvg } from './qr-generator.js';
import { apiFetch } from './api-client.js';

const RATING_SENTIMENTS = {
  1: '1 Star — Poor Experience',
  2: '2 Stars — Fair / Needs Improvement',
  3: '3 Stars — Good / Average Experience',
  4: '4 Stars — Very Good Experience',
  5: '5 Stars — Excellent! Loved it!',
};

// Default mobile shop feedback categories tailored for Anuppur, MP (in natural Hinglish)
const DEFAULT_FEEDBACK_CATEGORIES = [
  {
    name: 'Mobile Phones',
    icon: '📱',
    options: [
      'Online se bhi kam rate mein phone mile',
      'Achhi quality ke saath sabhi tarah ke phones available hain',
      'Anuppur ki best mobile shop',
      'Anuppur mein sabse kam rate par phones milte hain',
    ],
  },
  {
    name: 'Mobile Accessories',
    icon: '🎧',
    options: [
      'Original mobile accessories milte hain',
      'Premium quality ke phone covers milte hain',
      'Phone covers reasonable rate mein milte hain',
      'Anuppur mein mobile accessories ki best variety hai',
    ],
  },
  {
    name: 'Mobile Repairing',
    icon: '🔧',
    options: [
      'Kam rate mein achhi mobile repairing hoti hai',
      'Original parts available hain',
      'Anuppur mein original mobile displays milte hain',
      'Anuppur mein fast mobile repairing service milti hai',
    ],
  },
];

// Flat list of all default options
const DEFAULT_FEEDBACK_OPTIONS = [
  ...DEFAULT_FEEDBACK_CATEGORIES.flatMap((c) => c.options),
  'Friendly staff',
  'Good service',
  'Product quality',
  'Affordable pricing',
  'Clean environment',
  'Quick response',
];

// App State
const state = {
  config: {
    businessName: 'Dula mobiles',
    businessLocation: 'Anuppur, Madhya Pradesh',
    businessLogoUrl: '/assets/dulamobiles.jpeg',
    googleReviewUrl: '',
    publicFeedbackUrl: window.location.href,
    feedbackOptions: DEFAULT_FEEDBACK_OPTIONS,
    feedbackCategories: DEFAULT_FEEDBACK_CATEGORIES,
  },
  rating: null,
  selectedOptions: new Set(),
  feedbackId: null,
  generatedReview: '',
  isGenerating: false,
};

// DOM Elements
const elements = {
  businessName: document.getElementById('businessNameDisplay'),
  businessLocationBadge: document.getElementById('businessLocationBadge'),
  businessLocationText: document.getElementById('businessLocationText'),
  businessAvatar: document.getElementById('businessAvatar'),
  businessAvatarText: document.getElementById('businessAvatarText'),
  ratingLabel: document.getElementById('ratingLabel'),
  starButtons: Array.from(document.querySelectorAll('.star-btn')),
  ratingSentiment: document.getElementById('ratingSentimentText'),
  optionsContainer: document.getElementById('optionsContainer'),
  commentInput: document.getElementById('commentInput'),
  charCounter: document.getElementById('charCounter'),
  generateBtn: document.getElementById('generateBtn'),
  directGoogleLink: document.getElementById('directGoogleLink'),
  feedbackFormSection: document.getElementById('feedbackFormSection'),
  loadingSection: document.getElementById('loadingSection'),
  resultSection: document.getElementById('resultSection'),
  generatedReviewTextarea: document.getElementById('generatedReviewTextarea'),
  draftWordCount: document.getElementById('draftWordCount'),
  copyReviewBtn: document.getElementById('copyReviewBtn'),
  copyBtnText: document.getElementById('copyBtnText'),
  regenerateBtn: document.getElementById('regenerateBtn'),
  postToGoogleBtn: document.getElementById('postToGoogleBtn'),
  postToGoogleBtnText: document.getElementById('postToGoogleBtnText'),
  googleTransitionBanner: document.getElementById('googleTransitionBanner'),
  clipboardFallbackBanner: document.getElementById('clipboardFallbackBanner'),
  transitionMessageText: document.getElementById('transitionMessageText'),
  editInputsBtn: document.getElementById('editInputsBtn'),
  errorBanner: document.getElementById('errorBanner'),
  errorMessage: document.getElementById('errorMessage'),
  closeErrorBtn: document.getElementById('closeErrorBtn'),
  toast: document.getElementById('toastNotification'),
  toastMessage: document.getElementById('toastMessage'),
  qrModal: document.getElementById('qrModal'),
  openQrModalBtn: document.getElementById('openQrModalBtn'),
  closeQrModalBtn: document.getElementById('closeQrModalBtn'),
  qrCodeGraphic: document.getElementById('qrCodeGraphic'),
  qrUrlText: document.getElementById('qrUrlText'),
  copyQrUrlBtn: document.getElementById('copyQrUrlBtn'),
};

/**
 * Fetch business configuration from /api/config
 */
async function loadConfig() {
  try {
    const data = await apiFetch('/api/config');
    if (data && data.success && data.data) {
      state.config = {
        ...state.config,
        ...data.data,
        feedbackOptions: data.data.feedbackOptions || DEFAULT_FEEDBACK_OPTIONS,
        feedbackCategories: data.data.feedbackCategories || DEFAULT_FEEDBACK_CATEGORIES,
      };
    }
  } catch (err) {
    console.warn('Using default business config due to error:', err);
  } finally {
    renderConfig();
  }
}

/**
 * Apply configuration to the DOM
 */
function renderConfig() {
  const {
    businessName,
    businessLocation,
    businessLogoUrl,
    googleReviewUrl,
    publicFeedbackUrl,
    feedbackOptions,
    feedbackCategories,
  } = state.config;

  elements.businessName.textContent = businessName;
  document.title = `${businessName} — Smart AI Review Builder`;

  if (businessLocation) {
    elements.businessLocationText.textContent = businessLocation;
    elements.businessLocationBadge.classList.remove('hidden');
  } else {
    elements.businessLocationBadge.classList.add('hidden');
  }

  const logoUrl = businessLogoUrl || '/assets/dulamobiles.jpeg';
  if (logoUrl) {
    loadCleanAvatarLogo(logoUrl);
  } else {
    elements.businessAvatar.style.backgroundImage = '';
    elements.businessAvatarText.textContent = (businessName.charAt(0) || 'D').toUpperCase();
  }

  // Google review links (Policy: always accessible)
  const targetReviewUrl = googleReviewUrl || '#';
  elements.directGoogleLink.href = targetReviewUrl;
  elements.postToGoogleBtn.href = targetReviewUrl;

  if (!googleReviewUrl) {
    elements.directGoogleLink.style.display = 'none';
  } else {
    elements.directGoogleLink.style.display = 'inline-block';
  }

  // Render Categorized Questionnaire Options
  elements.optionsContainer.innerHTML = '';
  const categories = Array.isArray(feedbackCategories) && feedbackCategories.length
    ? feedbackCategories
    : DEFAULT_FEEDBACK_CATEGORIES;

  categories.forEach((cat) => {
    const block = document.createElement('div');
    block.className = 'category-block';

    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `
      <span class="category-icon" aria-hidden="true">${cat.icon || '🏷️'}</span>
      <span class="category-title">${escapeHtml(cat.name)}</span>
    `;
    block.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'options-grid';

    (cat.options || []).forEach((option) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'option-chip' + (state.selectedOptions.has(option) ? ' selected' : '');
      chip.dataset.option = option;
      chip.innerHTML = `<span class="chip-check">✓</span><span>${escapeHtml(option)}</span>`;

      chip.addEventListener('click', () => toggleOption(option, chip));
      grid.appendChild(chip);
    });

    block.appendChild(grid);
    elements.optionsContainer.appendChild(block);
  });

  // QR Modal configuration
  const qrUrl = publicFeedbackUrl || window.location.href;
  if (elements.qrUrlText) {
    elements.qrUrlText.textContent = qrUrl;
  }
  renderQrCode(qrUrl);
}

/**
 * Loads the logo and renders it clipped to the central circular badge,
 * eliminating any black & white / grey vertical background stripes.
 */
function loadCleanAvatarLogo(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Circular clip path
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Zoom in 1.14x and align on center to exclude all outer striped border pixels
      const scale = 1.14;
      const drawW = size * scale;
      const drawH = (size * (img.naturalHeight / img.naturalWidth)) * scale;
      const drawX = (size - drawW) / 2;
      const drawY = (size - drawH) / 2 + (size * 0.015);

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      elements.businessAvatar.style.backgroundImage = `url("${canvas.toDataURL('image/png')}")`;
      elements.businessAvatar.style.backgroundSize = 'cover';
      elements.businessAvatar.style.backgroundPosition = 'center';
      elements.businessAvatarText.textContent = '';
    } catch {
      elements.businessAvatar.style.backgroundImage = `url("${url}")`;
      elements.businessAvatarText.textContent = '';
    }
  };
  img.onerror = () => {
    elements.businessAvatar.style.backgroundImage = `url("${url}")`;
    elements.businessAvatarText.textContent = '';
  };
  img.src = url;
}

/**
 * Handle Star Rating selection
 */
function setRating(rating) {
  state.rating = rating;

  elements.starButtons.forEach((btn) => {
    const val = Number(btn.dataset.rating);
    if (val <= rating) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  elements.ratingSentiment.textContent = RATING_SENTIMENTS[rating] || '';
  elements.ratingSentiment.classList.add('highlighted');

  elements.generateBtn.disabled = false;
  hideError();
}

/**
 * Handle questionnaire option toggle
 */
function toggleOption(option, chipElement) {
  if (state.selectedOptions.has(option)) {
    state.selectedOptions.delete(option);
    chipElement.classList.remove('selected');
  } else {
    state.selectedOptions.add(option);
    chipElement.classList.add('selected');
  }
}

/**
 * Character counter for comment
 */
function handleCommentInput() {
  const len = elements.commentInput.value.length;
  elements.charCounter.textContent = `${len} / 1000`;
}

/**
 * Submit feedback and generate AI review draft
 */
async function generateReview() {
  if (!state.rating) {
    showError('Please select a star rating first.');
    return;
  }

  hideError();
  setGenerating(true);

  try {
    // 1. Submit original feedback
    const feedbackPayload = {
      rating: state.rating,
      selectedOptions: Array.from(state.selectedOptions),
      comment: elements.commentInput.value.trim(),
    };

    const createData = await apiFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackPayload),
    });

    if (!createData.success || !createData.data?.id) {
      throw new Error(createData.message || 'Failed to submit feedback');
    }

    state.feedbackId = createData.data.id;

    // 2. Request AI review generation
    await requestGeneration({ regenerate: false });
  } catch (err) {
    showError(err.message || 'Unable to generate review suggestion. You can still leave a review directly on Google.');
    setGenerating(false);
  }
}

/**
 * Request generation (initial or regeneration)
 */
async function requestGeneration({ regenerate = false } = {}) {
  if (!state.feedbackId) return;

  if (regenerate) {
    elements.regenerateBtn.disabled = true;
    elements.regenerateBtn.querySelector('span').textContent = 'Generating...';
  }

  try {
    const genData = await apiFetch(`/api/feedback/${state.feedbackId}/generate-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerate }),
    });

    if (!genData.success || !genData.data?.generatedReview) {
      throw new Error(genData.message || 'Failed to generate review draft');
    }

    state.generatedReview = genData.data.generatedReview;
    elements.generatedReviewTextarea.value = state.generatedReview;
    updateWordCount(state.generatedReview);

    if (genData.data.googleReviewUrl) {
      state.config.googleReviewUrl = genData.data.googleReviewUrl;
      elements.postToGoogleBtn.href = genData.data.googleReviewUrl;
      elements.directGoogleLink.href = genData.data.googleReviewUrl;
    }

    // Show result
    elements.feedbackFormSection.classList.add('hidden');
    elements.loadingSection.classList.add('hidden');
    elements.resultSection.classList.remove('hidden');
    if (elements.googleTransitionBanner) elements.googleTransitionBanner.classList.add('hidden');
    if (elements.clipboardFallbackBanner) elements.clipboardFallbackBanner.classList.add('hidden');

    if (regenerate) {
      showToast('Fresh review draft generated!');
    }
  } catch (err) {
    showError(err.message || 'Failed to generate review draft.');
  } finally {
    setGenerating(false);
    if (regenerate) {
      elements.regenerateBtn.disabled = false;
      elements.regenerateBtn.querySelector('span').textContent = 'Regenerate';
    }
  }
}

/**
 * Update word count display
 */
function updateWordCount(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  elements.draftWordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
}

/**
 * Set generation UI state
 */
function setGenerating(isGenerating) {
  state.isGenerating = isGenerating;
  if (isGenerating) {
    elements.feedbackFormSection.classList.add('hidden');
    elements.resultSection.classList.add('hidden');
    elements.loadingSection.classList.remove('hidden');
  } else {
    elements.loadingSection.classList.add('hidden');
  }
}

/**
 * Return to form to modify inputs
 */
function returnToInputs() {
  elements.resultSection.classList.add('hidden');
  elements.feedbackFormSection.classList.remove('hidden');
  if (elements.googleTransitionBanner) elements.googleTransitionBanner.classList.add('hidden');
  if (elements.clipboardFallbackBanner) elements.clipboardFallbackBanner.classList.add('hidden');
  hideError();
}

/**
 * Robust clipboard helper supporting modern navigator.clipboard and legacy execCommand.
 * Preserves the full, complete review text without any truncation or word limits.
 * Returns true if successful, false otherwise.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyTextToClipboard(text) {
  if (typeof text !== 'string' || text.length === 0) return false;

  // 1. Modern Clipboard API (Chrome, Safari, Firefox, Edge in secure contexts / localhost)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText threw, falling back to selection copy:', err);
    }
  }

  // 2. Select existing textarea and run execCommand('copy')
  try {
    const textarea = elements.generatedReviewTextarea;
    if (textarea) {
      if (textarea.value !== text) {
        textarea.value = text;
      }
      textarea.focus();
      textarea.select();
      if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(0, textarea.value.length);
      }
      const successful = document.execCommand('copy');
      if (successful) return true;
    }
  } catch (err) {
    console.warn('execCommand on review textarea failed:', err);
  }

  // 3. Fallback offscreen textarea (for iOS Safari or environments with restricted direct focus)
  try {
    const tempEl = document.createElement('textarea');
    tempEl.value = text;
    tempEl.setAttribute('readonly', '');
    tempEl.style.position = 'fixed';
    tempEl.style.left = '-9999px';
    tempEl.style.top = '-9999px';
    document.body.appendChild(tempEl);
    tempEl.focus();
    tempEl.select();
    if (typeof tempEl.setSelectionRange === 'function') {
      tempEl.setSelectionRange(0, text.length);
    }
    const successful = document.execCommand('copy');
    document.body.removeChild(tempEl);
    return Boolean(successful);
  } catch (err) {
    console.warn('offscreen textarea copy failed:', err);
    return false;
  }
}

/**
 * Copy generated review to clipboard
 */
async function copyReview() {
  const textarea = elements.generatedReviewTextarea;
  // Always read current edited value directly from the DOM textarea to preserve all user modifications
  const text = textarea ? textarea.value : state.generatedReview;
  if (!text || !text.trim()) {
    showError('Review draft is empty.');
    return;
  }

  // Keep state synchronized
  state.generatedReview = text;

  const copied = await copyTextToClipboard(text);

  if (copied) {
    elements.copyBtnText.textContent = 'Copied!';
    elements.copyReviewBtn.style.borderColor = '#16a34a';
    elements.copyReviewBtn.style.color = '#16a34a';

    if (elements.clipboardFallbackBanner) {
      elements.clipboardFallbackBanner.classList.add('hidden');
    }
    if (elements.googleTransitionBanner) {
      elements.googleTransitionBanner.classList.remove('hidden');
    }

    showToast('Your review has been copied. On Google, select your star rating, paste your review, and submit it.');

    setTimeout(() => {
      elements.copyBtnText.textContent = 'Copy Review';
      elements.copyReviewBtn.style.borderColor = '';
      elements.copyReviewBtn.style.color = '';
    }, 2500);
  } else {
    // Clipboard failed: keep review text visible and intact!
    if (elements.googleTransitionBanner) {
      elements.googleTransitionBanner.classList.add('hidden');
    }
    if (elements.clipboardFallbackBanner) {
      elements.clipboardFallbackBanner.classList.remove('hidden');
    }
    elements.generatedReviewTextarea.focus();
    elements.generatedReviewTextarea.select();
    showError('Could not auto-copy. We selected your review text above — please copy it manually.');
  }
}

/**
 * Handle "Post a Review on Google" click:
 * 1. Reads current edited review directly from the textarea (preserving exact edits, spacing, and full length).
 * 2. Copies complete review draft to clipboard without any arbitrary 10-word limit or truncation.
 * 3. Shows mobile-friendly transition banner & toast with exact step instructions:
 *    "Your review has been copied. On Google, select your star rating, paste your review, and submit it."
 * 4. Opens configured GOOGLE_REVIEW_URL in new tab/window without modifying it.
 * 5. If clipboard fails, keeps draft intact, highlights it, and displays manual copy fallback banner.
 */
async function handlePostToGoogle(e) {
  if (e) e.preventDefault();

  const textarea = elements.generatedReviewTextarea;
  // Always read current edited value directly from the DOM textarea, preserving the full complete review
  const currentEditedReview = textarea ? textarea.value : state.generatedReview;
  const targetUrl = state.config.googleReviewUrl;

  if (!targetUrl || targetUrl === '#') {
    showError('Google Review link is not configured yet.');
    return;
  }

  if (!currentEditedReview || !currentEditedReview.trim()) {
    showError('Review draft is empty. Please enter or generate a review first.');
    return;
  }

  // Keep state synchronized with edited text
  state.generatedReview = currentEditedReview;

  const copied = await copyTextToClipboard(currentEditedReview);

  if (copied) {
    if (elements.clipboardFallbackBanner) {
      elements.clipboardFallbackBanner.classList.add('hidden');
    }
    if (elements.googleTransitionBanner) {
      elements.googleTransitionBanner.classList.remove('hidden');
    }
    showToast('Your review has been copied. On Google, select your star rating, paste your review, and submit it.');
  } else {
    // Keep draft intact and visible, select text
    if (elements.googleTransitionBanner) {
      elements.googleTransitionBanner.classList.add('hidden');
    }
    if (elements.clipboardFallbackBanner) {
      elements.clipboardFallbackBanner.classList.remove('hidden');
    }
    elements.generatedReviewTextarea.focus();
    elements.generatedReviewTextarea.select();
    showToast('⚠️ Manual copy needed. Your review draft is highlighted above.');
  }

  // Open the configured GOOGLE_REVIEW_URL without modifying parameters
  const newWin = window.open(targetUrl, '_blank', 'noopener,noreferrer');
  if (!newWin) {
    window.location.href = targetUrl;
  }
}

/**
 * Display toast notification
 */
let toastTimeout;
function showToast(msg) {
  elements.toastMessage.textContent = msg;
  elements.toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3200);
}

/**
 * Display error banner
 */
function showError(msg) {
  elements.errorMessage.textContent = msg;
  elements.errorBanner.classList.remove('hidden');
}

function hideError() {
  elements.errorBanner.classList.add('hidden');
}

/**
 * Render Google-Themed Scannable QR Code
 */
function renderQrCode(url) {
  if (!elements.qrCodeGraphic) return;
  try {
    const qrSvg = generateGoogleThemedQrSvg(url, {
      size: 240,
      logoUrl: state.config?.businessLogoUrl || '/assets/dulamobiles.jpeg',
    });
    elements.qrCodeGraphic.innerHTML = qrSvg;
  } catch (err) {
    console.error('Failed to generate Google-themed QR code:', err);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Event Listeners
elements.starButtons.forEach((btn) => {
  btn.addEventListener('click', () => setRating(Number(btn.dataset.rating)));
  btn.addEventListener('mouseenter', () => {
    const val = Number(btn.dataset.rating);
    elements.starButtons.forEach((b) => {
      if (Number(b.dataset.rating) <= val) {
        b.style.color = 'var(--gold-hover)';
      }
    });
  });
  btn.addEventListener('mouseleave', () => {
    elements.starButtons.forEach((b) => {
      b.style.color = '';
    });
  });
});

elements.commentInput.addEventListener('input', handleCommentInput);
elements.generateBtn.addEventListener('click', generateReview);
elements.regenerateBtn.addEventListener('click', () => requestGeneration({ regenerate: true }));
elements.copyReviewBtn.addEventListener('click', copyReview);
elements.postToGoogleBtn.addEventListener('click', handlePostToGoogle);
elements.editInputsBtn.addEventListener('click', returnToInputs);
elements.closeErrorBtn.addEventListener('click', hideError);

elements.generatedReviewTextarea.addEventListener('input', () => {
  state.generatedReview = elements.generatedReviewTextarea.value;
  updateWordCount(elements.generatedReviewTextarea.value);
});

// Standee QR Modal Events
elements.openQrModalBtn.addEventListener('click', () => elements.qrModal.classList.remove('hidden'));
elements.closeQrModalBtn.addEventListener('click', () => elements.qrModal.classList.add('hidden'));
elements.qrModal.addEventListener('click', (e) => {
  if (e.target === elements.qrModal) elements.qrModal.classList.add('hidden');
});

if (elements.copyQrUrlBtn) {
  elements.copyQrUrlBtn.addEventListener('click', async () => {
    const textToCopy = elements.qrUrlText?.textContent || state.config?.publicFeedbackUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(textToCopy);
      const btnText = document.getElementById('copyQrBtnText');
      if (btnText) btnText.textContent = 'Copied!';
      setTimeout(() => {
        if (btnText) btnText.textContent = 'Copy Link';
      }, 2000);
      showToast('Review URL copied to clipboard!');
    } catch {
      // fallback
    }
  });
}

// Boot
loadConfig();

