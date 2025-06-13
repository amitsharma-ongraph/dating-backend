// src/shared/handlers/errorHandler.js
const config = require('../../configs/envConfig.js');
const ApiError = require('../../utils/apiError.js');
const { StatusCodes } = require('http-status-codes');
const { logger } = require('../../utils/logger');

/**
 * Error Converter Middleware
 *
 * Converts non-ApiError instances to ApiError, ensuring
 * standardized error format for the error handler
 *
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const errorConverter = (err, req, res, next) => {
  let error = err;

  // Skip conversion if already ApiError
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error.message || 'Something went wrong';
    const isOperational = false;

    error = new ApiError(statusCode, message, isOperational, null, err.stack);
  }

  next(error);
};

/**
 * Error Handler Middleware
 *
 * Final error handling middleware that sends error response
 * and logs errors appropriately
 *
 * @param {ApiError} err - The API error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const errorHandler = (err, req, res, _next) => {
  const { statusCode, message, isOperational } = err;

  // Store error stack in response locals for Morgan logger
  res.locals.errorStack = err.stack;
  res.locals.errorMessage = message;

  // Use enhanced error logging for detailed logs
  logger.logError(err, req);

  // Create error response
  const response = {
    success: false,
    message,
    data: null,
    errorCode: statusCode,
    ...(err.errors && { errors: err.errors })
  };

  // Add stack trace in development
  if (config.server.env === 'development' && !isOperational) {
    response.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(response);
};

/**
 * 404 Not Found Handler
 *
 * Handles routes that don't exist in the application
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(
    StatusCodes.NOT_FOUND,
    `Cannot ${req.method} ${req.originalUrl}`,
    true
  );
  next(error);
};

module.exports = {
  errorConverter,
  errorHandler,
  notFoundHandler
};
