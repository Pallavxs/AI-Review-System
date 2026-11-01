import config from '../config/index.js';

/**
 * Central Express error handler.
 * Logs details server-side; never returns stack traces or DB internals to clients.
 */
const globalErrorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid id format';
  }

  if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate record';
  }

  // CORS errors from the cors package
  if (typeof message === 'string' && message.startsWith('CORS:')) {
    statusCode = 403;
  }

  if (config.env !== 'production' && config.env !== 'test') {
    console.error(err);
  } else if (config.env === 'production') {
    console.error({
      message: err.message,
      code: err.code,
      path: req.originalUrl,
    });
  }

  // Never expose stacks or mongoose internals in the HTTP response
  if (statusCode >= 500) {
    message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
};

export default globalErrorHandler;
