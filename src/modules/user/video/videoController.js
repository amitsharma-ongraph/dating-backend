// src/modules/user/video/videoController.js
const videoService = require('./videoService');
const { logger } = require('../../../utils/logger');
const asyncHandler = require('../../../shared/handlers/asyncHandler');
const { ResponseHandler } = require('../../../shared/handlers/responseHandler');

/**
 * @swagger
 * tags:
 *   name: Videos
 *   description: User video management endpoints
 */
const videoController = {
  //   /**
  //    * @swagger
  //    * /api/v1/videos/default:
  //    *   get:
  //    *     summary: Get user's default profile video
  //    *     tags: [Videos]
  //    *     security:
  //    *       - bearerAuth: []
  //    *     responses:
  //    *       200:
  //    *         description: Default video retrieved successfully
  //    *         content:
  //    *           application/json:
  //    *             schema:
  //    *               type: object
  //    *               properties:
  //    *                 success:
  //    *                   type: boolean
  //    *                   example: true
  //    *                 message:
  //    *                   type: string
  //    *                   example: Default video retrieved successfully
  //    *                 data:
  //    *                   type: object
  //    *                   properties:
  //    *                     id:
  //    *                       type: string
  //    *                       format: uuid
  //    *                     videoUrl:
  //    *                       type: string
  //    *                     thumbnailUrl:
  //    *                       type: string
  //    *                     duration:
  //    *                       type: integer
  //    *                     videoType:
  //    *                       type: string
  //    *                     createdAt:
  //    *                       type: string
  //    *                       format: date-time
  //    *       401:
  //    *         description: Unauthorized
  //    *       500:
  //    *         description: Server error
  //    */
  //   getDefaultVideo: asyncHandler(async (req, res) => {
  //     const userId = req.user.id;
  //     const video = await videoService.getDefaultVideo(userId);

  //     if (!video) {
  //       return ResponseHandler.success(res, { video: null }, 'No default video found');
  //     }

  //     return ResponseHandler.success(res, { video }, 'Default video retrieved successfully');
  //   }),

  /**
   * @swagger
   * /api/v1/videos:
   *   post:
   *     summary: Upload a video
   *     tags: [Videos]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - video
   *               - videoType
   *             properties:
   *               video:
   *                 type: string
   *                 format: binary
   *                 description: Video file (webm, mp4, max 20MB)
   *               videoType:
   *                 type: string
   *                 enum: [default, custom]
   *                 description: Type of video
   *     responses:
   *       201:
   *         description: Video uploaded successfully
   */
  uploadVideo: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const file = req.file;
    const { videoType } = req.body;

    if (!file) {
      return ResponseHandler.error(res, 'No video file provided', 400);
    }

    if (!videoType || !['default', 'custom'].includes(videoType)) {
      return ResponseHandler.error(res, 'Valid video type (default or custom) is required', 400);
    }

    try {
      // We'll ignore duration and thumbnailTimestamp even if they're sent
      // They'll be handled internally
      const video = await videoService.uploadVideo(userId, file, videoType);

      logger.info(`Video uploaded for user ${userId}: ${video.id}`);

      return ResponseHandler.success(res, { video }, 'Video uploaded successfully', 201);
    } catch (error) {
      if (error.statusCode === 400) {
        return ResponseHandler.error(res, error.message, 400);
      }
      throw error; // Let the asyncHandler handle other errors
    }
  }),

  /**
   * @swagger
   * /api/v1/videos/{videoId}:
   *   delete:
   *     summary: Delete a video
   *     tags: [Videos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: videoId
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the video to delete
   *     responses:
   *       200:
   *         description: Video deleted successfully
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
   *                   example: Video deleted successfully
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Video not found
   *       500:
   *         description: Server error
   */
  deleteVideo: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { videoId } = req.params;

    await videoService.deleteVideo(userId, videoId);

    logger.info(`Video ${videoId} deleted for user ${userId}`);

    return ResponseHandler.success(res, null, 'Video deleted successfully');
  }),

  //   /**
  //    * @swagger
  //    * /api/v1/videos/custom:
  //    *   get:
  //    *     summary: Get user's custom videos
  //    *     tags: [Videos]
  //    *     security:
  //    *       - bearerAuth: []
  //    *     responses:
  //    *       200:
  //    *         description: Custom videos retrieved successfully
  //    *         content:
  //    *           application/json:
  //    *             schema:
  //    *               type: object
  //    *               properties:
  //    *                 success:
  //    *                   type: boolean
  //    *                   example: true
  //    *                 message:
  //    *                   type: string
  //    *                   example: Custom videos retrieved successfully
  //    *                 data:
  //    *                   type: object
  //    *                   properties:
  //    *                     videos:
  //    *                       type: array
  //    *                       items:
  //    *                         type: object
  //    *                         properties:
  //    *                           id:
  //    *                             type: string
  //    *                           videoUrl:
  //    *                             type: string
  //    *                           thumbnailUrl:
  //    *                             type: string
  //    *                           duration:
  //    *                             type: integer
  //    *                           videoType:
  //    *                             type: string
  //    *                           createdAt:
  //    *                             type: string
  //    *       401:
  //    *         description: Unauthorized
  //    *       500:
  //    *         description: Server error
  //    */
  //   getCustomVideos: asyncHandler(async (req, res) => {
  //     const userId = req.user.id;
  //     const videos = await videoService.getCustomVideos(userId);

  //     return ResponseHandler.success(res, { videos }, 'Custom videos retrieved successfully');
  //   }),

  /**
   * @swagger
   * /api/v1/videos/{videoId}:
   *   get:
   *     summary: Get a specific video by ID
   *     tags: [Videos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: videoId
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the video to retrieve
   *     responses:
   *       200:
   *         description: Video retrieved successfully
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
   *                   example: Video retrieved successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     video:
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                         videoUrl:
   *                           type: string
   *                         thumbnailUrl:
   *                           type: string
   *                         duration:
   *                           type: integer
   *                         videoType:
   *                           type: string
   *                         createdAt:
   *                           type: string
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Video not found
   *       500:
   *         description: Server error
   */
  getVideoById: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { videoId } = req.params;

    const video = await videoService.getVideoById(userId, videoId);

    if (!video) {
      return ResponseHandler.error(res, 'Video not found', 404);
    }

    return ResponseHandler.success(res, { video }, 'Video retrieved successfully');
  }),

  /**
   * @swagger
   * /api/v1/videos:
   *   get:
   *     summary: Get all user videos (default and custom)
   *     tags: [Videos]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Videos retrieved successfully
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
   *                   example: Videos retrieved successfully
   *                 data:
   *                   type: object
   *                   properties:
   *                     defaultVideo:
   *                       type: object
   *                       nullable: true
   *                     customVideos:
   *                       type: array
   *                       items:
   *                         type: object
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  getAllVideos: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const videos = await videoService.getAllVideos(userId);

    return ResponseHandler.success(res, videos, 'Videos retrieved successfully');
  })
};

module.exports = { videoController };
