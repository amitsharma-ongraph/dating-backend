// src/shared/handlers/asyncHandler.js

/**
 * Wraps an async route handler to catch and forward errors to Express error handler
 * Eliminates the need for try/catch blocks in route handlers
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    next(error);
  });
};

module.exports = asyncHandler;
