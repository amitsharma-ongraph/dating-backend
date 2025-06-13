// src/utils/apiError.js
const { StatusCodes, getReasonPhrase } = require('http-status-codes');
const config = require('../configs/envConfig.js');

class ApiError extends Error {
  /**
   * Creates a new API error
   *
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Human-readable error message
   * @param {boolean} isOperational - Indicates if the error is expected/handled
   * @param {Object|null} errors - Extra error details (e.g. validation errors)
   * @param {string|null} stack - Optional stack trace
   */
  constructor(
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR,
    message = getReasonPhrase(statusCode),
    isOperational = true,
    errors = null,
    stack = ''
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.message = message;
    this.isOperational = isOperational;
    this.errors = errors;
    this.timestamp = new Date().toISOString();

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a safe JSON representation of the error
   */
  toJSON() {
    const serialized = {
      success: false,
      status: 'error',
      statusCode: this.statusCode,
      message: this.message,
      timestamp: this.timestamp,
      ...(this.errors && { errors: this.errors })
    };

    if (config.server.env === 'development' && this.stack) {
      serialized.stack = this.stack;
    }

    return serialized;
  }
}

module.exports = ApiError;
