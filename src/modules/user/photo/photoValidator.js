// src/modules/user/photo/photoValidator.js
const { body } = require('express-validator');

/**
 * @swagger
 * components:
 *   schemas:
 *     PhotoUpdateRequest:
 *       type: object
 *       properties:
 *         order:
 *           type: integer
 *           minimum: 1
 *           maximum: 3
 *           description: The display order of the photo (1-3)
 *         isPrimary:
 *           type: boolean
 *           description: Whether this photo should be the primary photo
 *         is_primary:
 *           type: boolean
 *           description: Whether this photo should be the primary photo (alternative field name)
 *       example:
 *         order: 1
 *         isPrimary: true
 */
const validatePhotoUpdate = [
  body('order')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Order must be between 1 and 3'),
  
  body(['isPrimary', 'is_primary'])
    .optional()
    .isBoolean()
    .withMessage('isPrimary must be a boolean value')
];

module.exports = {
  validatePhotoUpdate
};