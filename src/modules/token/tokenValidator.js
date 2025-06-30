// src/modules/token/tokenValidator.js
const { body, param, query } = require('express-validator');

/**
 * @swagger
 * components:
 *   schemas:
 *     TokenResponse:
 *       type: object
 *       required:
 *         - name
 *         - interestLevel
 *       properties:
 *         name:
 *           type: string
 *           description: Viewer's name
 *         email:
 *           type: string
 *           format: email
 *           description: Viewer's email address
 *         phone:
 *           type: string
 *           description: Viewer's phone number
 *         instagram:
 *           type: string
 *           description: Viewer's Instagram handle
 *         preferredContact:
 *           type: string
 *           enum: [email, phone, instagram]
 *           description: Preferred contact method
 *         interestLevel:
 *           type: string
 *           enum: [interested, maybe_later, not_interested]
 *           description: Level of interest in connecting
 *         message:
 *           type: string
 *           description: Optional message from the viewer
 *           
 *     TokenGeneration:
 *       type: object
 *       properties:
 *         count:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 1
 *           description: Number of tokens to generate
 *
 *     TokenAssignment:
 *       type: object
 *       required:
 *         - tokenId
 *         - videoId
 *       properties:
 *         tokenId:
 *           type: string
 *           description: Token ID to assign
 *         videoId:
 *           type: string
 *           format: uuid
 *           description: Video ID to assign to the token
 *         privateLabel:
 *           type: string
 *           description: Optional private label for the token
 */

/**
 * Validate token ID parameter
 */
const validateTokenId = [
  param('tokenId')
    .trim()
    .notEmpty()
    .withMessage('Token ID is required')
    .isString()
    .withMessage('Token ID must be a string')
    .matches(/^(PRO|VID)-[a-zA-Z0-9]{6,24}$/)
    .withMessage('Invalid token format')
];

/**
 * Validate response submission
 */
const validateResponseSubmission = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .isLength({ max: 255 })
    .withMessage('Email cannot exceed 255 characters'),
  
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number cannot exceed 20 characters'),
  
  body('instagram')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Instagram handle cannot exceed 100 characters'),
  
  body('preferredContact')
    .optional()
    .isIn(['email', 'phone', 'instagram'])
    .withMessage('Preferred contact method must be email, phone, or instagram'),
  
  body('interestLevel')
    .trim()
    .notEmpty()
    .withMessage('Interest level is required')
    .isIn(['interested', 'maybe_later', 'not_interested'])
    .withMessage('Interest level must be interested, maybe_later, or not_interested'),
  
  body('message')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters')
];

/**
 * Validate token generation
 */
const validateTokenGeneration = [
  body('count')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Count must be between 1 and 50')
];

/**
 * Validate token assignment
 */
const validateTokenAssignment = [
  body('tokenId')
    .trim()
    .notEmpty()
    .withMessage('Token ID is required')
    .matches(/^(PRO|VID)-[a-zA-Z0-9]{6,24}$/)
    .withMessage('Invalid token format'),
  
  body('videoId')
    .trim()
    .notEmpty()
    .withMessage('Video ID is required')
    .isUUID()
    .withMessage('Invalid video ID format'),
  
  body('privateLabel')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Private label cannot exceed 255 characters')
];

/**
 * Validate token list query parameters
 */
const validateTokenListQuery = [
  query('status')
    .optional()
    .isIn(['active', 'viewed', 'expired', 'unassigned'])
    .withMessage('Status must be active, viewed, expired, or unassigned'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .isIn(['created_at', 'expires_at', 'viewed_at', 'status'])
    .withMessage('Sort field must be created_at, expires_at, viewed_at, or status'),
  
  query('sortDirection')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort direction must be asc or desc')
];

module.exports = {
  validateTokenId,
  validateResponseSubmission,
  validateTokenGeneration,
  validateTokenAssignment,
  validateTokenListQuery
};