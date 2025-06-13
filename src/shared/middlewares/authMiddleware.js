// src/shared/middlewares/authMiddleware.js
const { getAnonClient, getAdminClient } = require('../../configs/supabaseConfig');
const ApiError = require('../../utils/apiError');
const { logger } = require('../../utils/logger');

/**
 * Authentication middleware to protect routes
 * Verifies the JWT token from the Authorization header
 * and attaches user info to the request
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract the token from the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      throw new ApiError(401, 'Authentication required');
    }

    // Verify the token with Supabase using admin client
    const adminClient = getAdminClient();

    // Get user with the token using admin client
    const {
      data: { user },
      error
    } = await adminClient.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid authentication token', { error: error?.message });
      throw new ApiError(401, 'Invalid or expired token');
    }

    logger.debug(`Authenticated user: ${user.id} (${user.email})`);

    // Get user profile from the database using correct field (id, not user_id)
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)  // Changed from user_id to id
      .single();

    if (profileError) {
      logger.warn('User profile not found for authenticated user', {
        userId: user.id,
        email: user.email,
        error: profileError.message
      });

      // Create a default profile if it doesn't exist
      const { data: newProfile, error: createError } = await adminClient
        .from('user_profiles')
        .insert({
          id: user.id,  // Use id instead of user_id
          email: user.email.toLowerCase(),
          full_name: user.user_metadata?.full_name || user.email.split('@')[0],
          role: 'USER',
          is_verified: !!user.email_confirmed_at,
          provider: user.app_metadata?.provider || 'email',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        logger.error('Failed to create user profile', { 
          userId: user.id, 
          error: createError.message 
        });
        throw new ApiError(500, 'Failed to create user profile');
      }

      logger.info(`Created new profile for user: ${user.id}`);

      // Attach user and role to request object
      req.user = {
        id: user.id,
        email: user.email,
        role: newProfile.role || 'USER',
        fullName: newProfile.full_name || user.user_metadata?.full_name,
        isVerified: newProfile.is_verified,
        profile: newProfile
      };
    } else {
      // Attach user and role to request object
      req.user = {
        id: user.id,
        email: user.email,
        role: profile.role || 'USER',
        fullName: profile.full_name || user.user_metadata?.full_name,
        isVerified: profile.is_verified,
        profile: profile
      };
    }

    // Create and attach a supabase client for the user
    req.supabase = adminClient;

    logger.debug(`User authenticated successfully: ${req.user.email} (${req.user.role})`);

    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    next(error);
  }
};

/**
 * Role-based authorization middleware
 * @param {Array} roles - Array of allowed roles
 * @returns {Function} Middleware function
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      if (roles.length && !roles.includes(req.user.role)) {
        logger.warn('Unauthorized access attempt', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: roles,
          endpoint: req.originalUrl
        });
        throw new ApiError(403, 'Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional authentication middleware
 * Tries to authenticate but doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth header, continue without user
      req.user = null;
      req.supabase = getAnonClient();
      return next();
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      req.user = null;
      req.supabase = getAnonClient();
      return next();
    }

    // Try to authenticate
    const adminClient = getAdminClient();
    const {
      data: { user },
      error
    } = await adminClient.auth.getUser(token);

    if (error || !user) {
      // Invalid token, continue without user
      req.user = null;
      req.supabase = getAnonClient();
      return next();
    }

    // Get user profile
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) {
      req.user = {
        id: user.id,
        email: user.email,
        role: profile.role || 'USER',
        fullName: profile.full_name || user.user_metadata?.full_name,
        isVerified: profile.is_verified,
        profile: profile
      };
    } else {
      req.user = null;
    }

    req.supabase = adminClient;
    next();
  } catch (error) {
    // On any error, continue without user
    req.user = null;
    req.supabase = getAnonClient();
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth
};