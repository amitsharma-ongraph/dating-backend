// src/modules/user/video/videoService.js
const { getAdminClient } = require('../../../configs/supabaseConfig');
const { colorLogger } = require('../../../utils/logger');
const ApiError = require('../../../utils/apiError');
const config = require('../../../configs/envConfig.js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Video bucket name in Supabase Storage
const VIDEO_BUCKET = config.supabase.videoBucket || 'user-videos';
const MAX_VIDEO_SIZE = config.supabase.maxVideoSize || 20 * 1024 * 1024; // 20MB default
const ALLOWED_VIDEO_MIME_TYPES = config.supabase.allowedVideoMimeTypes || [
  'video/webm',
  'video/mp4',
  'video/quicktime'
];
const MIN_DURATION = 15; // seconds
const MAX_DURATION = 35; // seconds

/**
 * Update user's profile completion percentage
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
const updateProfileCompletionPercentage = async (userId) => {
  const adminClient = getAdminClient();

  try {
    // This should trigger the update_profile_completion trigger in your DB
    const { error } = await adminClient
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      colorLogger.warn(`Failed to update profile completion: ${error.message}`);
    }
  } catch (error) {
    colorLogger.warn(`Error updating profile completion: ${error.message}`);
  }
};

/**
 * Ensure the videos bucket exists
 * @returns {Promise<boolean>} Success status
 */
const ensureVideosBucketExists = async () => {
  const adminClient = getAdminClient();

  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await adminClient.storage.listBuckets();

    if (listError) {
      colorLogger.error(`Error listing buckets: ${listError.message}`);
      throw new ApiError(500, 'Failed to access storage');
    }

    const bucketExists = buckets.some((bucket) => bucket.name === VIDEO_BUCKET);

    if (!bucketExists) {
      // Create bucket if it doesn't exist
      const { error: createError } = await adminClient.storage.createBucket(VIDEO_BUCKET, {
        public: true,
        fileSizeLimit: MAX_VIDEO_SIZE,
        allowedMimeTypes: ALLOWED_VIDEO_MIME_TYPES
      });

      if (createError) {
        colorLogger.error(`Error creating bucket: ${createError.message}`);
        throw new ApiError(500, 'Failed to create storage bucket');
      }

      colorLogger.info(`Created '${VIDEO_BUCKET}' bucket`);
    }

    return true;
  } catch (error) {
    colorLogger.error(`ensureVideosBucketExists error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to setup storage');
  }
};

// /**
//  * Get default video for a user
//  * @param {string} userId - User ID
//  * @returns {Promise<Object|null>} Default video or null if none
//  */
// const getDefaultVideo = async (userId) => {
//   const adminClient = getAdminClient();

//   try {
//     // Ensure videos bucket exists
//     await ensureVideosBucketExists();

//     // Get the default video for the user
//     const { data: video, error } = await adminClient
//       .from('videos')
//       .select('*')
//       .eq('user_id', userId)
//       .eq('video_type', 'default')
//       .eq('is_active', true)
//       .order('created_at', { ascending: false })
//       .limit(1)
//       .single();

//     if (error) {
//       // PGRST116 is the "no rows returned" error code from PostgREST
//       if (error.code === 'PGRST116') {
//         return null; // No default video
//       }

//       colorLogger.error(`Error fetching default video: ${error.message}`);
//       throw new ApiError(500, 'Failed to fetch default video');
//     }

//     // Transform video data to client format
//     return {
//       id: video.id,
//       videoUrl: video.video_url,
//       thumbnailUrl: video.thumbnail_url,
//       duration: video.duration_seconds,
//       videoType: video.video_type,
//       createdAt: video.created_at
//     };
//   } catch (error) {
//     colorLogger.error(`getDefaultVideo error: ${error.message}`);
//     if (error instanceof ApiError) throw error;
//     throw new ApiError(500, 'Failed to get default video');
//   }
// };

/**
 * Upload a video for a user
 * @param {string} userId - User ID
 * @param {Object} file - Video file
 * @param {string} videoType - Type of video ('default' or 'custom')
 * @param {string} title - Title of the video (optional for default, required for custom)
 * @returns {Promise<Object>} Uploaded video data
 */
const uploadVideo = async (userId, file, videoType, title) => {
  const adminClient = getAdminClient();

  try {
    // Ensure videos bucket exists
    await ensureVideosBucketExists();

    // Validate video
    if (!file) {
      throw new ApiError(400, 'No video file provided');
    }

    // Validate MIME type
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      throw new ApiError(
        400,
        `Invalid video format. Allowed formats: ${ALLOWED_VIDEO_MIME_TYPES.join(', ')}`
      );
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      throw new ApiError(400, `Video exceeds maximum size of ${MAX_VIDEO_SIZE / (1024 * 1024)}MB`);
    }

    // For custom videos, title is required
    if (videoType === 'custom') {
      if (!title || typeof title !== 'string' || !title.trim()) {
        throw new ApiError(400, 'Title is required for custom videos');
      }
    }

    // Set default duration within the valid range
    // In a production environment, you would use a service like FFmpeg to extract the actual duration
    const duration = 25; // Default to 25 seconds

    // For default videos, handle existing ones
    if (videoType === 'default') {
      // Find existing default videos
      const { data: existingVideos, error: findError } = await adminClient
        .from('videos')
        .select('id, storage_path')
        .eq('user_id', userId)
        .eq('video_type', 'default')
        .eq('is_active', true);

      if (findError) {
        colorLogger.warn(`Failed to find existing default videos: ${findError.message}`);
      } else if (existingVideos && existingVideos.length > 0) {
        // Delete existing default videos from storage and database
        for (const existingVideo of existingVideos) {
          if (existingVideo.storage_path) {
            // Delete from storage - handle error inside the try block
            try {
              const { error: storageError } = await adminClient.storage
                .from(VIDEO_BUCKET)
                .remove([existingVideo.storage_path]);

              if (storageError) {
                colorLogger.warn(`Failed to delete video file: ${storageError.message}`);
              }
            } catch (storageErr) {
              colorLogger.warn(`Exception deleting video file: ${storageErr.message}`);
            }
          }

          // Delete from database - handle error inside the try block
          try {
            const { error: deleteError } = await adminClient
              .from('videos')
              .delete()
              .eq('id', existingVideo.id);

            if (deleteError) {
              colorLogger.warn(`Failed to delete video record: ${deleteError.message}`);
            }
          } catch (deleteErr) {
            colorLogger.warn(`Exception deleting video record: ${deleteErr.message}`);
          }
        }

        colorLogger.info(
          `Processed ${existingVideos.length} existing default videos for user ${userId}`
        );
      }
    }

    // Generate a unique filename
    const fileExt = path.extname(file.originalname || 'video.webm').toLowerCase();
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload the file to Supabase Storage
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(VIDEO_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      colorLogger.error(`Error uploading video: ${uploadError.message}`);
      throw new ApiError(500, 'Failed to upload video file');
    }

    // Get the public URL for the uploaded file
    const {
      data: { publicUrl }
    } = adminClient.storage.from(VIDEO_BUCKET).getPublicUrl(filePath);

    // Generate a thumbnail
    // In a production environment, you would use FFmpeg to extract a frame
    // For now, we'll create a thumbnail image based on the video type

    // First, create a simple colored placeholder image
    const width = 640;
    const height = 360;
    const color = videoType === 'default' ? 'blue' : 'purple';
    const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="${color}" />
          <text x="50%" y="50%" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle">
            ${videoType.toUpperCase()} VIDEO
          </text>
        </svg>
      `;

    // Convert SVG to buffer
    const svgBuffer = Buffer.from(svg);

    // Upload the thumbnail to Supabase Storage
    const thumbnailFileName = `${uuidv4()}.svg`;
    const thumbnailPath = `${userId}/thumbnails/${thumbnailFileName}`;

    // Make sure thumbnails directory exists
    try {
      // Upload the thumbnail
      const { data: thumbnailData, error: thumbnailError } = await adminClient.storage
        .from(VIDEO_BUCKET)
        .upload(thumbnailPath, svgBuffer, {
          contentType: 'image/svg+xml',
          cacheControl: '3600',
          upsert: false
        });

      if (thumbnailError) {
        colorLogger.warn(`Failed to upload thumbnail: ${thumbnailError.message}`);
      }
    } catch (thumbnailErr) {
      colorLogger.warn(`Exception uploading thumbnail: ${thumbnailErr.message}`);
    }

    // Get the public URL for the thumbnail
    let thumbnailUrl = null;
    try {
      const {
        data: { publicUrl: thumbUrl }
      } = adminClient.storage.from(VIDEO_BUCKET).getPublicUrl(thumbnailPath);
      thumbnailUrl = thumbUrl;
    } catch (thumbUrlErr) {
      colorLogger.warn(`Failed to get thumbnail URL: ${thumbUrlErr.message}`);
    }

    // If thumbnail creation failed, use a fallback URL
    if (!thumbnailUrl) {
      // Use a placeholder service
      thumbnailUrl = `https://via.placeholder.com/640x360/cccccc/ffffff?text=${encodeURIComponent(videoType + ' Video')}`;
    }

    // Create a record in the videos table
    const videoData = {
      user_id: userId,
      video_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      duration_seconds: duration,
      video_type: videoType,
      is_active: true,
      is_processing: false,
      storage_provider: 'supabase',
      storage_path: filePath,
      file_size_bytes: file.size,
      created_at: new Date().toISOString(),
      processed_at: new Date().toISOString()
    };
    // Add title if present (required for custom, optional for default)
    if (videoType === 'custom' || (title && typeof title === 'string' && title.trim())) {
      videoData.title = title;
    }

    const { data: videoRecord, error: insertError } = await adminClient
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (insertError) {
      colorLogger.error(`Error creating video record: ${insertError.message}`);

      // Clean up the uploaded file
      try {
        await adminClient.storage.from(VIDEO_BUCKET).remove([filePath]);

        // Clean up thumbnail if it was created
        if (thumbnailUrl) {
          await adminClient.storage.from(VIDEO_BUCKET).remove([thumbnailPath]);
        }
      } catch (cleanupErr) {
        colorLogger.warn(`Failed to clean up files after error: ${cleanupErr.message}`);
      }

      throw new ApiError(500, 'Failed to create video record');
    }

    // Update profile completion percentage
    await updateProfileCompletionPercentage(userId);

    colorLogger.info(`Video uploaded for user ${userId}: ${videoRecord.id}`);

    return {
      id: videoRecord.id,
      videoUrl: videoRecord.video_url,
      thumbnailUrl: videoRecord.thumbnail_url,
      duration: videoRecord.duration_seconds,
      videoType: videoRecord.video_type,
      title: videoRecord.title || null,
      createdAt: videoRecord.created_at
    };
  } catch (error) {
    colorLogger.error(`uploadVideo error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to upload video: ' + error.message);
  }
};

/**
 * Delete a video
 * @param {string} userId - User ID
 * @param {string} videoId - Video ID
 * @returns {Promise<boolean>} Success status
 */
const deleteVideo = async (userId, videoId) => {
  const adminClient = getAdminClient();

  try {
    // Check if the video exists and belongs to the user
    const { data: video, error: getError } = await adminClient
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (getError) {
      colorLogger.error(`Error finding video: ${getError.message}`);
      throw new ApiError(404, 'Video not found or does not belong to user');
    }

    // Extract the file path from storage_path
    const filePath = video.storage_path;

    if (filePath) {
      // Delete the file from storage - using adminClient instead of getAuthenticatedClient
      const { error: deleteStorageError } = await adminClient.storage
        .from(VIDEO_BUCKET)
        .remove([filePath]);

      if (deleteStorageError) {
        colorLogger.warn(`Could not delete file from storage: ${deleteStorageError.message}`);
        // Continue anyway to delete the database record
      }
    }

    // Delete the video record
    const { error: deleteError } = await adminClient.from('videos').delete().eq('id', videoId);

    if (deleteError) {
      colorLogger.error(`Error deleting video record: ${deleteError.message}`);
      throw new ApiError(500, 'Failed to delete video record');
    }

    // If this was a default video, update profile completion
    if (video.video_type === 'default') {
      await updateProfileCompletionPercentage(userId);
    }

    colorLogger.info(`Video ${videoId} deleted for user ${userId}`);

    return true;
  } catch (error) {
    colorLogger.error(`deleteVideo error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to delete video');
  }
};

// /**
//  * Get custom videos for a user
//  * @param {string} userId - User ID
//  * @returns {Promise<Array>} Array of custom videos
//  */
// const getCustomVideos = async (userId) => {
//   const adminClient = getAdminClient();

//   try {
//     // Ensure videos bucket exists
//     await ensureVideosBucketExists();

//     // Get all custom videos for the user
//     const { data: videos, error } = await adminClient
//       .from('videos')
//       .select('*')
//       .eq('user_id', userId)
//       .eq('video_type', 'custom')
//       .eq('is_active', true)
//       .order('created_at', { ascending: false });

//     if (error) {
//       colorLogger.error(`Error fetching custom videos: ${error.message}`);
//       throw new ApiError(500, 'Failed to fetch custom videos');
//     }

//     if (!videos || videos.length === 0) {
//       return [];
//     }

//     // Transform video data to client format
//     return videos.map((video) => ({
//       id: video.id,
//       videoUrl: video.video_url,
//       thumbnailUrl: video.thumbnail_url,
//       duration: video.duration_seconds,
//       videoType: video.video_type,
//       createdAt: video.created_at
//     }));
//   } catch (error) {
//     colorLogger.error(`getCustomVideos error: ${error.message}`);
//     if (error instanceof ApiError) throw error;
//     throw new ApiError(500, 'Failed to get custom videos');
//   }
// };

/**
 * Get a video by ID
 * @param {string} userId - User ID
 * @param {string} videoId - Video ID
 * @returns {Promise<Object|null>} Video or null if not found
 */
const getVideoById = async (userId, videoId) => {
  const adminClient = getAdminClient();

  try {
    // Get the video
    const { data: video, error } = await adminClient
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No video found
      }

      colorLogger.error(`Error fetching video by ID: ${error.message}`);
      throw new ApiError(500, 'Failed to fetch video');
    }

    // Transform video data to client format
    return {
      id: video.id,
      videoUrl: video.video_url,
      thumbnailUrl: video.thumbnail_url,
      duration: video.duration_seconds,
      videoType: video.video_type,
      createdAt: video.created_at
    };
  } catch (error) {
    colorLogger.error(`getVideoById error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to get video');
  }
};

/**
 * Get all videos for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object containing default and custom videos
 */
const getAllVideos = async (userId) => {
  const adminClient = getAdminClient();

  try {
    // Ensure videos bucket exists
    await ensureVideosBucketExists();

    // Get all active videos for the user
    const { data: videos, error } = await adminClient
      .from('videos')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      colorLogger.error(`Error fetching videos: ${error.message}`);
      throw new ApiError(500, 'Failed to fetch videos');
    }

    // Separate videos by type
    let defaultVideo = null;
    let customVideos = [];

    if (videos && videos.length > 0) {
      // Transform video data to client format
      const formattedVideos = videos.map((video) => ({
        id: video.id,
        videoUrl: video.video_url,
        thumbnailUrl: video.thumbnail_url,
        duration: video.duration_seconds,
        videoType: video.video_type,
        createdAt: video.created_at,
        title : video.title
      }));

      // Find default video (should be only one)
      defaultVideo = formattedVideos.find((video) => video.videoType === 'default') || null;

      // Collect custom videos
      customVideos = formattedVideos.filter((video) => video.videoType === 'custom');
    }

    // For each custom video, fetch all token codes attached to it
    if (customVideos.length > 0) {
      const videoIds = customVideos.map((v) => v.id);
      const { data: tokens, error: tokensError } = await adminClient
        .from('video_tokens')
        .select('video_id, token_code')
        .in('video_id', videoIds);

      if (tokensError) {
        colorLogger.warn(`Error fetching video tokens: ${tokensError.message}`);
      }

      // Map video_id to array of token codes
      const videoIdToTokenCodes = {};
      if (tokens && tokens.length > 0) {
        for (const token of tokens) {
          if (!videoIdToTokenCodes[token.video_id]) videoIdToTokenCodes[token.video_id] = [];
          videoIdToTokenCodes[token.video_id].push(token.token_code);
        }
      }

      // Attach tokenCodes array to each custom video
      customVideos = customVideos.map((video) => ({
        ...video,
        tokenCodes: videoIdToTokenCodes[video.id] || []
      }));
    }

    return {
      defaultVideo,
      customVideos
    };
  } catch (error) {
    colorLogger.error(`getAllVideos error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to get videos');
  }
};

/**
 * Upload video file to storage only (without creating database record)
 * @param {string} userId - User ID
 * @param {Object} file - Video file
 * @returns {Promise<Object>} Upload result with URLs and duration
 */
const uploadVideoToStorage = async (userId, file) => {
  const adminClient = getAdminClient();

  try {
    // Ensure videos bucket exists
    await ensureVideosBucketExists();

    // Validate video
    if (!file) {
      throw new ApiError(400, 'No video file provided');
    }

    // Validate MIME type
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype)) {
      throw new ApiError(
        400,
        `Invalid video format. Allowed formats: ${ALLOWED_VIDEO_MIME_TYPES.join(', ')}`
      );
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      throw new ApiError(400, `Video exceeds maximum size of ${MAX_VIDEO_SIZE / (1024 * 1024)}MB`);
    }

    // Set default duration within the valid range
    const duration = 25; // Default to 25 seconds

    // Generate a unique filename
    const fileExt = path.extname(file.originalname || 'video.webm').toLowerCase();
    const fileName = `${uuidv4()}${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload the file to Supabase Storage
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from(VIDEO_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      colorLogger.error(`Error uploading video: ${uploadError.message}`);
      throw new ApiError(500, 'Failed to upload video file');
    }

    // Get the public URL for the uploaded file
    const {
      data: { publicUrl }
    } = adminClient.storage.from(VIDEO_BUCKET).getPublicUrl(filePath);

    // Generate a thumbnail
    const width = 640;
    const height = 360;
    const color = 'purple'; // Custom video color
    const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="${color}" />
          <text x="50%" y="50%" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle">
            CUSTOM VIDEO
          </text>
        </svg>
      `;

    // Convert SVG to buffer
    const svgBuffer = Buffer.from(svg);

    // Upload the thumbnail to Supabase Storage
    const thumbnailFileName = `${uuidv4()}.svg`;
    const thumbnailPath = `${userId}/thumbnails/${thumbnailFileName}`;

    // Upload the thumbnail
    let thumbnailUrl = null;
    try {
      const { data: thumbnailData, error: thumbnailError } = await adminClient.storage
        .from(VIDEO_BUCKET)
        .upload(thumbnailPath, svgBuffer, {
          contentType: 'image/svg+xml',
          cacheControl: '3600',
          upsert: false
        });

      if (thumbnailError) {
        colorLogger.warn(`Failed to upload thumbnail: ${thumbnailError.message}`);
      } else {
        // Get the public URL for the thumbnail
        const {
          data: { publicUrl: thumbUrl }
        } = adminClient.storage.from(VIDEO_BUCKET).getPublicUrl(thumbnailPath);
        thumbnailUrl = thumbUrl;
      }
    } catch (thumbnailErr) {
      colorLogger.warn(`Exception uploading thumbnail: ${thumbnailErr.message}`);
    }

    // If thumbnail creation failed, use a fallback URL
    if (!thumbnailUrl) {
      thumbnailUrl = `https://via.placeholder.com/640x360/cccccc/ffffff?text=${encodeURIComponent('Custom Video')}`;
    }

    colorLogger.info(`Video uploaded to storage for user ${userId}: ${filePath}`);

    return {
      videoUrl: publicUrl,
      thumbnailUrl,
      duration
    };
  } catch (error) {
    colorLogger.error(`uploadVideoToStorage error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to upload video to storage: ' + error.message);
  }
};

module.exports = {
  // getDefaultVideo,
  //   getCustomVideos,
  getVideoById,
  getAllVideos,
  uploadVideo,
  deleteVideo,
  ensureVideosBucketExists,
  uploadVideoToStorage
};
