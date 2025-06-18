// src/modules/user/video/videoRoute.js
const express = require('express');
const { videoController } = require('./videoController');
const { authenticate } = require('../../../shared/middlewares/authMiddleware');
const { validateRequest } = require('../../../shared/handlers/validationHandler');
const { validateVideoUpload } = require('./videoValidator');
const multer = require('multer');

// Configure multer for memory storage with error handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
    files: 1 // Maximum 1 file at once
  },
  fileFilter: (req, file, cb) => {
    // Accept only webm, mp4, quicktime
    if (
      file.mimetype === 'video/webm' ||
      file.mimetype === 'video/mp4' ||
      file.mimetype === 'video/quicktime'
    ) {
      cb(null, true);
    } else {
      cb(null, false); // Don't throw error, just ignore invalid files
    }
  }
}).single('video');

// Add custom error handling middleware for multer
const handleVideoUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred
      let errorMessage = 'Video upload failed';

      if (err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = 'Video exceeds the size limit of 20MB';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        errorMessage = 'Unexpected field name. Use "video" as the field name';
      }

      return res.status(400).json({
        success: false,
        message: errorMessage,
        errorCode: 400
      });
    } else if (err) {
      // An unknown error occurred
      return res.status(500).json({
        success: false,
        message: 'Video upload failed: ' + err.message,
        errorCode: 500
      });
    }

    // Everything went fine, proceed
    next();
  });
};

const router = express.Router();

/**
 * @swagger
 * /videos:
 *   get:
 *     summary: Get all user videos (default and custom)
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Videos retrieved successfully
 */
router.get('/', authenticate, videoController.getAllVideos);

// /**
//  * @swagger
//  * /videos/default:
//  *   get:
//  *     summary: Get user's default profile video
//  *     tags: [Videos]
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: Default video retrieved successfully
//  */
// router.get('/default', authenticate, videoController.getDefaultVideo);

/**
 * @swagger
 * /videos:
 *   post:
 *     summary: Upload a video
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *               videoType:
 *                 type: string
 *                 enum: [default, custom]
 *               duration:
 *                 type: number
 *               thumbnailTimestamp:
 *                 type: number
 *     responses:
 *       201:
 *         description: Video uploaded successfully
 */
router.post(
  '/',
  authenticate,
  handleVideoUpload,
  validateVideoUpload,
  validateRequest,
  videoController.uploadVideo
);

// /**
//  * @swagger
//  * /videos/custom:
//  *   get:
//  *     summary: Get user's custom videos
//  *     tags: [Videos]
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: Custom videos retrieved successfully
//  */
// router.get('/custom', authenticate, videoController.getCustomVideos);

/**
 * @swagger
 * /videos/{videoId}:
 *   get:
 *     summary: Get a specific video by ID
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Video retrieved successfully
 */
router.get('/:videoId', authenticate, videoController.getVideoById);

/**
 * @swagger
 * /videos/{videoId}:
 *   delete:
 *     summary: Delete a video
 *     tags: [Videos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Video deleted successfully
 */
router.delete('/:videoId', authenticate, videoController.deleteVideo);

module.exports = router;
