// src/shared/handlers/responseHandler.js
const { StatusCodes } = require('http-status-codes');

/**
 * Response Handler - Methods for standardized API responses
 */
const ResponseHandler = {
  /**
   * Send a success response
   * @param {Object} res - Express response object
   * @param {Object|Array|null} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code
   * @returns {Object} Express response
   */
  success: (res, data = null, message = 'Success', statusCode = StatusCodes.OK) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      errorCode: null
    });
  },

  /**
   * Send an error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} errors - Detailed error information
   * @returns {Object} Express response
   */
  error: (
    res,
    message = 'An error occurred',
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR,
    errors = null
  ) => {
    const response = {
      success: false,
      message,
      data: null,
      errorCode: statusCode,
      ...(errors && { errors })
    };

    if (process.env.NODE_ENV === 'development' && errors?.stack) {
      response.stack = errors.stack;
    }

    return res.status(statusCode).json(response);
  },

  /**
   * Send a 201 Created success response
   * @param {Object} res - Express response object
   * @param {Object|Array|null} data - Response data
   * @param {string} message - Success message
   * @returns {Object} Express response
   */
  created: (res, data = null, message = 'Resource created successfully') => {
    return ResponseHandler.success(res, data, message, StatusCodes.CREATED);
  },

  /**
   * Send a 204 No Content response
   * @param {Object} res - Express response object
   * @returns {Object} Express response
   */
  noContent: (res) => {
    return res.status(StatusCodes.NO_CONTENT).send();
  }
};

module.exports = { ResponseHandler };
