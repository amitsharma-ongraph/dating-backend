// src/modules/user/video/videoValidator.js
const { body } = require('express-validator');

/**
 * @swagger
 * components:
 *   schemas:
 *     VideoUploadRequest:
 *       type: object
 *       required:
 *         - video
 *         - videoType
 *       properties:
 *         video:
 *           type: string
 *           format: binary
 *           description: Video file (webm, mp4)
 *         videoType:
 *           type: string
 *           enum: [default, custom]
 *           description: Type of video (default profile video or custom token video)
 *       example:
 *         videoType: default
 */
const validateVideoUpload = [
  body('videoType')
    .isIn(['default', 'custom'])
    .withMessage('Video type must be either "default" or "custom"')
];

module.exports = {
  validateVideoUpload
};