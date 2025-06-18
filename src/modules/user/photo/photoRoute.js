// src/modules/user/photo/photoRoute.js
const express = require('express');
const { photoController } = require('./photoController');
const { authenticate } = require('../../../shared/middlewares/authMiddleware');
const { validateRequest } = require('../../../shared/handlers/validationHandler');
const { validatePhotoUpdate } = require('./photoValidator');
const multer = require('multer');

// Configure multer for memory storage with better error handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 3 // Maximum 3 files at once
  },
  fileFilter: (req, file, cb) => {
    // Accept only jpeg, jpg, png, and webp
    if (
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/jpg' ||
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/webp'
    ) {
      cb(null, true);
    } else {
      cb(null, false); // Don't throw error, just ignore invalid files
    }
  }
}).array('photos', 3);

// Add custom error handling middleware for multer
const handlePhotoUpload = (req, res, next) => {
  upload(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred
      let errorMessage = 'Photo upload failed';
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = 'One or more files exceed the size limit of 5MB';
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        errorMessage = 'Too many files. Maximum 3 photos allowed';
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        errorMessage = 'Unexpected field name. Use "photos" as the field name';
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
        message: 'Photo upload failed: ' + err.message,
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
 * /photos:
 *   get:
 *     summary: Get all user photos
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Photos retrieved successfully
 */
router.get('/', authenticate, photoController.getUserPhotos);

/**
 * @swagger
 * /photos/primary:
 *   get:
 *     summary: Get user's primary photo
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Primary photo retrieved successfully
 */
router.get('/primary', authenticate, photoController.getPrimaryPhoto);

/**
 * @swagger
 * /photos:
 *   post:
 *     summary: Upload one or more photos (up to 3 total)
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               primaryIndex:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Photos uploaded successfully
 */
router.post(
  '/',
  authenticate,
  handlePhotoUpload,
  photoController.uploadPhotos
);

/**
 * @swagger
 * /photos/{photoId}:
 *   put:
 *     summary: Update photo metadata
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhotoUpdateRequest'
 *     responses:
 *       200:
 *         description: Photo updated successfully
 */
router.put(
  '/:photoId',
  authenticate,
  validatePhotoUpdate,
  validateRequest,
  photoController.updatePhoto
);

/**
 * @swagger
 * /photos/{photoId}:
 *   delete:
 *     summary: Delete a photo
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Photo deleted successfully
 */
router.delete('/:photoId', authenticate, photoController.deletePhoto);

module.exports = router;
