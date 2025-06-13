// src/shared/handlers/validationHandler.js
const { validationResult } = require('express-validator');
const { StatusCodes } = require('http-status-codes');
const { logger } = require('../../utils/logger.js');

/**
 * Express middleware that checks validation results from express-validator
 * If validation fails, it returns a 400 Bad Request response with detailed error messages
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  // Format validation errors
  const errorDetails = errors.array().map((error) => ({
    field: error.param,
    message: error.msg,
    value: error.value
  }));

  // Log validation errors
  logger.warn('Validation failed', {
    path: req.path,
    method: req.method,
    errors: errorDetails
  });

  // Send formatted error response
  return res.status(StatusCodes.BAD_REQUEST).json({
    success: false,
    status: 'error',
    message: 'Validation failed',
    errors: errorDetails,
    errorCode: StatusCodes.BAD_REQUEST
  });
};

module.exports = { validateRequest };
