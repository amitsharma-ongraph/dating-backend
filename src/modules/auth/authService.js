// src/modules/auth/authService.js
const { getAnonClient, getAdminClient } = require('../../configs/supabaseConfig');
const { logger } = require('../../utils/logger');
const ApiError = require('../../utils/apiError');
const config = require('../../configs/envConfig');

/**
 * Get client IP address from request object
 * @param {Object} req - Express request object (optional)
 * @returns {string|null} Client IP address or null
 */
const getClientIp = (req) => {
  try {
    if (req) {
      // If request object is provided, use it
      return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || null;
    }

    // Otherwise, return null as we can't determine the IP
    return null;
  } catch (error) {
    logger.warn('Failed to get client IP:', error);
    return null;
  }
};

/**
 * Get user agent from request object
 * @param {Object} req - Express request object (optional)
 * @returns {string|null} User agent or null
 */
const getUserAgent = (req) => {
  try {
    if (req) {
      return req.headers['user-agent'] || null;
    }
    return null;
  } catch (error) {
    logger.warn('Failed to get user agent:', error);
    return null;
  }
};

/**
 * Sanitize user data for client response
 * @param {Object} user - Supabase user object
 * @param {Object} profile - User profile from database
 * @returns {Object} Sanitized user object
 */
const sanitizeUser = (user, profile = null) => {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name || user.user_metadata?.full_name,
    role: profile?.role || 'USER',
    age: profile?.age,
    gender:profile?.gender,
    city: profile?.city,
    jobTitle: profile?.job_title,
    hobbies: profile?.hobbies || '',
    bio: profile?.bio,
    instagramHandle: profile?.instagram_handle,
    linkedinUrl: profile?.linkedin_url,
    websiteUrl: profile?.website_url,
    profileToken: profile?.profile_token, // Added to match schema
    isVerified: profile?.is_verified || !!user.email_confirmed_at,
    profileCompleted: profile?.profile_completed || false, // Added to match schema
    profileCompletionPercentage: profile?.profile_completion_percentage || 0, // Added to match schema
    lastLoginAt: profile?.last_login_at,
    createdAt: profile?.created_at,
    metadata: {
      provider: profile?.provider || user.app_metadata?.provider || 'email',
      avatarUrl: user.user_metadata?.avatar_url
    }
  };
};

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Registration result
 */
const register = async ({ email, password, fullName, ip, userAgent }) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    // 1. Check if user exists in Supabase auth
    const {
      data: { users },
      error: getUserError
    } = await adminClient.auth.admin.listUsers();

    if (getUserError) {
      logger.error('Error checking existing users:', getUserError);
      throw new ApiError(500, 'Failed to verify user existence');
    }

    const existingUser = users?.find((u) => u.email === email.toLowerCase());

    if (existingUser) {
      throw new ApiError(409, 'User already exists');
    }

    // 2. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName,
          registration_ip: ip,
          user_agent: userAgent
        },
        emailRedirectTo: `${config.frontend.url}/activate`
      }
    });

    if (authError) {
      logger.error('Auth signup error:', authError);
      throw new ApiError(400, authError.message);
    }

    if (!authData.user) {
      throw new ApiError(400, 'Failed to create user account');
    }

    logger.info(`Auth user created: ${authData.user.id}`);

    // 3. Wait briefly to allow the trigger to run (reduced from 2 seconds to 1)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Check if profile was created by trigger - using admin client to bypass RLS
    const { data: profile, error: profileError } = await adminClient
      .from('profiles') // Fixed: changed from user_profiles to profiles
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      logger.warn('Profile not created by trigger, creating manually:', profileError);

      // 5. Try generating a profile token
      let profileToken;
      try {
        const { data: generatedToken, error: tokenError } =
          await adminClient.rpc('generate_profile_token');
        if (tokenError) throw tokenError;
        profileToken = generatedToken;
      } catch (tokenGenError) {
        // Fallback to a simple token if RPC fails
        profileToken = `PRO-${Math.random().toString(36).substring(2, 15)}`;
        logger.warn(
          `Failed to generate profile token via RPC: ${tokenGenError.message}. Using fallback.`
        );
      }

      // 6. Create profile directly with admin client
      const { data: newProfile, error: createError } = await adminClient
        .from('profiles') // Fixed: changed from user_profiles to profiles
        .insert({
          id: authData.user.id,
          email: email.toLowerCase(),
          profile_token: profileToken,
          full_name: fullName,
          role: 'USER',
          is_verified: false,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        logger.error('Failed to create profile:', createError);

        // 7. Delete the auth user since we couldn't create a profile
        await adminClient.auth.admin.deleteUser(authData.user.id);

        throw new ApiError(500, 'Failed to create user profile');
      }

      // 8. Log profile token creation
      try {
        await adminClient.from('token_activity_logs').insert({
          log_type: 'profile_token',
          profile_id: authData.user.id,
          activity_type: 'created',
          ip_address: ip,
          user_agent: userAgent,
          metadata: { created_by: 'registration' }
        });
      } catch (logError) {
        logger.warn(`Failed to log token creation: ${logError.message}`);
      }

      // 9. Log signup event
      try {
        await adminClient.from('auth_audit_log').insert({
          user_id: authData.user.id,
          event_type: 'signup',
          ip_address: ip,
          user_agent: userAgent,
          metadata: { provider: 'email' }
        });
      } catch (auditError) {
        logger.warn(`Failed to log signup event: ${auditError.message}`);
      }

      logger.info(`Profile created manually for user: ${authData.user.id}`);

      return {
        user: sanitizeUser(authData.user, newProfile),
        session: authData.session,
        message: 'Registration successful. Please verify your email.'
      };
    }

    // If profile was found, log signup event if not already done
    try {
      await adminClient.from('auth_audit_log').insert({
        user_id: authData.user.id,
        event_type: 'signup',
        ip_address: ip,
        user_agent: userAgent,
        metadata: { provider: 'email' }
      });
    } catch (auditError) {
      logger.warn(`Failed to log signup event: ${auditError.message}`);
    }

    logger.info(`Profile found/created for user: ${authData.user.id}`);

    return {
      user: sanitizeUser(authData.user, profile),
      session: authData.session,
      message: 'Registration successful. Please verify your email.'
    };
  } catch (error) {
    logger.error('Registration error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Registration failed: ' + error.message);
  }
};

/**
 * Login with email and password
 * @param {Object} credentials - Login credentials
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Login result
 */
const login = async ({ email, password }, req) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    logger.info(`Attempting login for user: ${email}`);

    // 1. Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    });

    if (authError) {
      logger.error('Login error:', authError);

      if (authError.message.includes('Email not confirmed')) {
        throw new ApiError(401, 'Please verify your email before logging in');
      }
      if (authError.message.includes('Invalid login credentials')) {
        throw new ApiError(401, 'Invalid email or password');
      }
      throw new ApiError(401, authError.message);
    }

    if (!authData || !authData.user) {
      logger.error('Login failed: No user data returned');
      throw new ApiError(401, 'Authentication failed');
    }

    logger.info(`User authenticated successfully: ${authData.user.id}`);

    // 2. Get user profile using admin client to bypass RLS
    const { data: profile, error: profileError } = await adminClient
      .from('profiles') // Fixed: changed from user_profiles to profiles
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      logger.error(`User profile not found for ${authData.user.id}:`, profileError);
      throw new ApiError(404, 'User profile not found. Please complete registration process.');
    }

    // 3. Update last login using admin client
    await adminClient
      .from('profiles') // Fixed: changed from user_profiles to profiles
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', authData.user.id);

    // 4. Log audit event
    try {
      await adminClient.from('auth_audit_log').insert({
        user_id: authData.user.id,
        event_type: 'login',
        ip_address: getClientIp(req),
        user_agent: getUserAgent(req),
        metadata: { method: 'password' }
      });
    } catch (auditError) {
      logger.warn('Failed to log audit event:', auditError);
    }

    logger.info(`Login successful for user: ${email} with role: ${profile.role}`);

    return {
      user: sanitizeUser(authData.user, profile),
      session: authData.session,
      message: 'Login successful'
    };
  } catch (error) {
    logger.error('Login error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Login failed: ' + error.message);
  }
};

/**
 * Log out current user
 * @param {string} userId - User ID (optional)
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Logout result
 */
const logout = async (userId = null, req = null) => {
  const supabase = req && req.supabase ? req.supabase : getAnonClient();
  const adminClient = getAdminClient();

  try {
    // Log audit event if userId is provided
    if (userId) {
      try {
        await adminClient
          .from('auth_audit_log')
          .insert({
            user_id: userId,
            event_type: 'logout',
            ip_address: getClientIp(req),
            user_agent: getUserAgent(req),
            metadata: {}
          });
      } catch (auditError) {
        logger.warn('Failed to log logout event:', auditError);
        // Continue with logout even if logging fails
      }
    }

    // Get the current session before logging out
    const { data: { session } } = await supabase.auth.getSession();
    
    // Sign out with the specific session if available
    const { error } = session 
      ? await supabase.auth.signOut({ scope: 'global' }) // Invalidate all sessions
      : await supabase.auth.signOut();
      
    if (error) {
      logger.error('Logout error:', error);
      throw new ApiError(500, 'Logout failed: ' + error.message);
    }

    // If you're using Supabase's JWT, you might need to blacklist the token
    // This depends on your Supabase setup and JWT handling
    if (userId && session?.access_token) {
      try {
        // Optional: Add the token to a blacklist table
        await adminClient
          .from('auth_blacklisted_tokens')
          .insert({
            user_id: userId,
            token: session.access_token,
            expires_at: new Date(session.expires_at * 1000).toISOString()
          })
          .onConflict('token')
          .ignore();
      } catch (blacklistError) {
        logger.warn('Failed to blacklist token:', blacklistError);
      }
    }

    logger.info(`User logout successful: ${userId || 'Anonymous'}`);
    return { message: 'Logout successful' };
  } catch (error) {
    logger.error('Logout error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Logout failed');
  }
};

/**
 * Refresh session with refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New session
 */
const refreshSession = async (refreshToken) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    logger.info('Attempting to refresh session');

    // First, try to refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error) {
      logger.error('Session refresh error:', error);
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    if (!data.session || !data.session.access_token) {
      logger.error('No session data returned from refresh');
      throw new ApiError(401, 'Failed to refresh session');
    }

    // Get user info with the new session
    const { data: userData, error: userError } = await supabase.auth.getUser(
      data.session.access_token
    );

    if (userError || !userData.user) {
      logger.error('Failed to get user after refresh:', userError);
      throw new ApiError(401, 'Failed to validate refreshed session');
    }

    // Get the user profile
    const { data: profile, error: profileError } = await adminClient
      .from('profiles') // Fixed: changed from user_profiles to profiles
      .select('*')
      .eq('id', userData.user.id)
      .single();

    // If profile not found, just log the error but don't fail the refresh
    if (profileError) {
      logger.warn(
        `Could not fetch profile during refresh for user ${userData.user.id}:`,
        profileError
      );
    }

    logger.info(`Session refreshed successfully for user: ${userData.user.email}`);

    return {
      session: data.session,
      user: sanitizeUser(userData.user, profile || null),
      message: 'Session refreshed successfully'
    };
  } catch (error) {
    logger.error('Refresh session error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Session refresh failed');
  }
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Result message
 */
const forgotPassword = async (email, req) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    // For security reasons, don't reveal if user exists or not
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
      redirectTo: `${config.frontend.url}/reset-password`
    });

    if (error) {
      logger.error('Failed to send reset email:', error);
    } else {
      try {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('id')
          .eq('email', email.toLowerCase())
          .single();

        if (profile) {
          await adminClient.from('auth_audit_log').insert({
            user_id: profile.id,
            event_type: 'password_reset_requested',
            ip_address: getClientIp(req),
            user_agent: getUserAgent(req),
            metadata: {}
          });
        }
      } catch (logError) {
        logger.warn('Failed to log password reset request:', logError);
      }
    }

    logger.info(`Password reset requested for: ${email}`);

    return {
      message: 'Password reset link has been sent. Please check your email.'
    };
  } catch (error) {
    logger.error('Forgot password error:', error);
    return {
      message: 'If an account exists with this email, a password reset link will be sent.'
    };
  }
};

/**
 * Reset password with token
 * @param {string} token - Reset token (from URL/session)
 * @param {string} newPassword - New password
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Result message
 */
const resetPassword = async (token, newPassword, req) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    // First, verify the OTP token from the reset link
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: token, // The token from the URL
      type: 'recovery' // Specify it's a recovery token
    });

    if (verifyError) {
      logger.error('Token verification error:', verifyError);
      throw new ApiError(400, 'Invalid or expired reset token: ' + verifyError.message);
    }

    // Now that we have a valid session, update the password
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      logger.error('Password reset error:', error);
      throw new ApiError(400, 'Password reset failed: ' + error.message);
    }

    // Log the password reset completion
    try {
      if (data && data.user) {
        await adminClient.from('auth_audit_log').insert({
          user_id: data.user.id,
          event_type: 'password_reset_completed',
          ip_address: getClientIp(req),
          user_agent: getUserAgent(req),
          metadata: {}
        });
      }
    } catch (logError) {
      logger.warn('Failed to log password reset completion:', logError);
    }

    logger.info('Password reset successful');

    return {
      message: 'Password has been reset successfully'
    };
  } catch (error) {
    logger.error('Reset password error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Password reset failed');
  }
};

/**
 * Get current session
 * @returns {Promise<Object>} Current session
 */
const getSession = async () => {
  const supabase = getAnonClient();

  try {
    const {
      data: { session },
      error
    } = await supabase.auth.getSession();

    if (error) {
      logger.error('Get session error:', error);
      throw new ApiError(401, 'Failed to get session');
    }

    return session;
  } catch (error) {
    logger.error('Get session error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to get session');
  }
};

/**
 * Get user profile by ID with all related information
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Complete user profile with related data
 */
const getProfile = async (userId) => {
  const adminClient = getAdminClient();

  try {
    // Get auth user using admin client
    const {
      data: { user },
      error: userError
    } = await adminClient.auth.admin.getUserById(userId);

    if (userError) {
      logger.error('Failed to get auth user:', userError);
      throw new ApiError(401, 'Failed to get user');
    }

    // Get profile using admin client to bypass RLS
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      logger.error('Profile not found:', profileError);
      throw new ApiError(404, 'Profile not found');
    }

    // Get user photos
    const { data: photos, error: photosError } = await adminClient
      .from('user_photos')
      .select('*')
      .eq('user_id', userId)
      .order('photo_order', { ascending: true });

    if (photosError) {
      logger.warn('Failed to fetch user photos:', photosError);
      // Continue without photos rather than failing the whole request
    }

    // Get user social links
    const { data: socialLinks, error: socialLinksError } = await adminClient
      .from('user_social_links')
      .select('*')
      .eq('user_id', userId);

    if (socialLinksError) {
      logger.warn('Failed to fetch user social links:', socialLinksError);
      // Continue without social links
    }

    // Get user default video
    const { data: defaultVideo, error: videoError } = await adminClient
      .from('videos')
      .select('*')
      .eq('user_id', userId)
      .eq('video_type', 'default')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (videoError && !videoError.message.includes('No rows found')) {
      logger.warn('Failed to fetch user default video:', videoError);
      // Continue without default video
    }

    // Get response statistics
    const { data: responseStats } = await adminClient.rpc('get_response_funnel', { p_user_id: userId });

    // Create a complete user profile object
    const completeProfile = {
      ...sanitizeUser(user, profile),
      photos: photos || [],
      socialLinks: socialLinks || [],
      defaultVideo: defaultVideo || null,
      responseStats: responseStats || null
    };

    return completeProfile;
  } catch (error) {
    logger.error('Get profile error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to get profile');
  }
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} data - Profile data to update
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Updated profile
 */
const updateProfile = async (
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
) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    // Start a transaction
    // Note: Supabase doesn't support true transactions in the client yet,
    // but we'll structure this as if it does for future compatibility

    // 1. Update auth user metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: fullName }
    });

    if (authError) {
      logger.error('Failed to update auth user:', authError);
      throw new ApiError(400, 'Failed to update user metadata');
    }

    // 2. Prepare profile update data
    const profileUpdateData = {
      updated_at: new Date().toISOString()
    };

    if (fullName !== undefined) profileUpdateData.full_name = fullName;
    if (age !== undefined) profileUpdateData.age = age;
    if (city !== undefined) profileUpdateData.city = city;
    if (jobTitle !== undefined) profileUpdateData.job_title = jobTitle;
    if (gender !== undefined) profileUpdateData.gender = gender;
    // Convert hobbies array to a string if needed based on your schema
    if (hobbies !== undefined) {
      profileUpdateData.hobbies = Array.isArray(hobbies) 
        ? hobbies.join(', ') 
        : hobbies;
    }
    if (bio !== undefined) profileUpdateData.bio = bio;

    // 3. Update profile in the correct profiles table
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')  // FIXED: Changed from user_profiles to profiles
      .update(profileUpdateData)
      .eq('id', userId)
      .select()
      .single();

    if (profileError) {
      logger.error('Failed to update profile:', profileError);
      throw new ApiError(400, 'Failed to update profile');
    }

    // 4. Handle social links
    const socialLinksUpdates = [];

    // Handle Instagram
    if (instagramHandle !== undefined) {
      socialLinksUpdates.push(
        adminClient
          .from('user_social_links')
          .upsert(
            {
              user_id: userId,
              platform: 'instagram',
              username: instagramHandle.replace('@', ''),
              url: `https://instagram.com/${instagramHandle.replace('@', '')}`,
              created_at: new Date().toISOString()
            },
            { onConflict: 'user_id,platform', ignoreDuplicates: false }
          )
      );
    }

    // Handle LinkedIn
    if (linkedinUrl !== undefined) {
      socialLinksUpdates.push(
        adminClient
          .from('user_social_links')
          .upsert(
            {
              user_id: userId,
              platform: 'linkedin',
              username: linkedinUrl.split('/').pop() || 'profile',
              url: linkedinUrl,
              created_at: new Date().toISOString()
            },
            { onConflict: 'user_id,platform', ignoreDuplicates: false }
          )
      );
    }

    // Handle Website
    if (websiteUrl !== undefined) {
      socialLinksUpdates.push(
        adminClient
          .from('user_social_links')
          .upsert(
            {
              user_id: userId,
              platform: 'other',
              username: 'website',
              url: websiteUrl,
              created_at: new Date().toISOString()
            },
            { onConflict: 'user_id,platform', ignoreDuplicates: false }
          )
      );
    }

    // Execute all social link updates in parallel
    if (socialLinksUpdates.length > 0) {
      const socialResults = await Promise.allSettled(socialLinksUpdates);
      
      // Log any errors with social link updates but don't fail the whole operation
      socialResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.warn(`Failed to update social link #${index}:`, result.reason);
        }
      });
    }

    // 5. Log profile update
    try {
      await adminClient
        .from('auth_audit_log')
        .insert({
          user_id: userId,
          event_type: 'profile_updated',
          ip_address: getClientIp(req),
          user_agent: getUserAgent(req),
          metadata: { 
            fields_updated: Object.keys(profileUpdateData)
              .filter(k => k !== 'updated_at'),
            social_links_updated: Object.entries({
              instagram: instagramHandle !== undefined,
              linkedin: linkedinUrl !== undefined,
              website: websiteUrl !== undefined
            })
            .filter(([_, updated]) => updated)
            .map(([platform]) => platform)
          }
        });
    } catch (logError) {
      logger.warn('Failed to log profile update:', logError);
    }

    // 6. Get updated auth user
    const {
      data: { user }
    } = await supabase.auth.getUser();

    // 7. Fetch updated social links for returning
    const { data: socialLinks } = await adminClient
      .from('user_social_links')
      .select('*')
      .eq('user_id', userId);

    logger.info(`Profile updated for user: ${userId}`);

    // 8. Return complete user profile with updated social links
    const updatedProfile = sanitizeUser(user, profile);
    return {
      ...updatedProfile,
      socialLinks: socialLinks || []
    };
  } catch (error) {
    logger.error('Update profile error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to update profile');
  }
};

/**
 * Verify email with token
 * @param {string} token - Email verification token
 * @returns {Promise<Object>} Result message
 */
const verifyEmail = async (token) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    // Verify the OTP token
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'email'
    });

    if (error) {
      logger.error('Email verification error:', error);
      throw new ApiError(400, 'Invalid or expired verification link');
    }

    if (!data.user) {
      throw new ApiError(400, 'User not found for the provided verification token');
    }

    // Update profile verification status
    await adminClient
      .from('profiles') // Fixed: changed from user_profiles to profiles
      .update({
        is_verified: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.user.id);

    // Log email verification
    try {
      await adminClient.from('auth_audit_log').insert({
        user_id: data.user.id,
        event_type: 'account_activated',
        metadata: { method: 'email_verification' }
      });
    } catch (logError) {
      logger.warn('Failed to log email verification:', logError);
    }

    logger.info(`Email verified for user: ${data.user.id}`);

    return {
      user: data.user,
      message: 'Email verified successfully'
    };
  } catch (error) {
    logger.error('Email verification error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Email verification failed: ' + error.message);
  }
};

/**
 * Change password for authenticated user
 * @param {string} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Result message
 */
const changePassword = async (userId, currentPassword, newPassword, req) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    // First verify the current password by attempting a login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: req.user.email, // Assuming req.user contains the email
      password: currentPassword
    });

    if (authError || !authData.user) {
      logger.error('Current password verification failed:', authError);
      throw new ApiError(401, 'Current password is incorrect');
    }

    // Change the password
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      logger.error('Password change error:', error);
      throw new ApiError(400, 'Failed to change password: ' + error.message);
    }

    // Log password change
    try {
      await adminClient.from('auth_audit_log').insert({
        user_id: userId,
        event_type: 'password_changed',
        ip_address: getClientIp(req),
        user_agent: getUserAgent(req),
        metadata: {}
      });
    } catch (logError) {
      logger.warn('Failed to log password change:', logError);
    }

    logger.info(`Password changed for user: ${userId}`);

    return {
      message: 'Password changed successfully'
    };
  } catch (error) {
    logger.error('Change password error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to change password: ' + error.message);
  }
};

/**
 * Deactivate/reactivate user account
 * @param {string} userId - User ID
 * @param {boolean} active - Whether to activate (true) or deactivate (false)
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Result message
 */
const setAccountStatus = async (userId, active, req) => {
  const adminClient = getAdminClient();

  try {
    // Update profile status
    const { data: profile, error: profileError } = await adminClient
      .from('profiles') // Fixed: changed from user_profiles to profiles
      .update({
        is_active: active,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (profileError) {
      logger.error('Failed to update account status:', profileError);
      throw new ApiError(400, 'Failed to update account status');
    }

    // Log account status change
    try {
      await adminClient.from('auth_audit_log').insert({
        user_id: userId,
        event_type: active ? 'account_activated' : 'account_deactivated',
        ip_address: getClientIp(req),
        user_agent: getUserAgent(req),
        metadata: { by: req.user?.id || 'system' }
      });
    } catch (logError) {
      logger.warn('Failed to log account status change:', logError);
    }

    logger.info(`Account ${active ? 'activated' : 'deactivated'} for user: ${userId}`);

    return {
      message: `Account ${active ? 'activated' : 'deactivated'} successfully`,
      user: profile
    };
  } catch (error) {
    logger.error('Set account status error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to update account status: ' + error.message);
  }
};

// Export all service functions
const authService = {
  register,
  login,
  logout,
  refreshSession,
  forgotPassword,
  resetPassword,
  getSession,
  getProfile,
  updateProfile,
  verifyEmail,
  changePassword,
  setAccountStatus,
  sanitizeUser
};

module.exports = authService;
