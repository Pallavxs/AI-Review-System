/**
 * Review options and categories for the Smart AI Google Review Builder.
 * Tailored for mobile sales, accessories, and repair services in Anuppur, MP.
 */

export const FEEDBACK_CATEGORIES = Object.freeze([
  {
    name: 'Mobile Phones',
    icon: '📱',
    options: Object.freeze([
      'Online se bhi kam rate mein phone mile',
      'Achhi quality ke saath sabhi tarah ke phones available hain',
      'Anuppur ki best mobile shop',
      'Anuppur mein sabse kam rate par phones milte hain',
    ]),
  },
  {
    name: 'Mobile Accessories',
    icon: '🎧',
    options: Object.freeze([
      'Original mobile accessories milte hain',
      'Premium quality ke phone covers milte hain',
      'Phone covers reasonable rate mein milte hain',
      'Anuppur mein mobile accessories ki best variety hai',
    ]),
  },
  {
    name: 'Mobile Repairing',
    icon: '🔧',
    options: Object.freeze([
      'Kam rate mein achhi mobile repairing hoti hai',
      'Original parts available hain',
      'Anuppur mein original mobile displays milte hain',
      'Anuppur mein fast mobile repairing service milti hai',
    ]),
  },
]);

/**
 * Legacy options retained for full backward compatibility with existing tests, historical records,
 * and previously stored English feedback submissions.
 */
export const LEGACY_FEEDBACK_OPTIONS = Object.freeze([
  // Legacy English mobile shop options
  'Phones at prices lower than online stores',
  'Wide range of phones available with good quality',
  'Best mobile phone shop in Anuppur',
  'Mobile phones at the lowest prices in Anuppur',
  'Original mobile accessories',
  'Premium-quality phone covers',
  'Phone covers at reasonable prices',
  'Best variety of mobile accessories in Anuppur',
  'Affordable and high-quality mobile repairing',
  'Original replacement parts available',
  'Original mobile displays available in Anuppur',
  'Fast mobile repair service in Anuppur',
  // General baseline feedback options
  'Friendly staff',
  'Good service',
  'Product quality',
  'Affordable pricing',
  'Clean environment',
  'Quick response',
]);

/** Flat list of all 12 mobile shop Hinglish options */
export const MOBILE_SHOP_FEEDBACK_OPTIONS = Object.freeze(
  FEEDBACK_CATEGORIES.flatMap((cat) => cat.options)
);

/** Comprehensive set of all accepted feedback strings (Hinglish + legacy English) */
export const ALLOWED_FEEDBACK_OPTIONS = Object.freeze([
  ...new Set([...MOBILE_SHOP_FEEDBACK_OPTIONS, ...LEGACY_FEEDBACK_OPTIONS]),
]);

export const GENERATION_STATUS = Object.freeze({
  IDLE: 'idle',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
});
