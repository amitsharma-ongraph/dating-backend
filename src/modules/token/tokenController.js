// src/modules/token/tokenController.js
const tokenService = require('./tokenService');
const asyncHandler = require('../../shared/handlers/asyncHandler');
const { ResponseHandler } = require('../../shared/handlers/responseHandler');
const { colorLogger } = require('../../utils/logger');

/**
 * @swagger
 * tags:
 *   name: Tokens
 *   description: Token management for videos and profiles
 */

/**
 * @swagger
 * /api/v1/tokens/{tokenId}:
 *   get:
 *     summary: Get profile by token ID
 *     description: Public endpoint to access a user profile using a token ID
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: The token ID
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                   example: Profile retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     profile:
 *                       type: object
 *                     tokenStatus:
 *                       type: object
 *       404:
 *         description: Token not found or invalid
 *       500:
 *         description: Server error
 */
const getProfileByToken = asyncHandler(async (req, res) => {
  const { tokenId } = req.params;
  
  const profileData = await tokenService.getProfileByToken(tokenId, req);
  
  colorLogger.info(`Profile accessed via token ${tokenId}`);
  
  return ResponseHandler.success(res, profileData, 'Profile retrieved successfully');
});

/**
 * @swagger
 * /api/v1/tokens/{tokenId}/video:
 *   get:
 *     summary: Get video by token ID
 *     description: Public endpoint to access a video using a token ID
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: The token ID
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
 *                     success:
 *                       type: boolean
 *                     video:
 *                       type: object
 *                     user:
 *                       type: object
 *       404:
 *         description: Token not found or invalid
 *       500:
 *         description: Server error
 */
const getVideoByToken = asyncHandler(async (req, res) => {
  const { tokenId } = req.params;
  
  const videoData = await tokenService.getVideoByToken(tokenId, req);
  
  colorLogger.info(`Video accessed via token ${tokenId}`);
  
  return ResponseHandler.success(res, videoData, 'Video retrieved successfully');
});

/**
 * @swagger
 * /api/v1/tokens/{tokenId}/response:
 *   post:
 *     summary: Submit response to a token
 *     description: Public endpoint to submit a viewer's response to a video token
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: The token ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - interestLevel
 *             properties:
 *               name:
 *                 type: string
 *                 description: Viewer's name
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Viewer's email address
 *               phone:
 *                 type: string
 *                 description: Viewer's phone number
 *               instagram:
 *                 type: string
 *                 description: Viewer's Instagram handle
 *               preferredContact:
 *                 type: string
 *                 enum: [email, phone, instagram]
 *                 description: Preferred contact method
 *               interestLevel:
 *                 type: string
 *                 enum: [interested, maybe_later, not_interested]
 *                 description: Level of interest in connecting
 *               message:
 *                 type: string
 *                 description: Optional message from the viewer
 *     responses:
 *       200:
 *         description: Response submitted successfully
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
 *                   example: Response submitted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Response ID
 *       400:
 *         description: Bad request or invalid token
 *       404:
 *         description: Token not found
 *       500:
 *         description: Server error
 */
const submitTokenResponse = asyncHandler(async (req, res) => {
  const { tokenId } = req.params;
  const { name, email, phone, instagram, preferredContact, interestLevel, message } = req.body;
  
  const responseData = await tokenService.submitTokenResponse(
    tokenId,
    { name, email, phone, instagram, preferredContact, interestLevel, message },
    req
  );
  
  colorLogger.info(`Response submitted for token ${tokenId} with interest level ${interestLevel}`);
  
  return ResponseHandler.success(res, responseData, 'Response submitted successfully');
});

/**
 * @swagger
 * /api/v1/tokens/generate:
 *   post:
 *     summary: Generate new tokens
 *     description: Generate one or more new video tokens (requires authentication)
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 description: Number of tokens to generate (default: 1)
 *     responses:
 *       200:
 *         description: Tokens generated successfully
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
 *                   example: Tokens generated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokens:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const generateTokens = asyncHandler(async (req, res) => {
  const { count = 1 } = req.body;
  const userId = req.user.id;
  
  const result = await tokenService.generateTokens(count, userId);
  
  colorLogger.info(`${count} tokens generated for user ${userId}`);
  
  return ResponseHandler.success(res, result, 'Tokens generated successfully');
});

/**
 * @swagger
 * /api/v1/tokens/assign:
 *   post:
 *     summary: Assign video to a token
 *     description: Assign a video to a token and optionally add a private label (requires authentication)
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tokenId
 *               - videoId
 *             properties:
 *               tokenId:
 *                 type: string
 *                 description: Token ID to assign
 *               videoId:
 *                 type: string
 *                 format: uuid
 *                 description: Video ID to assign to the token
 *               privateLabel:
 *                 type: string
 *                 description: Optional private label for the token
 *     responses:
 *       200:
 *         description: Video assigned to token successfully
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
 *                   example: Video assigned to token successfully
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - token or video not owned by user
 *       404:
 *         description: Token or video not found
 *       500:
 *         description: Server error
 */
const assignVideoToToken = asyncHandler(async (req, res) => {
  const { tokenId, videoId, privateLabel, privateNote } = req.body;
  const userId = req.user.id;
  const updatedToken = await tokenService.assignVideoToToken(tokenId, videoId, privateLabel, privateNote, userId);
  colorLogger.info(`Video ${videoId} assigned to token ${tokenId} by user ${userId}`);
  return ResponseHandler.success(res, updatedToken, 'Video assigned to token successfully');
});

/**
 * @swagger
 * /api/v1/tokens/metrics:
 *   get:
 *     summary: Get token metrics
 *     description: Get token usage metrics for the authenticated user
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token metrics retrieved successfully
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
 *                   example: Token metrics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokenCounts:
 *                       type: object
 *                     activityMetrics:
 *                       type: array
 *                       items:
 *                         type: object
 *                     conversionRates:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const getTokenMetrics = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const metrics = await tokenService.getTokenMetrics(userId);
  
  return ResponseHandler.success(res, metrics, 'Token metrics retrieved successfully');
});

/**
 * @swagger
 * /api/v1/tokens:
 *   get:
 *     summary: Get user's tokens
 *     description: Get all tokens for the authenticated user with optional filtering and pagination
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, viewed, expired, unassigned]
 *         description: Filter tokens by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of tokens per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_at, expires_at, viewed_at, status]
 *           default: created_at
 *         description: Field to sort by
 *       - in: query
 *         name: sortDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Tokens retrieved successfully
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
 *                   example: Tokens retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokens:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const getUserTokens = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { status, page, limit, sortBy, sortDirection } = req.query;
  
  const options = {
    status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy: sortBy || 'created_at',
    sortDirection: sortDirection || 'desc'
  };
  
  const result = await tokenService.getUserTokens(userId, options);
  
  return ResponseHandler.success(res, result, 'Tokens retrieved successfully');
});

/**
 * @swagger
 * /api/v1/tokens/custom-video:
 *   post:
 *     summary: Upload a custom video and create a token
 *     description: Upload a video file and create a custom video token in one step (requires authentication)
 *     tags: [Tokens]
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
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Video file (webm, mp4, max 20MB)
 *               title:
 *                 type: string
 *                 description: Title of the video
 *               privateLabel:
 *                 type: string
 *                 description: Optional private label for the token
 *               privateNotes:
 *                 type: string
 *                 description: Optional private notes for the token
 *               daysValid:
 *                 type: integer
 *                 description: Number of days the token is valid (default: 3)
 *     responses:
 *       201:
 *         description: Custom video and token created successfully
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
 *                   example: Custom video and token created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     video_id:
 *                       type: string
 *                     token_id:
 *                       type: string
 *                     token_code:
 *                       type: string
 *                     expires_at:
 *                       type: string
 *                     token_url:
 *                       type: string
 */
const createCustomVideoAndToken = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const file = req.file;
  const { title, privateLabel, privateNotes, daysValid } = req.body;

  if (!file) {
    return ResponseHandler.error(res, 'No video file provided', 400);
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return ResponseHandler.error(res, 'Title is required', 400);
  }

  try {
    // Import video service for storage operations
    const videoService = require('../user/video/videoService');
    
    // Upload file to storage and get URLs (without creating video record)
    const { videoUrl, thumbnailUrl, duration } = await videoService.uploadVideoToStorage(userId, file);

    // Call token service to create both video and token in one transaction
    const result = await tokenService.createCustomVideoWithToken({
      userId,
      videoUrl,
      thumbnailUrl,
      durationSeconds: duration,
      title,
      privateLabel,
      privateNotes,
      daysValid: parseInt(daysValid) || 3
    });

    // Compose the response in the required format
    return ResponseHandler.success(
      res,
      {
        video: {
          id: result.video_id,
          videoUrl: result.video_url || videoUrl,
          thumbnailUrl: result.thumbnail_url || thumbnailUrl,
          duration: result.duration_seconds || duration,
          videoType: 'custom',
          title: result.title || title,
          createdAt: result.token_created_at || result.created_at || new Date().toISOString(),

          // Token specific fields
          tokenId: result.token_id,
          tokenCode: result.token_code,
          tokenStatus: result.token_status || 'active',
          privateLabel: result.private_label || privateLabel || null,
          privateNotes: result.private_notes || privateNotes || null,
          tokenCreatedAt: result.token_created_at || result.created_at || new Date().toISOString(),
          expiresAt: result.expires_at,
          viewedAt: result.viewed_at || null
        }
      },
      'Custom video and token created successfully',
      201
    );
  } catch (error) {
    if (error.statusCode === 400) {
      return ResponseHandler.error(res, error.message, 400);
    }
    throw error;
  }
});

module.exports = {
  getProfileByToken,
  getVideoByToken,
  submitTokenResponse,
  generateTokens,
  assignVideoToToken,
  getTokenMetrics,
  getUserTokens,
  createCustomVideoAndToken
};