// src/modules/token/tokenRoute.js
const express = require('express');
const { authenticate } = require('../../shared/middlewares/authMiddleware');
const { validateRequest } = require('../../shared/handlers/validationHandler');
const tokenValidator = require('./tokenValidator');
const tokenController = require('./tokenController');
const asyncHandler = require('../../shared/handlers/asyncHandler');
const multer = require('multer');

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

const router = express.Router();

/**
 * Public routes - no auth required
 */

/**
 * @swagger
 * /tokens/{tokenId}:
 *   get:
 *     summary: Get profile by token ID
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
 *       404:
 *         description: Token not found or invalid
 */
const dynamicTokenHandler = (req, res, next) => {
  const { tokenId } = req.params;
  if (tokenId.startsWith('PRO')) {
    return tokenController.getProfileByToken(req, res, next);
  } else if (tokenId.startsWith('VID')) {
    return tokenController.getVideoByToken(req, res, next);
  } else {
    return res.status(400).json({
      success: false,
      message: 'Invalid token prefix',
      data: null,
      errorCode: 400
    });
  }
};

router.get(
  '/:tokenId',
  tokenValidator.validateTokenId,
  validateRequest,
  dynamicTokenHandler
);

/**
 * @swagger
 * /tokens/{tokenId}/video:
 *   get:
 *     summary: Get video by token ID
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
 *       404:
 *         description: Token not found or invalid
 */
router.get(
  '/:tokenId/video',
  tokenValidator.validateTokenId,
  validateRequest,
  tokenController.getVideoByToken
);

/**CREATE FUNCTION public.create_custom_video_with_token(p_user_id uuid, p_video_url text, p_thumbnail_url text, p_duration_seconds integer, p_private_label text DEFAULT NULL::text, p_private_notes text DEFAULT NULL::text, p_days_valid integer DEFAULT 3) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_video_id UUID;
    v_token_code TEXT;
    v_token_id UUID;
BEGIN
    -- Create the custom video
    INSERT INTO videos (
        user_id,
        video_url,
        thumbnail_url,
        duration_seconds,
        video_type,
        is_active,
        storage_provider,
        processed_at
    ) VALUES (
        p_user_id,
        p_video_url,
        p_thumbnail_url,
        p_duration_seconds,
        'custom',
        true,
        'supabase',
        NOW()
    ) RETURNING id INTO v_video_id;
    
    -- Generate token for this video
    v_token_code := generate_video_token();
    
    -- Create video token
    INSERT INTO video_tokens (
        token_code,
        user_id,
        video_id,
        private_label,
        private_notes,
        expires_at
    ) VALUES (
        v_token_code,
        p_user_id,
        v_video_id,
        p_private_label,
        p_private_notes,
        NOW() + (p_days_valid || ' days')::INTERVAL
    ) RETURNING id INTO v_token_id;
    
    -- Log token creation
    INSERT INTO token_activity_logs (
        log_type,
        video_token_id,
        activity_type,
        metadata
    ) VALUES (
        'video_token',
        v_token_id,
        'created',
        jsonb_build_object(
            'video_id', v_video_id,
            'expires_at', NOW() + (p_days_valid || ' days')::INTERVAL
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'video_id', v_video_id,
        'token_id', v_token_id,
        'token_code', v_token_code,
        'expires_at', NOW() + (p_days_valid || ' days')::INTERVAL,
        'token_url', '/v/' || v_token_code
    );
END;
$$;
 * @swagger
 * /tokens/{tokenId}/response:
 *   post:
 *     summary: Submit response to a token
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
 *             $ref: '#/components/schemas/TokenResponse'
 *     responses:
 *       200:
 *         description: Response submitted successfully
 *       400:
 *         description: Bad request, invalid input, or token already has a response
 *       404:
 *         description: Token not found
 */
router.post(
  '/:tokenId/response',
  tokenValidator.validateTokenId,
  tokenValidator.validateResponseSubmission,
  validateRequest,
  tokenController.submitTokenResponse
);

/**
 * @swagger
 * /tokens/{tokenId}/response/check:
 *   get:
 *     summary: Check if a token has a response
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
 *         description: Token response status checked successfully
 *       404:
 *         description: Token not found
 */
router.get(
  '/:tokenId/response/check',
  tokenValidator.validateTokenId,
  validateRequest,
  tokenController.checkTokenResponse
);

/**
 * Private routes - require authentication
 */

/**
 * @swagger
 * /tokens:
 *   get:
 *     summary: Get user's tokens
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
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  authenticate,
  tokenValidator.validateTokenListQuery,
  validateRequest,
  tokenController.getUserTokens
);

/**
 * @swagger
 * /tokens/metrics:
 *   get:
 *     summary: Get token metrics
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token metrics retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/metrics', authenticate, tokenController.getTokenMetrics);

/**
 * @swagger
 * /tokens/generate:
 *   post:
 *     summary: Generate new tokens
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TokenGeneration'
 *     responses:
 *       200:
 *         description: Tokens generated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/generate',
  authenticate,
  tokenValidator.validateTokenGeneration,
  validateRequest,
  tokenController.generateTokens
);

/**
 * @swagger
 * /tokens/assign:
 *   post:
 *     summary: Assign video to a token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TokenAssignment'
 *     responses:
 *       200:
 *         description: Video assigned to token successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - token or video not owned by user
 *       404:
 *         description: Token or video not found
 */
router.post(
  '/assign',
  authenticate,
  tokenValidator.validateTokenAssignment,
  validateRequest,
  tokenController.assignVideoToToken
);

// Use the same multer config as video upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'video/webm' ||
      file.mimetype === 'video/mp4' ||
      file.mimetype === 'video/quicktime'
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
}).single('video');

// Custom error handler for video upload
const handleVideoUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
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
      return res.status(500).json({
        success: false,
        message: 'Video upload failed: ' + err.message,
        errorCode: 500
      });
    }
    next();
  });
};

/**
 * @swagger
 * /tokens/custom-video:
 *   post:
 *     summary: Upload a custom video and create a token
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
 *               privateLabel:
 *                 type: string
 *                 description: Optional private label for the token
 *               privateNotes:
 *                 type: string
 *                 description: Optional private notes for the token
 *               daysValid:
 *                 type: integer
 *                 description: "Number of days the token is valid (default: 3)"
 *     responses:
 *       201:
 *         description: Custom video and token created successfully
 */
router.post(
  '/custom-video',
  authenticate,
  handleVideoUpload,
  tokenController.createCustomVideoAndToken
);

/**
 * @swagger
 * /tokens/preview/{tokenId}:
 *   get:
 *     summary: Preview a token (profile or video) as the owner
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tokenId
 *         required: true
 *         schema:
 *           type: string
 *         description: The token ID
 *     responses:
 *       200:
 *         description: Token preview retrieved successfully
 *       403:
 *         description: Forbidden (not owner)
 *       404:
 *         description: Token not found
 *       500:
 *         description: Server error
 */
router.get(
  '/preview/:tokenId',
  authenticate,
  tokenValidator.validateTokenId,
  validateRequest,
  tokenController.getTokenPreview
);

module.exports = router;
