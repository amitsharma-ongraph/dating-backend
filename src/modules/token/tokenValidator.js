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
 * Validator for token response submission
 * - For all responses: name and interestLevel are required
 * - For 'interested' responses: at least one contact method is required
 * - For 'interested' responses with preferredContact: the specified contact method must be provided
 */
const validateResponseSubmission = [
  // Common fields for all response types
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('interestLevel')
    .notEmpty()
    .withMessage('Interest level is required')
    .isIn(['interested', 'maybe_later', 'not_interested'])
    .withMessage('Interest level must be "interested", "maybe_later", or "not_interested"'),

  // Optional fields
  body('email')
    .optional({ nullable: true })
    .isEmail()
    .withMessage('Invalid email format')
    .trim()
    .normalizeEmail(),

  body('phone')
    .optional({ nullable: true })
    .isString()
    .withMessage('Phone number must be a string')
    .trim()
    .isLength({ min: 5, max: 20 })
    .withMessage('Phone number must be between 5 and 20 characters'),

  body('instagram')
    .optional({ nullable: true })
    .isString()
    .withMessage('Instagram handle must be a string')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Instagram handle must be between 1 and 30 characters'),

  body('preferredContact')
    .optional({ nullable: true })
    .isIn(['email', 'phone', 'instagram'])
    .withMessage('Preferred contact method must be "email", "phone", or "instagram"'),

  body('message')
    .optional({ nullable: true })
    .isString()
    .withMessage('Message must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Message must not exceed 500 characters'),

  // Custom validation for interested responses
  body().custom((body) => {
    if (body.interestLevel === 'interested') {
      // At least one contact method is required for interested responses
      if (!body.email && !body.phone && !body.instagram) {
        throw new Error(
          'At least one contact method (email, phone, or Instagram) is required for interested responses'
        );
      }

      // If preferred contact is specified, that contact method must be provided
      if (body.preferredContact) {
        if (body.preferredContact === 'email' && !body.email) {
          throw new Error('Email is required when email is selected as preferred contact method');
        } else if (body.preferredContact === 'phone' && !body.phone) {
          throw new Error('Phone is required when phone is selected as preferred contact method');
        } else if (body.preferredContact === 'instagram' && !body.instagram) {
          throw new Error(
            'Instagram is required when Instagram is selected as preferred contact method'
          );
        }
      }
    }

    return true;
  })
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