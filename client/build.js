import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read VITE_API_BASE_URL from environment or fallback to Railway production backend
const apiBaseUrl = (
  process.env.VITE_API_BASE_URL || 'https://dulemobiles.up.railway.app'
).trim().replace(/\/+$/, '');

const content = `// Auto-generated runtime environment configuration
window.__ENV__ = window.__ENV__ || {};
window.__ENV__.VITE_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};
`;

fs.writeFileSync(path.join(__dirname, 'env.js'), content, 'utf8');
console.log(`[build] Successfully generated env.js with VITE_API_BASE_URL = "${apiBaseUrl}"`);

