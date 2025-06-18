// src/modules/user/photo/photoController.js
const photoService = require('./photoService');
const { logger } = require('../../../utils/logger');
const asyncHandler = require('../../../shared/handlers/asyncHandler');
const { ResponseHandler } = require('../../../shared/handlers/responseHandler');
const ApiError = require('../../../shared/handlers/apiError');

/**
 * @swagger
 * tags:
 *   name: Photos
 *   description: User photo management endpoints
 */

const photoController = {
  /**
   * @swagger
   * /api/v1/users/photos:
   *   get:
   *     summary: Get user photos
   *     tags: [Photos]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User photos retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Photos retrieved successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     photos:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                             format: uuid
   *                           photoUrl:
   *                             type: string
   *                           order:
   *                             type: integer
   *                           isPrimary:
   *                             type: boolean
   *                           uploadedAt:
   *                             type: string
   *                             format: date-time
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  getUserPhotos: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const photos = await photoService.getUserPhotos(userId);
    
    return ResponseHandler.success(res, { photos }, 'Photos retrieved successfully');
  }),

  /**
   * @swagger
   * /api/v1/users/photos:
   *   post:
   *     summary: Upload one or more photos (up to 3 total)
   *     tags: [Photos]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - photos
   *             properties:
   *               photos:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                 description: Photo files (JPEG, PNG, or WebP, max 5MB each)
   *               primaryIndex:
   *                 type: integer
   *                 description: Index of the photo to set as primary (0-based)
   *     responses:
   *       201:
   *         description: Photos uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Photos uploaded successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     photos:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                             format: uuid
   *                           photoUrl:
   *                             type: string
   *                           order:
   *                             type: integer
   *                           isPrimary:
   *                             type: boolean
   *                           uploadedAt:
   *                             type: string
   *                             format: date-time
   *       400:
   *         description: Invalid input or too many photos
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  uploadPhotos: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const files = req.files;
    const accessToken = req.headers.authorization.replace('Bearer ', '');
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return ResponseHandler.error(res, 'No photo files provided', 400);
    }
    
    // Validate file types and sizes before passing to service
    const validFiles = files.filter(file => {
      const validType = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype);
      const validSize = file.size <= 5 * 1024 * 1024; // 5MB
      
      return validType && validSize;
    });
    
    if (validFiles.length === 0) {
      return ResponseHandler.error(res, 'No valid photo files provided. Files must be JPEG, PNG, or WebP and under 5MB.', 400);
    }
    
    try {
      const photos = await photoService.uploadMultiplePhotos(userId, validFiles, accessToken);
      
      logger.info(`${photos.length} photos uploaded for user ${userId}`);
      
      return ResponseHandler.success(
        res,
        { photos },
        'Photos uploaded successfully',
        201
      );
    } catch (error) {
      if (error.statusCode === 400) {
        return ResponseHandler.error(res, error.message, 400);
      }
      throw error; // Let the asyncHandler handle other errors
    }
  }),

  /**
   * @swagger
   * /api/v1/users/photos/{photoId}:
   *   put:
   *     summary: Update photo metadata (order or primary status)
   *     tags: [Photos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: photoId
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the photo to update
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               order:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 3
   *                 description: Photo order (1-3)
   *               isPrimary:
   *                 type: boolean
   *                 description: Set as primary photo
   *     responses:
   *       200:
   *         description: Photo updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Photo updated successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     photo:
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                           format: uuid
   *                         photoUrl:
   *                           type: string
   *                         order:
   *                           type: integer
   *                         isPrimary:
   *                           type: boolean
   *                         uploadedAt:
   *                           type: string
   *                           format: date-time
   *       400:
   *         description: Invalid input
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Photo not found
   *       500:
   *         description: Server error
   */
  updatePhoto: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { photoId } = req.params;
    const { order, isPrimary, is_primary } = req.body;
    
    const photo = await photoService.updatePhoto(userId, photoId, { 
      order: order ? parseInt(order, 10) : undefined,
      isPrimary: isPrimary !== undefined ? isPrimary : is_primary
    });
    
    logger.info(`Photo ${photoId} updated for user ${userId}`);
    
    return ResponseHandler.success(res, { photo }, 'Photo updated successfully');
  }),

  /**
   * @swagger
   * /api/v1/users/photos/{photoId}:
   *   delete:
   *     summary: Delete a photo
   *     tags: [Photos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: photoId
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the photo to delete
   *     responses:
   *       200:
   *         description: Photo deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Photo deleted successfully
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Photo not found
   *       500:
   *         description: Server error
   */
  deletePhoto: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { photoId } = req.params;
    const accessToken = req.headers.authorization.replace('Bearer ', '');
    
    await photoService.deletePhoto(userId, photoId, accessToken);
    
    logger.info(`Photo ${photoId} deleted for user ${userId}`);
    
    return ResponseHandler.success(res, null, 'Photo deleted successfully');
  }),

  /**
   * @swagger
   * /api/v1/users/photos/primary:
   *   get:
   *     summary: Get user's primary photo
   *     tags: [Photos]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Primary photo retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Primary photo retrieved successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     photo:
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                           format: uuid
   *                         photoUrl:
   *                           type: string
   *                         order:
   *                           type: integer
   *                         isPrimary:
   *                           type: boolean
   *                         uploadedAt:
   *                           type: string
   *                           format: date-time
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: No primary photo found
   *       500:
   *         description: Server error
   */
  getPrimaryPhoto: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const photo = await photoService.getPrimaryPhoto(userId);
    
    if (!photo) {
      return ResponseHandler.success(res, { photo: null }, 'No primary photo found');
    }
    
    return ResponseHandler.success(res, { photo }, 'Primary photo retrieved successfully');
  }),

  /**
   * Upload multiple photos for a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  uploadMultiplePhotos: async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { files } = req;
      const { primaryIndex = 0 } = req.body;
      const accessToken = req.headers.authorization?.split(' ')[1];
      const requestingUserId = req.user.id; // Get the authenticated user's ID

      if (!files || files.length === 0) {
        throw new ApiError(400, 'No files uploaded');
      }

      const uploadedPhotos = await photoService.uploadMultiplePhotos(
        userId,
        files,
        primaryIndex,
        accessToken,
        requestingUserId
      );

      res.status(201).json({
        success: true,
        message: 'Photos uploaded successfully',
        data: uploadedPhotos
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = { photoController };