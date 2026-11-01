/**
 * Smart AI Google Review Builder — Centralized API Client
 *
 * Handles:
 * 1. Base URL resolution from import.meta.env.VITE_API_BASE_URL, runtime config (window.__ENV__),
 *    or production domain defaults.
 * 2. URL normalization (avoiding duplicate or missing slashes).
 * 3. Safe response parsing (never blindly calling response.json()).
 * 4. Graceful handling of non-JSON responses, HTTP errors, timeouts, and network connection drops.
 */

const DEFAULT_PRODUCTION_BACKEND = 'https://dulemobiles.up.railway.app';

/**
 * Resolves the backend API base URL with fallback precedence:
 * 1. Build-time Vite / bundler env variable (import.meta.env.VITE_API_BASE_URL)
 * 2. Runtime window config (window.__ENV__?.VITE_API_BASE_URL from env.js)
 * 3. Environment detection:
 *    - In browser on localhost / 127.0.0.1:
 *        - port 5173 (dev proxy) or port 5000: returns '' (relative to local server)
 *        - other ports: 'http://localhost:5000'
 *    - Any production host (Vercel, custom domain): 'https://dulemobiles.up.railway.app'
 * 4. Fallback: 'https://dulemobiles.up.railway.app'
 *
 * Normalizes trailing slashes.
 *
 * @returns {string} Clean base URL without trailing slash
 */
export function getApiBaseUrl() {
  // 1. Build-time Vite / bundler define env var
  try {
    if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL) {
      const viteUrl = String(import.meta.env.VITE_API_BASE_URL).trim();
      if (viteUrl) {
        return viteUrl.replace(/\/+$/, '');
      }
    }
  } catch {
    // import.meta.env not accessible in this environment
  }

  // 2. Runtime window config (e.g. from env.js or injected script)
  if (typeof window !== 'undefined' && window.__ENV__?.VITE_API_BASE_URL) {
    const winUrl = String(window.__ENV__.VITE_API_BASE_URL).trim();
    if (winUrl) {
      return winUrl.replace(/\/+$/, '');
    }
  }

  // 3. Domain detection in browser environment
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, port } = window.location;

    // Local development strictly on localhost / 127.0.0.1
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local');

    if (isLocalhost) {
      if (port === '5173' || port === '5000') {
        return '';
      }
      return 'http://localhost:5000';
    }

    // In production (Vercel, custom domain, mobile web), default to deployed Railway backend
    return DEFAULT_PRODUCTION_BACKEND;
  }

  return DEFAULT_PRODUCTION_BACKEND;
}

/**
 * Normalizes and builds a full or relative API endpoint URL.
 * Ensures no double slashes between base URL and endpoint path.
 *
 * @param {string} path - API endpoint path, e.g. '/api/feedback' or 'api/feedback'
 * @param {string} [customBase] - Optional custom base URL override (useful for testing)
 * @returns {string} - Clean normalized URL
 */
export function buildApiUrl(path, customBase) {
  const base = customBase !== undefined ? customBase : getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!base) {
    return normalizedPath;
  }

  const cleanBase = base.replace(/\/+$/, '');
  return `${cleanBase}${normalizedPath}`;
}

/**
 * Safe API fetch wrapper:
 * - Constructs correct absolute/relative URL using configured base URL
 * - Does NOT blindly call response.json()
 * - Checks HTTP status and response Content-Type
 * - Gracefully extracts error messages from JSON or plain text / HTML responses
 * - Throws descriptive Error without crashing the UI
 * - Handles request timeouts and network connection drops
 *
 * @param {string} path - API endpoint path (e.g. '/api/feedback')
 * @param {RequestInit & { timeout?: number }} [options] - fetch options
 * @param {string} [customBase] - Optional custom base URL override
 * @returns {Promise<any>} - Parsed response data
 */
export async function apiFetch(path, options = {}, customBase) {
  const url = buildApiUrl(path, customBase);

  const timeoutMs = Number(options.timeout) || 20000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    const fetchOptions = {
      ...options,
      signal: options.signal || controller.signal,
    };
    response = await fetch(url, fetchOptions);
  } catch (netErr) {
    if (netErr?.name === 'AbortError') {
      const error = new Error('Request timed out. Please verify your connection or try again.');
      error.isTimeout = true;
      throw error;
    }
    const error = new Error(
      'Unable to connect to the server. Please check your internet connection or try again.'
    );
    error.isNetworkError = true;
    error.originalError = netErr;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers?.get?.('content-type') || '';
  const isJson = contentType.includes('application/json');

  let responseBody = null;
  if (isJson) {
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }
  } else {
    try {
      responseBody = await response.text();
    } catch {
      responseBody = '';
    }
  }

  // Handle HTTP error responses (4xx, 5xx)
  if (!response.ok) {
    let errorMsg = '';

    if (isJson && responseBody && typeof responseBody === 'object') {
      errorMsg = responseBody.message || responseBody.error || '';
    }

    if (!errorMsg && typeof responseBody === 'string' && responseBody.trim()) {
      // If it's a short text message (e.g. "The page could not be found"), sanitize and extract
      const cleanText = responseBody.trim().replace(/<[^>]+>/g, '').trim();
      if (cleanText.length > 0 && cleanText.length <= 150) {
        errorMsg = cleanText;
      }
    }

    if (!errorMsg) {
      if (response.status === 404) {
        errorMsg = 'API endpoint not found (HTTP 404). Please ensure the backend is running.';
      } else if (response.status === 502) {
        errorMsg = 'Backend server is temporarily unavailable (HTTP 502). Please try again shortly.';
      } else if (response.status === 503) {
        errorMsg = 'Service temporarily unavailable (HTTP 503). Please try again later.';
      } else if (response.status === 504) {
        errorMsg = 'Request timed out (HTTP 504). Please try again.';
      } else {
        errorMsg = `Server error (HTTP ${response.status}). Please try again.`;
      }
    }

    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = responseBody;
    throw error;
  }

  // If response is marked 200 OK but returned non-JSON (e.g. SPA fallback index.html)
  if (!isJson) {
    throw new Error(
      `Received non-JSON response from server (HTTP ${response.status}). The requested API endpoint may not exist.`
    );
  }

  // If response is JSON with { success: false }
  if (responseBody && typeof responseBody === 'object' && responseBody.success === false) {
    const error = new Error(responseBody.message || 'API request failed.');
    error.status = response.status;
    error.code = responseBody.code;
    error.data = responseBody.data;
    throw error;
  }

  return responseBody;
}
