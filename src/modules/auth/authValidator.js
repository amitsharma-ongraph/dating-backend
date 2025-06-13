// src/modules/auth/authValidator.js
const { body } = require('express-validator');

/**
 * Common validation rules that can be reused across different validation chains
 */
const email = body('email')
  .trim()
  .isEmail()
  .withMessage('Please provide a valid email address')
  .normalizeEmail();

const password = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .withMessage(
    'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
  );

const fullName = body('fullName')
  .trim()
  .isLength({ min: 2, max: 100 })
  .withMessage('Full name must be between 2 and 100 characters')
  .matches(/^[a-zA-Z\s]+$/)
  .withMessage('Full name can only contain letters and spaces');

/**
 * Validation rules for registration
 * @swagger
 * components:
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - confirmPassword
 *         - fullName
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         password:
 *           type: string
 *           format: password
 *           minLength: 8
 *           description: User's password (min 8 characters, must include uppercase, lowercase, number, and special char)
 *         confirmPassword:
 *           type: string
 *           description: Confirmation of the password (must match password)
 *         fullName:
 *           type: string
 *           description: User's full name (2-100 characters, letters and spaces only)
 */
const validateRegister = [
  email,
  password,
  fullName,
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
];

/**
 * Validation rules for login
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         password:
 *           type: string
 *           format: password
 *           description: User's password
 */
const validateLogin = [email, body('password').notEmpty().withMessage('Password is required')];

/**
 * Validation rules for forgot password
 * @swagger
 * components:
 *   schemas:
 *     ForgotPasswordRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 */
const validateForgotPassword = [email];

/**
 * Validation rules for reset password
 * @swagger
 * components:
 *   schemas:
 *     ResetPasswordRequest:
 *       type: object
 *       required:
 *         - token
 *         - newPassword
 *         - confirmPassword
 *       properties:
 *         token:
 *           type: string
 *           description: Password reset token
 *         newPassword:
 *           type: string
 *           format: password
 *           minLength: 8
 *           description: New password (min 8 characters, must include uppercase, lowercase, number, and special char)
 *         confirmPassword:
 *           type: string
 *           description: Confirmation of the new password (must match newPassword)
 */
const validateResetPassword = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    ),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match new password');
    }
    return true;
  })
];

/**
 * Validation rules for profile update
 * @swagger
 * components:
 *   schemas:
 *     UpdateProfileRequest:
 *       type: object
 *       properties:
 *         fullName:
 *           type: string
 *           description: User's full name (2-100 characters, letters and spaces only)
 *         age:
 *           type: integer
 *           minimum: 18
 *           maximum: 120
 *           description: User's age (must be between 18 and 120)
 *         city:
 *           type: string
 *           maxLength: 100
 *           description: User's city
 *         jobTitle:
 *           type: string
 *           maxLength: 100
 *           description: User's job title
 *         hobbies:
 *           type: array
 *           items:
 *             type: string
 *           maxItems: 10
 *           description: User's hobbies (max 10 items)
 *         bio:
 *           type: string
 *           maxLength: 500
 *           description: User's biography (max 500 characters)
 *         instagramHandle:
 *           type: string
 *           maxLength: 30
 *           description: Instagram handle (without @)
 *         linkedinUrl:
 *           type: string
 *           description: LinkedIn profile URL
 *         websiteUrl:
 *           type: string
 *           description: Personal website URL
 */
const validateUpdateProfile = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Full name can only contain letters and spaces'),
  
  body('age')
    .optional()
    .isInt({ min: 18, max: 120 })
    .withMessage('Age must be between 18 and 120'),
  
  body('city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be less than 100 characters'),
  
  body('jobTitle')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Job title must be less than 100 characters'),
  
  body('hobbies')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Hobbies must be an array with maximum 10 items'),
  
  body('hobbies.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each hobby must be between 1 and 50 characters'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters'),
  
  body('instagramHandle')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Instagram handle must be less than 30 characters')
    .matches(/^[a-zA-Z0-9._]+$/)
    .withMessage('Instagram handle can only contain letters, numbers, dots, and underscores'),
  
  body('linkedinUrl')
    .optional()
    .trim()
    .isURL()
    .withMessage('LinkedIn URL must be a valid URL'),
  
  body('websiteUrl')
    .optional()
    .trim()
    .isURL()
    .withMessage('Website URL must be a valid URL')
];

/**
 * Validation rules for refresh token
 * @swagger
 * components:
 *   schemas:
 *     RefreshTokenRequest:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: Refresh token
 */
const validateRefreshToken = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
];

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateUpdateProfile,
  validateRefreshToken
};