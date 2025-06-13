// src/shared/helpers/errorHelper.js
const ApiError = require('../../utils/apiError.js');
const { StatusCodes } = require('http-status-codes');

const BadRequestError = (msg = 'Bad Request', errors = null) =>
  new ApiError(StatusCodes.BAD_REQUEST, msg, true, errors);

const UnauthorizedError = (msg = 'Unauthorized', errors = null) =>
  new ApiError(StatusCodes.UNAUTHORIZED, msg, true, errors);

const ForbiddenError = (msg = 'Forbidden', errors = null) =>
  new ApiError(StatusCodes.FORBIDDEN, msg, true, errors);

const NotFoundError = (msg = 'Not Found', errors = null) =>
  new ApiError(StatusCodes.NOT_FOUND, msg, true, errors);

const InternalServerError = (msg = 'Server Error', errors = null) =>
  new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, msg, false, errors);

module.exports = {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InternalServerError
};
