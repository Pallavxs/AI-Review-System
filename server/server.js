/**
 * server.js — entry point for the Smart AI Google Review backend
 */

import connectDB from './src/config/db.js';
import app from './src/app.js';
import config from './src/config/index.js';

await connectDB();

const server = app.listen(config.port, () => {
  console.log(`Server running in ${config.env} mode on port ${config.port}`);
  console.log(`Web App & API: http://localhost:${config.port}/`);
  console.log(`Health check: http://localhost:${config.port}/api/health`);
});

const shutdown = (signal) => {
  console.log(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
