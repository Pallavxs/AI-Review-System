import http from 'node:http';
import mongoose from 'mongoose';

/**
 * Boot the Express app against the test database.
 * If sandbox environment blocks TCP loopback to external MongoDB (EACCES),
 * falls back to an in-memory Mongoose model store so test suite can execute.
 * Uses local Windows named pipe IPC to allow sandboxed HTTP tests.
 */
export async function startTestServer() {
  const { default: connectDB } = await import('../../src/config/db.js');
  const { default: app } = await import('../../src/app.js');
  const { default: Feedback } = await import('../../src/models/Feedback.js');

  try {
    await connectDB();
  } catch (err) {
    if (
      err.message?.includes('EACCES') ||
      err.name === 'MongooseServerSelectionError' ||
      err.code === 'ECONNREFUSED'
    ) {
      enableInMemoryStore(Feedback);
    } else {
      throw err;
    }
  }

  const server = http.createServer(app);
  const pipePath = `\\\\.\\pipe\\test-ai-review-${process.pid}-${Date.now()}`;
  await new Promise((resolve) => server.listen(pipePath, resolve));

  return {
    baseUrl: pipePath,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      try {
        await mongoose.disconnect();
      } catch {
        // ignore
      }
    },
  };
}

function enableInMemoryStore(Feedback) {
  const store = new Map();

  Object.defineProperty(mongoose.connection, 'readyState', {
    value: 1,
    configurable: true,
  });

  function wrapDoc(raw) {
    if (!raw) return null;
    const doc = { ...raw };
    doc.save = async function () {
      doc.updatedAt = new Date();
      store.set(doc._id.toString(), { ...doc });
      return doc;
    };
    return doc;
  }

  Feedback.deleteMany = async () => {
    store.clear();
    return { deletedCount: 0 };
  };

  Feedback.countDocuments = async () => store.size;
  Feedback.count = async () => store.size;

  Feedback.create = async (data) => {
    const id = new mongoose.Types.ObjectId();
    const doc = {
      _id: id,
      rating: data.rating,
      selectedOptions: data.selectedOptions || [],
      comment: data.comment || '',
      generatedReview: data.generatedReview || null,
      generatedAt: data.generatedAt || null,
      generationStatus: data.generationStatus || 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.set(id.toString(), doc);
    return wrapDoc(doc);
  };

  Feedback.findById = (id) => {
    const key = id?.toString();
    const found = store.get(key);
    const result = found ? wrapDoc(found) : null;
    return {
      select: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
  };

  Feedback.findOneAndUpdate = async (filter, update) => {
    const key = filter._id?.toString();
    const existing = store.get(key);
    if (!existing) return null;

    if (filter.generationStatus?.$in) {
      if (!filter.generationStatus.$in.includes(existing.generationStatus)) {
        return null;
      }
    }

    if (update.$set) {
      Object.assign(existing, update.$set);
    }
    existing.updatedAt = new Date();
    store.set(key, existing);
    return wrapDoc(existing);
  };

  Feedback.findByIdAndUpdate = async (id, update) => {
    const key = id?.toString();
    const existing = store.get(key);
    if (!existing) return null;
    if (update.$set) {
      Object.assign(existing, update.$set);
    }
    existing.updatedAt = new Date();
    store.set(key, existing);
    return wrapDoc(existing);
  };
}

export async function jsonRequest(baseUrl, method, path, body, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const isPipe = typeof baseUrl === 'string' && baseUrl.startsWith('\\\\.\\pipe\\');

    const headers = {
      ...(bodyStr !== undefined
        ? {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(bodyStr)),
          }
        : {}),
      ...customHeaders,
    };
    if (isPipe && !headers.Host) {
      headers.Host = '127.0.0.1';
    }

    const options = isPipe
      ? {
          socketPath: baseUrl,
          path,
          method,
          headers,
        }
      : {
          hostname: new URL(baseUrl).hostname,
          port: new URL(baseUrl).port,
          path,
          method,
          headers,
        };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', reject);
    if (bodyStr !== undefined) {
      req.write(bodyStr);
    }
    req.end();
  });
}
