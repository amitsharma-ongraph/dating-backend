  // src/modules/auth/authController.js
  const authService = require('./authService.js');
  const { logger } = require('../../utils/logger.js');
  const asyncHandler = require('../../shared/handlers/asyncHandler.js');
  const { ResponseHandler } = require('../../shared/handlers/responseHandler.js');

  /**
   * @swagger
   * tags:
   *   name: Authentication
   *   description: User authentication endpoints
   */

  const authController = {
    /**
     * @swagger
     * /api/v1/auth/register:
     *   post:
     *     summary: Register a new user
     *     tags: [Authentication]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/RegisterRequest'
     *     responses:
     *       201:
     *         description: User registered successfully
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
     *                   example: Registration successful. Please verify your email.
     *                 data:
     *                   type: object
     *                   properties:
     *                     user:
     *                       type: object
     *                     session:
     *                       type: object
     *       400:
     *         description: Invalid input
     *       409:
     *         description: User already exists
     *       500:
     *         description: Server error
     */
    register: asyncHandler(async (req, res) => {
      const { email, password, fullName } = req.body;

      const userData = {
        email,
        password,
        fullName,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get('User-Agent')
      };

      const result = await authService.register(userData);

      logger.info(`User registration successful: ${email}`);

      return ResponseHandler.success(
        res,
        {
          user: result.user,
          session: result.session
        },
        result.message,
        201
      );
    }),

    /**
     * @swagger
     * /api/v1/auth/login:
     *   post:
     *     summary: Login with email and password
     *     tags: [Authentication]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LoginRequest'
     *     responses:
     *       200:
     *         description: Login successful
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
     *                   example: Login successful
     *                 data:
     *                   type: object
     *                   properties:
     *                     user:
     *                       type: object
     *                     session:
     *                       type: object
     *       401:
     *         description: Invalid credentials or email not verified
     *       500:
     *         description: Server error
     */
    login: asyncHandler(async (req, res) => {
      const { email, password } = req.body;

      const result = await authService.login({ email, password });

      logger.info(`User login successful: ${email}`);

      return ResponseHandler.success(
        res,
        {
          user: result.user,
          session: result.session
        },
        result.message
      );
    }),

    /**
     * @swagger
     * /api/v1/auth/logout:
     *   post:
     *     summary: Logout current user
     *     tags: [Authentication]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Logout successful
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
     *                   example: Logout successful
     *       401:
     *         description: Unauthorized
     *       500:
     *         description: Server error
     */
    logout: asyncHandler(async (req, res) => {
      const result = await authService.logout();

      logger.info(`User logout successful: ${req.user.email}`);

      return ResponseHandler.success(res, null, result.message);
    }),

    /**
     * @swagger
     * /api/v1/auth/refresh:
     *   post:
     *     summary: Refresh authentication token
     *     tags: [Authentication]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/RefreshTokenRequest'
     *     responses:
     *       200:
     *         description: Session refreshed successfully
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
     *                   example: Session refreshed successfully
     *                 data:
     *                   type: object
     *                   properties:
     *                     session:
     *                       type: object
     *                     user:
     *                       type: object
     *       401:
     *         description: Invalid refresh token
     *       500:
     *         description: Server error
     */
    refreshSession: asyncHandler(async (req, res) => {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return ResponseHandler.error(res, 'Refresh token not provided', 401);
      }

      const result = await authService.refreshSession(refreshToken);

      logger.info('Session refreshed successfully');

      return ResponseHandler.success(
        res,
        {
          session: result.session,
          user: result.user
        },
        result.message
      );
    }),

    /**
     * @swagger
     * /api/v1/auth/forgot-password:
     *   post:
     *     summary: Request password reset email
     *     tags: [Authentication]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/ForgotPasswordRequest'
     *     responses:
     *       200:
     *         description: Password reset email sent
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
     *                   example: Password reset link has been sent. Please check your email.
     *       500:
     *         description: Server error
     */
    forgotPassword: asyncHandler(async (req, res) => {
      const { email } = req.body;

      const result = await authService.forgotPassword(email);

      logger.info(`Password reset requested for: ${email}`);

      return ResponseHandler.success(res, null, result.message);
    }),

    /**
     * @swagger
     * /api/v1/auth/reset-password:
     *   post:
     *     summary: Reset password with token
     *     tags: [Authentication]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/ResetPasswordRequest'
     *     responses:
     *       200:
     *         description: Password reset successful
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
     *                   example: Password has been reset successfully
     *       400:
     *         description: Invalid input or token
     *       500:
     *         description: Server error
     */
    resetPassword: asyncHandler(async (req, res) => {
      const { token, newPassword } = req.body;

      const result = await authService.resetPassword(token, newPassword);

      logger.info('Password reset successful');

      return ResponseHandler.success(res, null, result.message);
    }),

    /**
     * @swagger
     * /api/v1/auth/profile:
     *   get:
     *     summary: Get user profile
     *     tags: [Authentication]
     *     security:
     *       - bearerAuth: []
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
     *                     user:
     *                       type: object
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Profile not found
     *       500:
     *         description: Server error
     */
    getProfile: asyncHandler(async (req, res) => {
      const userId = req.user.id;

      const user = await authService.getProfile(userId);

      return ResponseHandler.success(res, user, 'Profile retrieved successfully');
    }),

    /**
     * @swagger
     * /api/v1/auth/profile:
     *   put:
     *     summary: Update user profile
     *     tags: [Authentication]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/UpdateProfileRequest'
     *     responses:
     *       200:
     *         description: Profile updated successfully
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
     *                   example: Profile updated successfully
     *                 data:
     *                   type: object
     *                   properties:
     *                     user:
     *                       type: object
     *                       properties:
     *                         id:
     *                           type: string
     *                           format: uuid
     *                         email:
     *                           type: string
     *                         fullName:
     *                           type: string
     *                         role:
     *                           type: string
     *                         age:
     *                           type: integer
     *                         city:
     *                           type: string
     *                         jobTitle:
     *                           type: string
     *                         hobbies:
     *                           type: array
     *                           items:
     *                             type: string
     *                         bio:
     *                           type: string
     *                         profileToken:
     *                           type: string
     *                         isVerified:
     *                           type: boolean
     *                         profileCompleted:
     *                           type: boolean
     *                         profileCompletionPercentage:
     *                           type: integer
     *                         metadata:
     *                           type: object
     *                     socialLinks:
     *                       type: array
     *                       items:
     *                         type: object
     *                         properties:
     *                           platform:
     *                             type: string
     *                           username:
     *                             type: string
     *                           url:
     *                             type: string
     *       400:
     *         description: Invalid input
     *       401:
     *         description: Unauthorized
     *       500:
     *         description: Server error
     */
    updateProfile: asyncHandler(async (req, res) => {
      const userId = req.user.id;
      const {
        fullName,
        age,
        city,
        jobTitle,
        hobbies,
        bio,
        instagramHandle,
        linkedinUrl,
        websiteUrl,
        gender
      } = req.body;

      const result = await authService.updateProfile(
        userId,
        {
          fullName,
          age,
          city,
          jobTitle,
          hobbies,
          bio,
          instagramHandle,
          linkedinUrl,
          websiteUrl,
          gender
        },
        req
      );


      logger.info(`Profile updated for user: ${userId}`);

      return ResponseHandler.success(
        res,
        {
          user: result,
          socialLinks: result.socialLinks
        },
        'Profile updated successfully'
      );
    })
  };

  module.exports = { authController };
