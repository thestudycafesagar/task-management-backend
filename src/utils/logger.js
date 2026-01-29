/**
 * Production-ready Logger Utility
 * Only logs in development or for critical errors in production
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Debug log - only shows in development
 */
export const debug = (...args) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

/**
 * Info log - only shows in development
 */
export const info = (...args) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

/**
 * Warning log - shows in development, silent in production
 */
export const warn = (...args) => {
  if (isDevelopment) {
    console.warn(...args);
  }
};

/**
 * Error log - always shows (critical for debugging production issues)
 */
export const error = (...args) => {
  console.error(...args);
};

/**
 * Startup log - only shows once during server startup
 */
export const startup = (...args) => {
  // Always show startup messages (server initialization)
  console.log(...args);
};

export default {
  debug,
  info,
  warn,
  error,
  startup
};
