import test from 'node:test';
import assert from 'node:assert/strict';
import { getApiBaseUrl, buildApiUrl, apiFetch } from '../api-client.js';

test('buildApiUrl normalizes trailing and leading slashes without double slashes', () => {
  const railway = 'https://dulemobiles.up.railway.app';

  // Base without slash, path with slash
  assert.equal(
    buildApiUrl('/api/feedback', railway),
    'https://dulemobiles.up.railway.app/api/feedback'
  );

  // Base with trailing slash, path with leading slash
  assert.equal(
    buildApiUrl('/api/feedback', 'https://dulemobiles.up.railway.app/'),
    'https://dulemobiles.up.railway.app/api/feedback'
  );

  // Base with multiple trailing slashes, path without leading slash
  assert.equal(
    buildApiUrl('api/feedback', 'https://dulemobiles.up.railway.app///'),
    'https://dulemobiles.up.railway.app/api/feedback'
  );

  // Endpoint for generate-review
  assert.equal(
    buildApiUrl('/api/feedback/672583e74b33b0ec46be2201/generate-review', railway),
    'https://dulemobiles.up.railway.app/api/feedback/672583e74b33b0ec46be2201/generate-review'
  );

  // Endpoint for config
  assert.equal(
    buildApiUrl('/api/config', railway),
    'https://dulemobiles.up.railway.app/api/config'
  );

  // Empty base defaults to relative path
  assert.equal(buildApiUrl('/api/feedback', ''), '/api/feedback');
  assert.equal(buildApiUrl('api/feedback', ''), '/api/feedback');
});

test('getApiBaseUrl resolves Railway backend URL when hosted on Vercel domain', () => {
  const origWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        hostname: 'dulamobiles.vercel.app',
        port: '',
      },
    };

    assert.equal(getApiBaseUrl(), 'https://dulemobiles.up.railway.app');
    assert.equal(
      buildApiUrl('/api/feedback'),
      'https://dulemobiles.up.railway.app/api/feedback'
    );
  } finally {
    globalThis.window = origWindow;
  }
});

test('getApiBaseUrl never falls back to Vercel origin or localhost in production on any domain', () => {
  const origWindow = globalThis.window;
  try {
    // Custom domain
    globalThis.window = {
      location: {
        hostname: 'dulamobiles.com',
        port: '',
      },
    };
    assert.equal(getApiBaseUrl(), 'https://dulemobiles.up.railway.app');

    // Preview domain
    globalThis.window.location.hostname = 'dulamobiles-preview-git-fix.vercel.app';
    assert.equal(getApiBaseUrl(), 'https://dulemobiles.up.railway.app');
  } finally {
    globalThis.window = origWindow;
  }
});

test('getApiBaseUrl resolves relative path on local dev server (port 5173 or 5000)', () => {
  const origWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        hostname: 'localhost',
        port: '5173',
      },
    };
    assert.equal(getApiBaseUrl(), '');
    assert.equal(buildApiUrl('/api/feedback'), '/api/feedback');

    globalThis.window.location.port = '5000';
    assert.equal(getApiBaseUrl(), '');
    assert.equal(buildApiUrl('/api/feedback'), '/api/feedback');
  } finally {
    globalThis.window = origWindow;
  }
});

test('getApiBaseUrl respects window.__ENV__.VITE_API_BASE_URL when present', () => {
  const origWindow = globalThis.window;
  try {
    globalThis.window = {
      __ENV__: {
        VITE_API_BASE_URL: 'https://custom-backend.railway.app/',
      },
      location: {
        hostname: 'dulamobiles.vercel.app',
        port: '',
      },
    };
    assert.equal(getApiBaseUrl(), 'https://custom-backend.railway.app');
    assert.equal(
      buildApiUrl('/api/feedback'),
      'https://custom-backend.railway.app/api/feedback'
    );
  } finally {
    globalThis.window = origWindow;
  }
});

test('apiFetch parses successful JSON responses correctly', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://dulemobiles.up.railway.app/api/feedback');
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        status: 201,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          success: true,
          data: { id: 'test-feedback-id-123' },
        }),
      };
    };

    const res = await apiFetch('/api/feedback', { method: 'POST' }, 'https://dulemobiles.up.railway.app');
    assert.equal(res.success, true);
    assert.equal(res.data.id, 'test-feedback-id-123');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('apiFetch handles Vercel 404 plain-text response without throwing JSON parse error', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'NOT FOUND',
      headers: new Map([['content-type', 'text/plain; charset=utf-8']]),
      text: async () => 'The page could not be found',
      json: async () => {
        throw new SyntaxError(`Unexpected token 'T', "The page c"... is not valid JSON`);
      },
    });

    await assert.rejects(
      async () => {
        await apiFetch('/api/feedback', { method: 'POST' }, 'https://dulemobiles.up.railway.app');
      },
      (err) => {
        // Must NOT throw "Unexpected token 'T'..."
        assert.ok(!err.message.includes('Unexpected token'));
        assert.ok(!err.message.includes('not valid JSON'));
        // Must contain descriptive message or text
        assert.equal(err.message, 'The page could not be found');
        assert.equal(err.status, 404);
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('apiFetch rejects non-JSON 200 OK responses (e.g. SPA index.html fallback)', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html; charset=utf-8']]),
      text: async () => '<!DOCTYPE html><html><body>SPA Fallback</body></html>',
    });

    await assert.rejects(
      async () => {
        await apiFetch('/api/feedback', { method: 'POST' }, 'https://dulemobiles.up.railway.app');
      },
      (err) => {
        assert.ok(err.message.includes('non-JSON response'));
        assert.ok(err.message.includes('200'));
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('apiFetch preserves genuine backend validation and rate-limit error messages', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({
        success: false,
        message: 'rating is required and must be an integer between 1 and 5',
      }),
    });

    await assert.rejects(
      async () => {
        await apiFetch('/api/feedback', { method: 'POST' }, 'https://dulemobiles.up.railway.app');
      },
      (err) => {
        assert.equal(err.message, 'rating is required and must be an integer between 1 and 5');
        assert.equal(err.status, 400);
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('apiFetch gracefully handles network errors', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };

    await assert.rejects(
      async () => {
        await apiFetch('/api/feedback', { method: 'POST' }, 'https://dulemobiles.up.railway.app');
      },
      (err) => {
        assert.equal(err.isNetworkError, true);
        assert.ok(err.message.includes('Unable to connect to the server'));
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('apiFetch gracefully handles request timeouts', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    };

    await assert.rejects(
      async () => {
        await apiFetch('/api/feedback', { method: 'POST', timeout: 50 }, 'https://dulemobiles.up.railway.app');
      },
      (err) => {
        assert.equal(err.isTimeout, true);
        assert.ok(err.message.includes('timed out'));
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});
