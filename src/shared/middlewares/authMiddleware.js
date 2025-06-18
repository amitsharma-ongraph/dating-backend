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

    logger.debug('Auth header received:', authHeader ? 'Present' : 'Missing');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Invalid authorization header format', {
        hasHeader: !!authHeader,
        headerStart: authHeader ? authHeader.substring(0, 10) + '...' : 'N/A'
      });
      throw new ApiError(401, 'Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      logger.warn('Empty token after Bearer prefix');
      throw new ApiError(401, 'Authentication required');
    }

    logger.debug('Token extracted, length:', token.length);

    // Verify the token with Supabase using admin client
    const adminClient = getAdminClient();

    // Get user with the token using admin client
    const {
      data: { user },
      error
    } = await adminClient.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid authentication token', { 
        error: error?.message,
        hasUser: !!user 
      });
      throw new ApiError(401, 'Invalid or expired token');
    }

    logger.debug(`Authenticated user: ${user.id} (${user.email})`);

    // Get user profile from the database - FIXED TABLE NAME
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      logger.warn('User profile not found for authenticated user', {
        userId: user.id,
        email: user.email,
        error: profileError.message
      });

      // Create a default profile if it doesn't exist - FIXED TABLE NAME
      const { data: newProfile, error: createError } = await adminClient
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email.toLowerCase(),
          full_name: user.user_metadata?.full_name || user.email.split('@')[0],
          role: 'USER',
          is_verified: !!user.email_confirmed_at,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Generate profile token automatically
          profile_token: `PRO-${Math.random().toString(36).substr(2, 15).toUpperCase()}`
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
        profileToken: newProfile.profile_token,
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
        profileToken: profile.profile_token,
        profile: profile
      };
    }

    // Create and attach a supabase client for the user
    req.supabase = adminClient;

    logger.debug(`User authenticated successfully: ${req.user.email} (${req.user.role})`);

    next();
  } catch (error) {
    logger.error('Authentication middleware error:', {
      message: error.message,
      stack: error.stack,
      headers: {
        authorization: req.headers.authorization ? 'Present' : 'Missing',
        'user-agent': req.headers['user-agent']
      }
    });
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

    // Get user profile - FIXED TABLE NAME (was user_profiles, should be profiles)
    const { data: profile } = await adminClient
      .from('profiles')
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
        profileToken: profile.profile_token,
        profile: profile
      };
    } else {
      req.user = null;
    }

    req.supabase = adminClient;
    next();
  } catch (error) {
    // On any error, continue without user
    logger.warn('Optional auth failed, continuing without user', {
      error: error.message
    });
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