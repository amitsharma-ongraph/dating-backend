// src/modules/token/tokenService.js
const { getAdminClient } = require('../../configs/supabaseConfig');
const supabase = getAdminClient();
const { colorLogger } = require('../../utils/logger');
const ApiError = require('../../utils/apiError');

/**
 * Get client IP address from request object
 * @param {Object} req - Express request object
 * @returns {string|null} Client IP address or null
 */
const getClientIp = (req) => {
  try {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      // x-forwarded-for can be a comma-separated list, take the first one
      return xff.split(',')[0].trim();
    }
    return req.socket.remoteAddress || null;
  } catch (error) {
    colorLogger.warn('Failed to get client IP:', error);
    return null;
  }
};

/**
 * Get user agent from request object
 * @param {Object} req - Express request object
 * @returns {string|null} User agent or null
 */
const getUserAgent = (req) => {
  try {
    return req.headers['user-agent'] || null;
  } catch (error) {
    colorLogger.warn('Failed to get user agent:', error);
    return null;
  }
};

/**
 * Get profile by token ID
 * @param {string} tokenId - Token ID
 * @param {Object} req - Express request object for IP and user agent tracking
 * @returns {Promise<Object>} Profile data
 */
const getProfileByToken = async (tokenId, req) => {
  if (!tokenId) {
    throw new ApiError(400, 'Token ID is required');
  }

  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req);

  try {
    // Call the stored procedure to access profile by token
    // This will also log the view in token_activity_logs
    const { data, error } = await supabase.rpc('access_profile_by_token', {
      p_profile_token: tokenId,
      p_ip_address: clientIp,
      p_user_agent: userAgent
    });

    if (error) {
      colorLogger.error(`Error accessing profile by token ${tokenId}: ${error.message}`);
      throw new ApiError(404, 'Token not found or invalid');
    }

    if (!data.success) {
      throw new ApiError(404, data.error || 'Failed to access profile');
    }

    // Get token status
    const { data: tokenData, error: tokenError } = await supabase
      .from('video_tokens')
      .select('id, status, created_at, expires_at, viewed_at')
      .eq('token_code', tokenId)
      .single();

    // Combine profile data with token status
    const profileWithToken = {
      ...data,
      tokenStatus: tokenData || { status: 'active' }
    };

    return profileWithToken;
  } catch (error) {
    colorLogger.error(`Error in getProfileByToken: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve profile');
  }
};

/**
 * Get video by token ID
 * @param {string} tokenId - Token ID
 * @param {Object} req - Express request object for IP and user agent tracking
 * @returns {Promise<Object>} Video data
 */
const getVideoByToken = async (tokenId, req) => {
  if (!tokenId) {
    throw new ApiError(400, 'Token ID is required');
  }

  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req);

  try {
    // Call the stored procedure to access video by token
    // This will also mark the token as viewed and log the activity
    console.log("user ip address----------->",userAgent)
    const { data, error } = await supabase.rpc('access_video_by_token', {
      p_token_code: tokenId,
      p_ip_address: clientIp,
      p_user_agent: userAgent
    });

    if (error) {
      colorLogger.error(`Error accessing video by token ${tokenId}: ${error.message}`);
      throw new ApiError(404, 'Token not found or invalid');
    }

    if (!data.success) {
      throw new ApiError(404, data.error || 'Failed to access video');
    }

    return data;
  } catch (error) {
    colorLogger.error(`Error in getVideoByToken: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve video');
  }
};

/**
 * Submit a response to a token
 * @param {string} tokenId - Token ID
 * @param {Object} responseData - Response data from the viewer
 * @param {Object} req - Express request object for IP and user agent tracking
 * @returns {Promise<Object>} Response result
 */
const submitTokenResponse = async (tokenId, responseData, req) => {
  if (!tokenId) {
    throw new ApiError(400, 'Token ID is required');
  }

  const { name, email, phone, instagram, preferredContact, interestLevel, message } = responseData;

  if (!name || !interestLevel) {
    throw new ApiError(400, 'Name and interest level are required');
  }

  // Validate interest level
  if (!['interested', 'maybe_later', 'not_interested'].includes(interestLevel)) {
    throw new ApiError(400, 'Invalid interest level');
  }

  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req);

  // Check if this is a profile token (starts with 'PRO-')
  if (tokenId.startsWith('PRO-')) {
    try {
      // Find the profile by profile_token
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('profile_token', tokenId)
        .single();

      if (profileError || !profile) {
        colorLogger.error(`Error retrieving profile for token ${tokenId}: ${profileError?.message}`);
        throw new ApiError(404, 'Profile not found for this token');
      }

      // Additional validation for interested responses
      if (interestLevel === 'interested') {
        if (!email && !phone && !instagram) {
          throw new ApiError(
            400,
            'At least one contact method (email, phone, or Instagram) is required for interested responses'
          );
        }
        if (preferredContact) {
          if (preferredContact === 'email' && !email) {
            throw new ApiError(
              400,
              'Email is required when email is selected as preferred contact method'
            );
          } else if (preferredContact === 'phone' && !phone) {
            throw new ApiError(
              400,
              'Phone is required when phone is selected as preferred contact method'
            );
          } else if (preferredContact === 'instagram' && !instagram) {
            throw new ApiError(
              400,
              'Instagram is required when Instagram is selected as preferred contact method'
            );
          }
        }
      }

      // Create the viewer response for profile
      const viewerResponse = {
        response_type: 'profile',
        profile_id: profile.id,
        interest_level: interestLevel,
        viewer_name: name,
        viewer_email: email || null,
        viewer_phone: phone || null,
        viewer_instagram: instagram || null,
        preferred_contact_method: preferredContact || null,
        message: message || null,
        ip_address: clientIp,
        user_agent: userAgent
      };

      // Insert response into viewer_responses table
      const { data: response, error: responseError } = await supabase
        .from('viewer_responses')
        .insert(viewerResponse)
        .select()
        .single();

      if (responseError) {
        colorLogger.error(`Error creating profile response: ${responseError.message}`);
        throw new ApiError(500, 'Failed to submit response');
      }

      // Create notification for the profile owner
      let notificationTitle = `New Response: ${name}`;
      let notificationMessage = '';
      if (interestLevel === 'interested') {
        notificationMessage = `${name} is interested in connecting with you!`;
      } else if (interestLevel === 'maybe_later') {
        notificationMessage = `${name} might be interested later.`;
      } else {
        notificationMessage = `${name} is not interested at this time.`;
      }

      await supabase.from('notifications').insert({
        user_id: profile.id, // profile.id is the user_id in this context
        type: 'interested_response',
        title: notificationTitle,
        message: notificationMessage,
        metadata: {
          response_id: response.id,
          profile_id: profile.id,
          interest_level: interestLevel
        }
      });

      return {
        id: response.id,
        interestLevel,
        success: true
      };
    } catch (error) {
      colorLogger.error(`Error in submitTokenResponse (profile): ${error.message}`);
      if (error instanceof ApiError) throw error;
      throw new ApiError(error.statusCode || 500, error.message || 'Failed to submit response');
    }
  }

  try {
    // Get token information
    const { data: tokenData, error: tokenError } = await supabase
      .from('video_tokens')
      .select('id, user_id, video_id, status')
      .eq('token_code', tokenId)
      .single();

    if (tokenError || !tokenData) {
      colorLogger.error(`Error retrieving token ${tokenId}: ${tokenError?.message}`);
      throw new ApiError(404, 'Token not found');
    }

    // Check if token is valid
    if (tokenData.status !== 'active' && tokenData.status !== 'viewed') {
      throw new ApiError(400, `Token is ${tokenData.status.toLowerCase()}`);
    }

    // Check if a response already exists for this token
    const { data: existingResponse, error: existingResponseError } = await supabase
      .from('viewer_responses')
      .select('id')
      .eq('video_token_id', tokenData.id)
      .maybeSingle();

    if (existingResponseError) {
      colorLogger.error(`Error checking existing responses: ${existingResponseError.message}`);
      throw new ApiError(500, 'Failed to check existing responses');
    }

    if (existingResponse) {
      throw new ApiError(400, 'A response has already been submitted for this token');
    }

    // Additional validation for interested responses
    if (interestLevel === 'interested') {
      // Require at least one contact method for interested responses
      if (!email && !phone && !instagram) {
        throw new ApiError(
          400,
          'At least one contact method (email, phone, or Instagram) is required for interested responses'
        );
      }

      // Validate preferred contact method is provided and matches available contact methods
      if (preferredContact) {
        if (preferredContact === 'email' && !email) {
          throw new ApiError(
            400,
            'Email is required when email is selected as preferred contact method'
          );
        } else if (preferredContact === 'phone' && !phone) {
          throw new ApiError(
            400,
            'Phone is required when phone is selected as preferred contact method'
          );
        } else if (preferredContact === 'instagram' && !instagram) {
          throw new ApiError(
            400,
            'Instagram is required when Instagram is selected as preferred contact method'
          );
        }
      }
    }

    // Create the viewer response
    const viewerResponse = {
      response_type: 'video',
      video_token_id: tokenData.id,
      interest_level: interestLevel,
      viewer_name: name,
      viewer_email: email || null,
      viewer_phone: phone || null,
      viewer_instagram: instagram || null,
      preferred_contact_method: preferredContact || null,
      message: message || null,
      ip_address: clientIp,
      user_agent: userAgent
    };

    // Insert response into viewer_responses table
    const { data: response, error: responseError } = await supabase
      .from('viewer_responses')
      .insert(viewerResponse)
      .select()
      .single();

    if (responseError) {
      colorLogger.error(`Error creating response: ${responseError.message}`);
      throw new ApiError(500, 'Failed to submit response');
    }

    // Log the response activity
    await supabase.from('token_activity_logs').insert({
      log_type: 'video_token',
      video_token_id: tokenData.id,
      activity_type: 'responded',
      ip_address: clientIp,
      user_agent: userAgent,
      metadata: { interest_level: interestLevel }
    });

    // Create notification for the token owner with appropriate message based on interest level
    let notificationTitle = `New Response: ${name}`;
    let notificationMessage = '';

    if (interestLevel === 'interested') {
      notificationMessage = `${name} is interested in connecting with you!`;
    } else if (interestLevel === 'maybe_later') {
      notificationMessage = `${name} might be interested later.`;
    } else {
      notificationMessage = `${name} is not interested at this time.`;
    }

    await supabase.from('notifications').insert({
      user_id: tokenData.user_id,
      type: 'interested_response',
      title: notificationTitle,
      message: notificationMessage,
      metadata: {
        response_id: response.id,
        token_id: tokenData.id,
        interest_level: interestLevel
      }
    });

    return {
      id: response.id,
      interestLevel,
      success: true
    };
  } catch (error) {
    colorLogger.error(`Error in submitTokenResponse: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.statusCode || 500, error.message || 'Failed to submit response');
  }
};

/**
 * Generate new tokens
 * @param {number} count - Number of tokens to generate
 * @param {string} userId - ID of the user generating tokens
 * @returns {Promise<Object>} Generated tokens
 */
const generateTokens = async (count = 1, userId) => {
  // Validate count
  if (count < 1 || count > 50) {
    throw new ApiError(400, 'Count must be between 1 and 50');
  }

  try {
    const tokens = [];

    // Generate specified number of tokens
    for (let i = 0; i < count; i++) {
      // Call the token generation function
      const { data, error } = await supabase.rpc('generate_video_token');

      if (error) {
        colorLogger.error(`Error generating token: ${error.message}`);
        throw new ApiError(500, 'Failed to generate tokens');
      }

      tokens.push(data);
    }

    // Insert tokens into video_tokens table
    const tokenRecords = tokens.map((token) => ({
      token_code: token,
      status: 'active',
      user_id: userId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    }));

    const { data: insertedTokens, error: insertError } = await supabase
      .from('video_tokens')
      .insert(tokenRecords)
      .select();

    if (insertError) {
      colorLogger.error(`Error inserting tokens: ${insertError.message}`);
      throw new ApiError(500, 'Failed to store tokens');
    }

    return { tokens: insertedTokens };
  } catch (error) {
    colorLogger.error(`Error in generateTokens: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.statusCode || 500, error.message || 'Failed to generate tokens');
  }
};

/**
 * Assign video to token
 * @param {string} tokenId - Token ID
 * @param {string} videoId - Video ID
 * @param {string} privateLabel - Optional private label for the token
 * @param {string} privateNote - Optional private note for the token
 * @param {string} userId - ID of the user making the assignment
 * @returns {Promise<Object>} Updated token
 */
const assignVideoToToken = async (tokenId, videoId, privateLabel, privateNote, userId) => {
  if (!tokenId || !videoId) {
    throw new ApiError(400, 'Token ID and Video ID are required');
  }

  try {
    // Get token information to verify ownership
    const { data: tokenData, error: tokenError } = await supabase
      .from('video_tokens')
      .select('id, user_id, status')
      .eq('token_code', tokenId)
      .single();

    if (tokenError || !tokenData) {
      colorLogger.error(`Error retrieving token ${tokenId}: ${tokenError?.message}`);
      throw new ApiError(404, 'Token not found');
    }

    // Debug log for ownership check
    colorLogger.info(`Comparing tokenData.user_id: ${tokenData.user_id} with userId: ${userId}`);
    // Verify token ownership (robust string comparison)
    if (String(tokenData.user_id).trim() !== String(userId).trim()) {
      throw new ApiError(403, 'You do not own this token');
    }

    // Check if token is assignable (allow 'active', 'unassigned', and 'inactive')
    if (!['active', 'unassigned', 'inactive'].includes(tokenData.status)) {
      throw new ApiError(400, `Token is ${tokenData.status.toLowerCase()} and cannot be assigned`);
    }

    // Verify video ownership
    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .select('id, user_id')
      .eq('id', videoId)
      .single();

    if (videoError || !videoData) {
      colorLogger.error(`Error retrieving video ${videoId}: ${videoError?.message}`);
      throw new ApiError(404, 'Video not found');
    }

    if (videoData.user_id !== userId) {
      throw new ApiError(403, 'You do not own this video');
    }

    // Update token with video ID, label, note, and set status to 'active'
    const { data: updatedToken, error: updateError } = await supabase
      .from('video_tokens')
      .update({
        video_id: videoId,
        private_label: privateLabel || null,
        private_notes: privateNote || null,
        status: 'active'
      })
      .eq('id', tokenData.id)
      .select()
      .single();

    if (updateError) {
      colorLogger.error(`Error updating token: ${updateError.message}`);
      throw new ApiError(500, 'Failed to assign video to token');
    }

    // Log the assignment (ensure video_token_id is updatedToken.id)
    await supabase.from('token_activity_logs').insert({
      log_type: 'video_token',
      video_token_id: updatedToken.id,
      activity_type: 'assigned',
      metadata: { video_id: videoId }
    });

    // Fetch the video details for the response
    let video = null;
    const { data: videoRow, error: videoFetchError } = await supabase
      .from('videos')
      .select('id, video_url, thumbnail_url, duration_seconds, video_type, created_at, title')
      .eq('id', videoId)
      .single();
    if (!videoFetchError && videoRow) {
      video = {
        id: videoRow.id,
        videoUrl: videoRow.video_url,
        thumbnailUrl: videoRow.thumbnail_url,
        duration: videoRow.duration_seconds,
        videoType: videoRow.video_type,
        createdAt: videoRow.created_at,
        title: videoRow.title || undefined
      };
    }

    // Fetch activity logs for this token, sorted oldest to newest
    let activityLogs = [];
    const { data: logs, error: logsError } = await supabase
      .from('token_activity_logs')
      .select('*')
      .eq('video_token_id', updatedToken.id)
      .order('created_at', { ascending: true });
    if (!logsError && logs) {
      activityLogs = logs;
    }

    // Compose the response in the required format
    return {
      id: updatedToken.id,
      tokenCode: updatedToken.token_code,
      status: updatedToken.status,
      createdAt: updatedToken.created_at,
      expiresAt: updatedToken.expires_at,
      viewedAt: updatedToken.viewed_at,
      privateLabel: updatedToken.private_label,
      privateNotes: updatedToken.private_notes,
      video,
      activityLogs
    };
  } catch (error) {
    colorLogger.error(`Error in assignVideoToToken: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.statusCode || 500, error.message || 'Failed to assign video to token');
  }
};

/**
 * Get token metrics for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Token metrics
 */
const getTokenMetrics = async (userId) => {
  try {
    // Get token counts by status
    const { data: statusCounts, error: countError } = await supabase.rpc(
      'get_token_counts_by_status',
      {
        p_user_id: userId
      }
    );

    if (countError) {
      colorLogger.error(`Error getting token counts: ${countError.message}`);
      throw new ApiError(500, 'Failed to retrieve token metrics');
    }

    // Get token activity over time
    const { data: activityData, error: activityError } = await supabase.rpc(
      'get_token_activity_metrics',
      {
        p_user_id: userId,
        p_days: 30 // Last 30 days
      }
    );

    if (activityError) {
      colorLogger.error(`Error getting token activity: ${activityError.message}`);
      throw new ApiError(500, 'Failed to retrieve token activity metrics');
    }

    // Get response conversion rates
    const { data: conversionData, error: conversionError } = await supabase.rpc(
      'get_token_conversion_rates',
      {
        p_user_id: userId
      }
    );

    if (conversionError) {
      colorLogger.error(`Error getting conversion rates: ${conversionError.message}`);
      throw new ApiError(500, 'Failed to retrieve token conversion metrics');
    }

    return {
      tokenCounts: statusCounts,
      activityMetrics: activityData,
      conversionRates: conversionData
    };
  } catch (error) {
    colorLogger.error(`Error in getTokenMetrics: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve token metrics');
  }
};

/**
 * Get user's tokens with optional filtering and pagination
 * @param {string} userId - User ID
 * @param {Object} options - Filter and pagination options
 * @returns {Promise<Object>} List of tokens with video details and activity logs
 */
const getUserTokens = async (userId, options = {}) => {
  const { status, page = 1, limit = 20, sortBy = 'created_at', sortDirection = 'desc' } = options;

  try {
    let query = supabase
      .from('video_tokens')
      .select(
        `
        id,
        token_code,
        status,
        created_at,
        expires_at,
        viewed_at,
        private_label,
        private_notes,
        video_id,
        videos:video_id (
          id,
          video_url,
          thumbnail_url,
          duration_seconds,
          video_type,
          created_at,
          title
        )
      `
      )
      .eq('user_id', userId);

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Apply sorting
    if (['created_at', 'expires_at', 'viewed_at', 'status'].includes(sortBy)) {
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: tokens, error } = await query;

    if (error) {
      colorLogger.error(`Error retrieving user tokens: ${error.message}`);
      throw new ApiError(500, 'Failed to retrieve tokens');
    }

    // Get all token IDs for activity logs and responses
    const tokenIds = tokens.map((t) => t.id);
    let activityLogsByToken = {};
    let responsesByToken = {};
    if (tokenIds.length > 0) {
      // Fetch activity logs
      const { data: logs, error: logsError } = await supabase
        .from('token_activity_logs')
        .select('*')
        .in('video_token_id', tokenIds)
        .order('created_at', { ascending: true });
      if (logsError) {
        colorLogger.warn(`Error fetching token activity logs: ${logsError.message}`);
      }
      if (logs && logs.length > 0) {
        for (const log of logs) {
          if (!activityLogsByToken[log.video_token_id]) activityLogsByToken[log.video_token_id] = [];
          activityLogsByToken[log.video_token_id].push(log);
        }
      }
      // Fetch viewer responses
      const { data: responses, error: responsesError } = await supabase
        .from('viewer_responses')
        .select('*')
        .in('video_token_id', tokenIds);
      if (responsesError) {
        colorLogger.warn(`Error fetching viewer responses: ${responsesError.message}`);
      }
      if (responses && responses.length > 0) {
        for (const response of responses) {
          if (!responsesByToken[response.video_token_id]) responsesByToken[response.video_token_id] = [];
          responsesByToken[response.video_token_id].push(response);
        }
      }
    }

    // Format tokens with video, activity logs, and responses
    const formattedTokens = tokens.map((token) => {
      let video = null;
      if (token.videos) {
        video = {
          id: token.videos.id,
          videoUrl: token.videos.video_url,
          thumbnailUrl: token.videos.thumbnail_url,
          duration: token.videos.duration_seconds,
          videoType: token.videos.video_type,
          createdAt: token.videos.created_at,
          title: token.videos.title || undefined
        };
      }
      return {
        id: token.id,
        tokenCode: token.token_code,
        status: token.status,
        createdAt: token.created_at,
        expiresAt: token.expires_at,
        viewedAt: token.viewed_at,
        privateLabel: token.private_label,
        privateNotes: token.private_notes,
        video,
        activityLogs: activityLogsByToken[token.id] || [],
        responses: responsesByToken[token.id] || []
      };
    });

    // Get total count
    const { count: totalCount, error: countError } = await supabase
      .from('video_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq(status ? 'status' : 'id', status || 'id');

    if (countError) {
      colorLogger.warn(`Error getting token count: ${countError.message}`);
    }

    return {
      tokens: formattedTokens,
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        pages: totalCount ? Math.ceil(totalCount / limit) : 0
      }
    };
  } catch (error) {
    colorLogger.error(`Error in getUserTokens: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to retrieve tokens');
  }
};

/**
 * Create a custom video and generate a token for it
 * @param {Object} params - Parameters for custom video and token
 * @param {string} params.userId - User ID
 * @param {string} params.videoUrl - Video URL
 * @param {string} params.thumbnailUrl - Thumbnail URL
 * @param {number} params.durationSeconds - Duration in seconds
 * @param {string} params.title - Title for the video (required)
 * @param {string} [params.privateLabel] - Optional private label
 * @param {string} [params.privateNotes] - Optional private notes
 * @param {number} [params.daysValid=3] - Days the token is valid (default 3)
 * @returns {Promise<Object>} Result from Supabase function
 */
const createCustomVideoWithToken = async ({
  userId,
  videoUrl,
  thumbnailUrl,
  durationSeconds,
  title,
  privateLabel = null,
  privateNotes = null,
  daysValid = 3
}) => {
  if (!userId || !videoUrl || !thumbnailUrl || !durationSeconds || !title) {
    throw new ApiError(400, 'Missing required parameters');
  }
  try {
    const { data, error } = await supabase.rpc('create_custom_video_with_token', {
      p_user_id: userId,
      p_video_url: videoUrl,
      p_thumbnail_url: thumbnailUrl,
      p_duration_seconds: durationSeconds,
      p_title: title,
      p_private_label: privateLabel,
      p_private_notes: privateNotes,
      p_days_valid: daysValid
    });
    if (error) {
      colorLogger.error(`Error creating custom video with token: ${error.message}`);
      throw new ApiError(500, 'Failed to create custom video with token');
    }
    if (!data.success) {
      throw new ApiError(400, data.error || 'Failed to create custom video with token');
    }
    return data;
  } catch (error) {
    colorLogger.error(`Error in createCustomVideoWithToken: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.statusCode || 500, error.message || 'Failed to create custom video with token');
  }
};

module.exports = {
  getProfileByToken,
  getVideoByToken,
  submitTokenResponse,
  generateTokens,
  assignVideoToToken,
  getTokenMetrics,
  getUserTokens,
  createCustomVideoWithToken
};
