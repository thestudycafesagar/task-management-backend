import AppError from '../utils/appError.js';

/**
 * Centralized error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Always log errors to console for debugging
  console.error('═══════════════════════════════════════');
  console.error('⚠️  ERROR OCCURRED');
  console.error('═══════════════════════════════════════');
  console.error('Time:', new Date().toISOString());
  console.error('Path:', req.originalUrl);
  console.error('Method:', req.method);
  console.error('Status Code:', err.statusCode);
  console.error('Error Name:', err.name);
  console.error('Error Message:', err.message);
  if (err.stack) {
    console.error('Stack Trace:');
    console.error(err.stack);
  }
  if (err.errors) {
    console.error('Validation Errors:', JSON.stringify(err.errors, null, 2));
  }
  console.error('═══════════════════════════════════════\n');

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    // Production error response
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {
      // Programming or unknown error: don't leak error details
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong!'
      });
    }
  }
};

export default errorHandler;
