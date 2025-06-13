// src/modules/auth/authService.js
const { getAnonClient, getAdminClient } = require('../../configs/supabaseConfig');
const { logger } = require('../../utils/logger');
const ApiError = require('../../utils/apiError');
const config = require('../../configs/envConfig');

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
    city: profile?.city,
    jobTitle: profile?.job_title,
    hobbies: profile?.hobbies || [],
    bio: profile?.bio,
    instagramHandle: profile?.instagram_handle,
    linkedinUrl: profile?.linkedin_url,
    websiteUrl: profile?.website_url,
    isVerified: profile?.is_verified || !!user.email_confirmed_at,
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
      .from('user_profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      logger.warn('Profile not created by trigger, creating manually:', profileError);

      // 5. If trigger didn't work, try using the direct RPC function
      const { data: rpcResult, error: rpcError } = await adminClient.rpc('create_user_profile', {
        user_id: authData.user.id,
        user_email: email.toLowerCase(),
        user_role: 'USER',
        user_name: fullName,
        is_verified: false
      });

      if (rpcError || (rpcResult && !rpcResult.success)) {
        logger.error('Failed to create user profile via RPC:', rpcError || rpcResult?.error);

        // 6. Last resort: Try direct insert with admin client
        const { data: newProfile, error: createError } = await adminClient
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            email: email.toLowerCase(),
            full_name: fullName,
            role: 'USER',
            is_verified: false,
            provider: 'email',
            registration_ip: ip,
            user_agent: userAgent,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          logger.error('All profile creation methods failed:', createError);

          // 7. Delete the auth user since we couldn't create a profile
          await adminClient.auth.admin.deleteUser(authData.user.id);

          throw new ApiError(500, 'Failed to create user profile after multiple attempts');
        }

        logger.info(`Profile created manually for user: ${authData.user.id}`);

        return {
          user: sanitizeUser(authData.user, newProfile),
          session: authData.session,
          message: 'Registration successful. Please verify your email.'
        };
      }

      // Get the profile created by RPC
      const { data: createdProfile } = await adminClient
        .from('user_profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      logger.info(`Profile created via RPC for user: ${authData.user.id}`);

      return {
        user: sanitizeUser(authData.user, createdProfile),
        session: authData.session,
        message: 'Registration successful. Please verify your email.'
      };
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
 * @returns {Promise<Object>} Login result
 */
const login = async ({ email, password }) => {
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
      .from('user_profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      logger.error(`User profile not found for ${authData.user.id}:`, profileError);
      throw new ApiError(404, 'User profile not found. Please complete registration process.');
    }

    // 3. Update last login using admin client
    await adminClient
      .from('user_profiles')
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', authData.user.id);

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
 * @returns {Promise<Object>} Logout result
 */
const logout = async () => {
  const supabase = getAnonClient();

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.error('Logout error:', error);
      throw new ApiError(500, 'Logout failed: ' + error.message);
    }

    logger.info('User logout successful');
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

    logger.info(`Session refreshed successfully for user: ${userData.user.email}`);

    return {
      session: data.session,
      user: userData.user,
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
 * @returns {Promise<Object>} Result message
 */
const forgotPassword = async (email) => {
  const supabase = getAnonClient();

  try {
    // For security reasons, don't reveal if user exists or not
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), {
      redirectTo: `${config.frontend.url}/reset-password`
    });

    if (error) {
      logger.error('Failed to send reset email:', error);
      // Still return success for security reasons
    }

    logger.info(`Password reset requested for: ${email}`);

    return {
      message: 'Password reset link has been sent. Please check your email.'
    };
  } catch (error) {
    logger.error('Forgot password error:', error);
    // Don't leak error details for security
    return {
      message: 'If an account exists with this email, a password reset link will be sent.'
    };
  }
};

/**
 * Reset password with token
 * @param {string} token - Reset token (from URL/session)
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} Result message
 */
const resetPassword = async (token, newPassword) => {
  const supabase = getAnonClient();

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
 * Get user profile by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User profile
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
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      logger.error('Profile not found:', profileError);
      throw new ApiError(404, 'Profile not found');
    }

    return sanitizeUser(user, profile);
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
 * @returns {Promise<Object>} Updated profile
 */
const updateProfile = async (
  userId,
  { fullName, age, city, jobTitle, hobbies, bio, instagramHandle, linkedinUrl, websiteUrl }
) => {
  const supabase = getAnonClient();
  const adminClient = getAdminClient();

  try {
    // Update auth user metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: fullName }
    });

    if (authError) {
      logger.error('Failed to update auth user:', authError);
      throw new ApiError(400, 'Failed to update user metadata');
    }

    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (fullName !== undefined) updateData.full_name = fullName;
    if (age !== undefined) updateData.age = age;
    if (city !== undefined) updateData.city = city;
    if (jobTitle !== undefined) updateData.job_title = jobTitle;
    if (hobbies !== undefined) updateData.hobbies = hobbies;
    if (bio !== undefined) updateData.bio = bio;
    if (instagramHandle !== undefined) updateData.instagram_handle = instagramHandle;
    if (linkedinUrl !== undefined) updateData.linkedin_url = linkedinUrl;
    if (websiteUrl !== undefined) updateData.website_url = websiteUrl;

    // Update profile using admin client to bypass RLS
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (profileError) {
      logger.error('Failed to update profile:', profileError);
      throw new ApiError(400, 'Failed to update profile');
    }

    // Get auth user to combine with profile
    const {
      data: { user }
    } = await supabase.auth.getUser();

    logger.info(`Profile updated for user: ${userId}`);

    return sanitizeUser(user, profile);
  } catch (error) {
    logger.error('Update profile error:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to update profile');
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
  sanitizeUser
};

module.exports = authService;
