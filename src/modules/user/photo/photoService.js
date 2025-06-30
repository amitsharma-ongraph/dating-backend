// src/modules/user/photo/photoService.js
const { getAdminClient, getUserClient } = require('../../../configs/supabaseConfig');
const { colorLogger } = require('../../../utils/logger');
const ApiError = require('../../../utils/apiError');
const config = require('../../../configs/envConfig');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Photo bucket name in Supabase Storage
const PHOTO_BUCKET = config.supabase.photoBucket || 'user-photos';
const MAX_PHOTOS_PER_USER = 3; // Aligned with schema constraint
const MAX_FILE_SIZE = config.supabase.maxFileSize || 5 * 1024 * 1024; // 5MB default
const ALLOWED_MIME_TYPES = config.supabase.allowedMimeTypes || [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

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
 * Get all photos for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} User photos
 */
const getUserPhotos = async (userId) => {
  const adminClient = getAdminClient();

  try {
    // Ensure photos bucket exists
    await ensurePhotosBucketExists();

    // Get all photos for the user, ordered by photo_order
    const { data: photos, error } = await adminClient
      .from('user_photos')
      .select('*')
      .eq('user_id', userId)
      .order('photo_order', { ascending: true });

    if (error) {
      colorLogger.error(`Error fetching user photos: ${error.message}`);
      throw new ApiError(500, 'Failed to fetch user photos');
    }

    // Transform photo data to client format
    return photos.map((photo) => ({
      id: photo.id,
      photoUrl: photo.photo_url,
      order: photo.photo_order,
      is_primary: photo.is_primary,
      uploadedAt: photo.uploaded_at
    }));
  } catch (error) {
    colorLogger.error(`getUserPhotos error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to get user photos');
  }
};

/**
 * Ensure the photos bucket exists
 * @returns {Promise<boolean>} Success status
 */
const ensurePhotosBucketExists = async () => {
  const adminClient = getAdminClient();

  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await adminClient.storage.listBuckets();

    if (listError) {
      colorLogger.error(`Error listing buckets: ${listError.message}`);
      throw new ApiError(500, 'Failed to access storage');
    }

    const bucketExists = buckets.some((bucket) => bucket.name === PHOTO_BUCKET);

    if (!bucketExists) {
      // Create bucket if it doesn't exist
      const { error: createError } = await adminClient.storage.createBucket(PHOTO_BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: ALLOWED_MIME_TYPES
      });

      if (createError) {
        colorLogger.error(`Error creating bucket: ${createError.message}`);
        throw new ApiError(500, 'Failed to create storage bucket');
      }

      colorLogger.info(`Created '${PHOTO_BUCKET}' bucket`);
    }

    return true;
  } catch (error) {
    colorLogger.error(`ensurePhotosBucketExists error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to setup storage');
  }
};

/**
 * Upload multiple photos for a user
 * @param {string} userId - User ID
 * @param {Array} files - Array of file data objects
 * @param {string} accessToken - User's access token
 * @returns {Promise<Array>} Uploaded photos data
 */
const uploadMultiplePhotos = async (userId, files, accessToken) => {
  const adminClient = getAdminClient();
  const supabase = getUserClient(accessToken);

  try {
    // Ensure photos bucket exists
    await ensurePhotosBucketExists();

    // Validate files
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new ApiError(400, 'No files provided');
    }

    // Check how many photos the user already has
    const { data: existingPhotos, error: countError } = await adminClient
      .from('user_photos')
      .select('id, photo_order')
      .eq('user_id', userId);

    if (countError) {
      colorLogger.error(`Error counting existing photos: ${countError.message}`);
      throw new ApiError(500, 'Failed to check existing photos');
    }

    // Calculate how many more photos the user can upload
    const remainingSlots = MAX_PHOTOS_PER_USER - (existingPhotos?.length || 0);

    if (remainingSlots <= 0) {
      throw new ApiError(
        400,
        `Maximum of ${MAX_PHOTOS_PER_USER} photos allowed. Please delete some photos first.`
      );
    }

    // Limit the number of files to upload
    const filesToUpload = files.slice(0, remainingSlots);

    // Find available order numbers
    const usedOrders = existingPhotos?.map((p) => p.photo_order) || [];
    const availableOrders = [];
    for (let i = 1; i <= MAX_PHOTOS_PER_USER; i++) {
      if (!usedOrders.includes(i)) {
        availableOrders.push(i);
      }
    }

    // Upload each file
    const uploadedPhotos = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];

      // Validate file
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        colorLogger.warn(`Skipping file with invalid type: ${file.mimetype}`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        colorLogger.warn(`Skipping file that exceeds size limit: ${file.size} bytes`);
        continue;
      }

      // Generate a unique filename
      const fileExt = path.extname(file.originalname || 'photo.jpg').toLowerCase();
      const fileName = `${uuidv4()}${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // Upload the file to Supabase Storage using admin client
      const { data: uploadData, error: uploadError } = await adminClient.storage
        .from(PHOTO_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        colorLogger.error(`Error uploading file ${i}: ${uploadError.message}`);
        continue;
      }

      // Get the public URL for the uploaded file
      const {
        data: { publicUrl }
      } = adminClient.storage.from(PHOTO_BUCKET).getPublicUrl(filePath);

      // Create a record in the user_photos table using admin client
      const photoData = {
        user_id: userId,
        photo_url: publicUrl,
        photo_order: availableOrders[i],
        is_primary: false, // Always set to false for new uploads
        uploaded_at: new Date().toISOString()
      };

      // Try to insert using admin client to bypass RLS
      const { data: photoRecord, error: insertError } = await adminClient
        .from('user_photos')
        .insert(photoData)
        .select()
        .single();

      if (insertError) {
        colorLogger.error(`Error creating photo record: ${insertError.message}`);

        // If error is due to unique constraint violation, try to resolve
        if (insertError.code === '23505') {
          // PostgreSQL unique violation code
          try {
            // Find a different available order
            let newOrder = 0;
            for (let j = 1; j <= MAX_PHOTOS_PER_USER; j++) {
              if (!usedOrders.includes(j) && !availableOrders.slice(0, i).includes(j)) {
                newOrder = j;
                break;
              }
            }

            if (newOrder > 0) {
              photoData.photo_order = newOrder;
              const { data: retryRecord, error: retryError } = await adminClient
                .from('user_photos')
                .insert(photoData)
                .select()
                .single();

              if (retryError) {
                // If still failing, clean up the uploaded file and skip
                await adminClient.storage.from(PHOTO_BUCKET).remove([filePath]);
                continue;
              }

              uploadedPhotos.push({
                id: retryRecord.id,
                photoUrl: retryRecord.photo_url,
                order: retryRecord.photo_order,
                is_primary: retryRecord.is_primary,
                uploadedAt: retryRecord.uploaded_at
              });
              continue;
            }
          } catch (retryError) {
            colorLogger.error(`Failed to resolve order conflict: ${retryError.message}`);
          }
        }

        // If we got here, either it wasn't a constraint error or resolution failed
        // Clean up the uploaded file
        await adminClient.storage.from(PHOTO_BUCKET).remove([filePath]);
        continue;
      }

      uploadedPhotos.push({
        id: photoRecord.id,
        photoUrl: photoRecord.photo_url,
        order: photoRecord.photo_order,
        is_primary: photoRecord.is_primary,
        uploadedAt: photoRecord.uploaded_at
      });
    }

    if (uploadedPhotos.length === 0) {
      throw new ApiError(400, 'Failed to upload any photos');
    }

    if (uploadedPhotos.length > 0) {
      await updateProfileCompletionPercentage(userId);
    }

    colorLogger.info(`${uploadedPhotos.length} photos uploaded for user ${userId}`);

    return uploadedPhotos;
  } catch (error) {
    colorLogger.error(`uploadMultiplePhotos error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to upload photos: ' + error.message);
  }
};

/**
 * Update a photo's metadata (order or primary status)
 * @param {string} userId - User ID
 * @param {string} photoId - Photo ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated photo data
 */
const updatePhoto = async (userId, photoId, { order, isPrimary }) => {
  const adminClient = getAdminClient();

  try {
    // Check if the photo exists and belongs to the user
    const { data: photo, error: getError } = await adminClient
      .from('user_photos')
      .select('*')
      .eq('id', photoId)
      .eq('user_id', userId)
      .single();

    if (getError) {
      colorLogger.error(`Error finding photo: ${getError.message}`);
      throw new ApiError(404, 'Photo not found or does not belong to user');
    }

    // Begin a transaction-like sequence of operations
    const updateData = {};

    // Handle order update
    if (order !== undefined && order !== photo.photo_order) {
      if (order < 1 || order > MAX_PHOTOS_PER_USER) {
        throw new ApiError(400, `Order must be between 1 and ${MAX_PHOTOS_PER_USER}`);
      }

      // Check if any photo already has this order
      const { data: existingWithOrder, error: orderError } = await adminClient
        .from('user_photos')
        .select('id, photo_order')
        .eq('user_id', userId)
        .eq('photo_order', order)
        .neq('id', photoId);

      if (orderError) {
        colorLogger.error(`Error checking existing order: ${orderError.message}`);
        throw new ApiError(500, 'Failed to check existing photo orders');
      }

      // If a photo already has this order, swap the orders
      if (existingWithOrder && existingWithOrder.length > 0) {
        const { error: swapError } = await adminClient
          .from('user_photos')
          .update({ photo_order: photo.photo_order })
          .eq('id', existingWithOrder[0].id);

        if (swapError) {
          colorLogger.error(`Error swapping photo orders: ${swapError.message}`);
          throw new ApiError(500, 'Failed to update photo order');
        }
      }

      updateData.photo_order = order;
    }

    // Handle primary status update
    if (isPrimary !== undefined && isPrimary !== photo.is_primary) {
      if (isPrimary === true) {
        // If setting as primary, clear any existing primary
        const { error: clearPrimaryError } = await adminClient
          .from('user_photos')
          .update({ is_primary: false })
          .eq('user_id', userId)
          .eq('is_primary', true);

        if (clearPrimaryError) {
          colorLogger.error(`Error clearing primary photo: ${clearPrimaryError.message}`);
          throw new ApiError(500, 'Failed to update primary photo status');
        }
      }

      updateData.is_primary = isPrimary;
    }

    // If nothing to update, return current photo
    if (Object.keys(updateData).length === 0) {
      return {
        id: photo.id,
        photoUrl: photo.photo_url,
        order: photo.photo_order,
        is_primary: photo.is_primary,
        uploadedAt: photo.uploaded_at
      };
    }

    // Update the photo
    const { data: updatedPhoto, error: updateError } = await adminClient
      .from('user_photos')
      .update(updateData)
      .eq('id', photoId)
      .select()
      .single();

    if (updateError) {
      colorLogger.error(`Error updating photo: ${updateError.message}`);
      throw new ApiError(500, 'Failed to update photo: ' + updateError.message);
    }

    colorLogger.info(`Photo ${photoId} updated for user ${userId}`);

    return {
      id: updatedPhoto.id,
      photoUrl: updatedPhoto.photo_url,
      order: updatedPhoto.photo_order,
      is_primary: updatedPhoto.is_primary,
      uploadedAt: updatedPhoto.uploaded_at
    };
  } catch (error) {
    colorLogger.error(`updatePhoto error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to update photo');
  }
};

/**
 * Delete a photo
 * @param {string} userId - User ID
 * @param {string} photoId - Photo ID
 * @param {string} accessToken - User's access token
 * @returns {Promise<boolean>} Success status
 */
const deletePhoto = async (userId, photoId, accessToken) => {
  const adminClient = getAdminClient();
  const supabase = getUserClient(accessToken);

  try {
    // Check if the photo exists and belongs to the user
    const { data: photo, error: getError } = await adminClient
      .from('user_photos')
      .select('*')
      .eq('id', photoId)
      .eq('user_id', userId)
      .single();

    if (getError) {
      colorLogger.error(`Error finding photo: ${getError.message}`);
      throw new ApiError(404, 'Photo not found or does not belong to user');
    }

    const wasPrimary = photo.is_primary;

    // Extract the file path from the URL more reliably
    try {
      // The URL format should be something like:
      // https://xxx.supabase.co/storage/v1/object/public/bucket-name/userId/filename
      const url = new URL(photo.photo_url);
      const pathParts = url.pathname.split('/');
      // Look for the bucket name in the path
      const bucketIndex = pathParts.findIndex((part) => part === PHOTO_BUCKET);
      if (bucketIndex >= 0 && bucketIndex < pathParts.length - 1) {
        // Extract everything after the bucket name
        const filePath = pathParts.slice(bucketIndex + 1).join('/');

        // Delete the file from storage
        const { error: deleteStorageError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .remove([filePath]);

        if (deleteStorageError) {
          colorLogger.warn(`Could not delete file from storage: ${deleteStorageError.message}`);
          // Continue anyway to delete the database record
        }
      } else {
        colorLogger.warn(`Could not extract file path from URL: ${photo.photo_url}`);
      }
    } catch (urlError) {
      colorLogger.warn(`Error parsing photo URL: ${urlError.message}`);
      // Continue with database record deletion
    }

    // Delete the photo record
    const { error: deleteError } = await adminClient.from('user_photos').delete().eq('id', photoId);

    if (deleteError) {
      colorLogger.error(`Error deleting photo record: ${deleteError.message}`);
      throw new ApiError(500, 'Failed to delete photo record');
    }

    // If this was the primary photo, set another one as primary
    if (wasPrimary) {
      const { data: remainingPhotos, error: fetchError } = await adminClient
        .from('user_photos')
        .select('id')
        .eq('user_id', userId)
        .order('photo_order', { ascending: true })
        .limit(1);

      if (!fetchError && remainingPhotos && remainingPhotos.length > 0) {
        // Set the first remaining photo as primary
        const { error: updateError } = await adminClient
          .from('user_photos')
          .update({ is_primary: true })
          .eq('id', remainingPhotos[0].id);

        if (updateError) {
          colorLogger.warn(`Failed to set new primary photo: ${updateError.message}`);
          // Continue anyway, as the photo was deleted successfully
        }
      }
    }

    await updateProfileCompletionPercentage(userId);

    colorLogger.info(`Photo ${photoId} deleted for user ${userId}`);

    return true;
  } catch (error) {
    colorLogger.error(`deletePhoto error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to delete photo');
  }
};

/**
 * Get a user's primary photo
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Primary photo or null if none
 */
const getPrimaryPhoto = async (userId) => {
  const adminClient = getAdminClient();

  try {
    const { data: photo, error } = await adminClient
      .from('user_photos')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single();

    if (error) {
      // PGRST116 is the "no rows returned" error code from PostgREST
      if (error.code === 'PGRST116') {
        // If no primary photo, try to get the first photo by order
        const { data: firstPhoto, error: firstError } = await adminClient
          .from('user_photos')
          .select('*')
          .eq('user_id', userId)
          .order('photo_order', { ascending: true })
          .limit(1)
          .single();

        if (firstError || !firstPhoto) {
          return null; // No photos at all
        }

        return {
          id: firstPhoto.id,
          photoUrl: firstPhoto.photo_url,
          order: firstPhoto.photo_order,
          is_primary: firstPhoto.is_primary,
          uploadedAt: firstPhoto.uploaded_at
        };
      }

      colorLogger.error(`Error fetching primary photo: ${error.message}`);
      throw new ApiError(500, 'Failed to fetch primary photo');
    }

    return {
      id: photo.id,
      photoUrl: photo.photo_url,
      order: photo.photo_order,
      is_primary: photo.is_primary,
      uploadedAt: photo.uploaded_at
    };
  } catch (error) {
    colorLogger.error(`getPrimaryPhoto error: ${error.message}`);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Failed to get primary photo');
  }
};

module.exports = {
  getUserPhotos,
  uploadMultiplePhotos,
  updatePhoto,
  deletePhoto,
  getPrimaryPhoto,
  ensurePhotosBucketExists
};
