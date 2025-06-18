"use strict";

/**
 * Profile MVP - Database Seeder
 * 
 * This script performs a complete seeding of the Profile MVP database.
 * It creates users, profiles, photos, videos, and tokens according to
 * the schema design, with proper relationships and realistic test data.
 * 
 * Features:
 * - Thorough database cleanup
 * - Supabase Auth integration
 * - Storage bucket management
 * - Media handling (photos, videos, thumbnails)
 * - Token generation and assignment
 * - Comprehensive verification and logging
 */

// Dynamic import to support ES module environment
async function importDependencies() {
  try {
    let supabaseConfig, logger, axios, fs, path;
    
    // Try CommonJS require first
    try {
      supabaseConfig = require('../../src/configs/supabaseConfig');
      logger = require('../../src/utils/logger');
      axios = require('axios');
      fs = require('fs');
      path = require('path');
    } catch (err) {
      // If that fails, try dynamic import
      const supabaseConfigModule = await import('../../src/configs/supabaseConfig.js');
      const loggerModule = await import('../../src/utils/logger.js');
      const axiosModule = await import('axios');
      const fsModule = await import('fs');
      const pathModule = await import('path');
      
      supabaseConfig = supabaseConfigModule;
      logger = loggerModule;
      axios = axiosModule.default;
      fs = fsModule;
      path = pathModule;
    }
    
    return {
      getAdminClient: supabaseConfig.getAdminClient,
      colorLogger: logger.colorLogger,
      axios,
      fs,
      path
    };
  } catch (error) {
    console.error('Failed to import dependencies:', error);
    process.exit(1);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// =========================================================================
// SEED DATA CONFIGURATION
// =========================================================================

const SEED_DATA = {
  users: [
    {
      email: 'admin@profile.app',
      password: 'Admin123!',
      role: 'ADMIN',
      full_name: 'Admin User',
      age: 30,
      city: 'San Francisco',
      job_title: 'Platform Administrator',
      hobbies: 'Managing Platform, Data Analysis, User Support',
      bio: 'Platform administrator with expertise in user management and data analysis.',
      social_links: [
        { platform: 'instagram', username: 'profile_admin', url: 'https://instagram.com/profile_admin' },
        { platform: 'linkedin', username: 'profile-admin', url: 'https://linkedin.com/in/profile-admin' }
      ],
      photos: [
        'https://images.unsplash.com/photo-1560250097-0b93528c311a', // Professional man in suit
        'https://images.unsplash.com/photo-1572561300743-2dd367ed0c9a' // Professional headshot
      ]
    },
    {
      email: 'developer@profile.app',
      password: 'Dev123!',
      role: 'DEVELOPER',
      full_name: 'Dev User',
      age: 28,
      city: 'Austin',
      job_title: 'Senior Developer',
      hobbies: 'Coding, Open Source, Tech Meetups, Machine Learning',
      bio: 'Senior developer passionate about building scalable applications and exploring new technologies.',
      social_links: [
        { platform: 'instagram', username: 'dev_profile', url: 'https://instagram.com/dev_profile' },
        { platform: 'linkedin', username: 'profile-dev', url: 'https://linkedin.com/in/profile-dev' },
        { platform: 'twitter', username: 'profile_dev', url: 'https://twitter.com/profile_dev' }
      ],
      photos: [
        'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7', // Developer portrait
        'https://images.unsplash.com/photo-1555952517-2e8e729e0b44' // Person coding
      ]
    },
    {
      email: 'john@example.com',
      password: 'User123!',
      role: 'USER',
      full_name: 'John Smith',
      age: 25,
      city: 'New York',
      job_title: 'Marketing Manager',
      hobbies: 'Photography, Hiking, Coffee, Travel',
      bio: 'Marketing professional who loves adventure and capturing moments through photography.',
      social_links: [
        { platform: 'instagram', username: 'john_adventures', url: 'https://instagram.com/john_adventures' },
        { platform: 'linkedin', username: 'johnsmith', url: 'https://linkedin.com/in/johnsmith' }
      ],
      photos: [
        'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6', // Young man smiling
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d', // Casual portrait
        'https://images.unsplash.com/photo-1492288991661-058aa541ff43'  // Outdoors activity
      ]
    },
    {
      email: 'mike@example.com',
      password: 'User123!',
      role: 'USER',
      full_name: 'Mike Johnson',
      age: 32,
      city: 'Los Angeles',
      job_title: 'Fitness Coach',
      hobbies: 'Gym, Nutrition, Basketball, Cooking',
      bio: 'Certified fitness coach helping people achieve their health and wellness goals.',
      social_links: [
        { platform: 'instagram', username: 'mike_fitness', url: 'https://instagram.com/mike_fitness' },
        { platform: 'other', username: 'Mike Fitness', url: 'https://mikefitness.com' }
      ],
      photos: [
        'https://images.unsplash.com/photo-1504257432389-52343af06ae3', // Fitness trainer
        'https://images.unsplash.com/photo-1571019613914-85f342c6a11e', // Working out
        'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61'  // Sports photo
      ]
    },
    {
      email: 'emma@example.com',
      password: 'User123!',
      role: 'USER',
      full_name: 'Emma Wilson',
      age: 27,
      city: 'Chicago',
      job_title: 'Graphic Designer',
      hobbies: 'Art, Design, Music, Yoga',
      bio: 'Creative designer with a passion for visual storytelling and aesthetics.',
      social_links: [
        { platform: 'instagram', username: 'emma_designs', url: 'https://instagram.com/emma_designs' },
        { platform: 'linkedin', username: 'emmawilson', url: 'https://linkedin.com/in/emmawilson' }
      ],
      photos: [
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330', // Woman with yellow background
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb', // Professional portrait
        'https://images.unsplash.com/photo-1509967419530-da38b4704bc6'  // Casual artistic shot
      ]
    }
  ],
  
  // Videos are royalty-free and appropriate for demo purposes
  defaultVideos: [
    {
      title: 'Default Introduction 1',
      duration_seconds: 25,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/320674257.sd.mp4?s=2cdc6c973f3d04198a0be62a93c20bf902d61b37&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/2495902/free-video-2495902.jpg?auto=compress&cs=tinysrgb&dpr=1&w=500'
    },
    {
      title: 'Default Introduction 2',
      duration_seconds: 22,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/371844467.sd.mp4?s=44e2c551f621ebda01f2e58b75bc37f28df57a4d&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/3699238/free-video-3699238.jpg?auto=compress&cs=tinysrgb&dpr=1&w=500'
    },
    {
      title: 'Default Introduction 3',
      duration_seconds: 18,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/459189907.sd.mp4?s=e407dfa949f4f31a74f8de9bf0c9cce50f4e753a&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/4721060/pexels-photo-4721060.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500'
    }
  ],
  
  // Custom videos for token-specific sharing
  customVideos: [
    {
      title: 'Custom Introduction 1',
      duration_seconds: 20,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/414973963.sd.mp4?s=f01bc376a7e4c9b0a683817c134625254bae8e5e&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/4815497/pexels-photo-4815497.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500',
      private_label: 'For the woman at the coffee shop',
      private_notes: 'Met at Starbucks on Main St, she seemed interested in fitness'
    },
    {
      title: 'Custom Introduction 2',
      duration_seconds: 17,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/499628625.sd.mp4?s=702f2e1c6c3c3e26c9d713b84b1745f90d0d2858&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/6002720/pexels-photo-6002720.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500',
      private_label: 'For Sarah from the gym',
      private_notes: 'Fitness enthusiast, she was interested in nutrition advice'
    },
    {
      title: 'Custom Introduction 3',
      duration_seconds: 27,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/400199409.sd.mp4?s=9b76333ebd43be1eb66e77b6ecab0f5ca5b42b0d&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/4004226/pexels-photo-4004226.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500',
      private_label: 'For Jessica at the bookstore',
      private_notes: 'We talked about photography and travel books'
    },
    {
      title: 'Custom Introduction 4',
      duration_seconds: 19,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/449235183.sd.mp4?s=ff895de73bd5b6cf3da19e6a81c41778c18d6680&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/5205924/pexels-photo-5205924.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500',
      private_label: 'For Emily from the networking event',
      private_notes: 'Works in marketing, discussed potential collaboration'
    },
    {
      title: 'Custom Introduction 5',
      duration_seconds: 31,
      // Pexels free stock video
      video_url: 'https://player.vimeo.com/external/422785114.sd.mp4?s=02d3d0cf87035d6d93443f26c939fea3a3b0491e&profile_id=164&oauth2_token_id=57447761',
      thumbnail_url: 'https://images.pexels.com/videos/4813721/pexels-photo-4813721.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=500',
      private_label: 'For Jen at the art gallery',
      private_notes: 'She loved my photography work, shared Instagram'
    }
  ],
  
  // Storage buckets to create
  storageBuckets: [
    { name: 'photos', public: true },
    { name: 'videos', public: true },
    { name: 'thumbnails', public: true }
  ]
};

// =========================================================================
// DATABASE CLEANUP
// =========================================================================

/**
 * Completely cleans the database, removing all existing data
 * in the correct order to respect foreign key constraints.
 */
async function cleanDatabase(supabase, colorLogger) {
  colorLogger.info('=== CLEANING DATABASE ===');
  
  try {
    // First clean all tables (in correct order for foreign key constraints)
    const tables = [
      'notifications',
      'user_notification_preferences',
      'viewer_responses', 
      'token_activity_logs',
      'video_tokens',
      'videos',
      'user_social_links',
      'user_photos',
      'auth_audit_log',
      // profiles will be cleaned through auth.users cascade
    ];
    
    for (const table of tables) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error && !error.message.includes('does not exist')) {
          colorLogger.warn(`Error cleaning ${table}: ${error.message}`);
        } else {
          colorLogger.info(`✓ Cleaned table: ${table}`);
        }
        
        // Small delay to avoid overwhelming the database
        await sleep(200);
      } catch (err) {
        colorLogger.warn(`Failed to clean ${table}: ${err.message}`);
      }
    }

    // Clean storage buckets if they exist
    try {
      // List buckets first
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (!bucketsError && buckets && buckets.length > 0) {
        colorLogger.info('Cleaning storage buckets...');
        
        for (const bucket of buckets) {
          // Only clean user-related buckets
          if (['photos', 'videos', 'thumbnails'].includes(bucket.name)) {
            try {
              // List all files in the bucket
              const { data: files, error: listError } = await supabase.storage
                .from(bucket.name)
                .list();
                
              if (!listError && files && files.length > 0) {
                // Create batches of file paths to delete (to avoid hitting API limits)
                const batchSize = 100;
                for (let i = 0; i < files.length; i += batchSize) {
                  const batch = files.slice(i, i + batchSize).map(file => file.name);
                  if (batch.length > 0) {
                    await supabase.storage.from(bucket.name).remove(batch);
                    colorLogger.info(`✓ Removed ${batch.length} files from ${bucket.name}`);
                  }
                }
              }
            } catch (bucketErr) {
              colorLogger.warn(`Error cleaning bucket ${bucket.name}: ${bucketErr.message}`);
            }
          }
        }
      }
    } catch (storageErr) {
      colorLogger.warn(`Error accessing storage: ${storageErr.message}`);
    }

    // Finally clean auth users (this will cascade to profiles due to FK constraint)
    try {
      colorLogger.info('Cleaning auth users...');
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      
      if (existingUsers?.users?.length > 0) {
        for (const user of existingUsers.users) {
          // Skip if system user
          if (user.email && (user.email.includes('service-role') || user.email.includes('supabase'))) {
            continue;
          }
          
          const { error } = await supabase.auth.admin.deleteUser(user.id);
          if (error) {
            colorLogger.warn(`Error deleting auth user ${user.email}: ${error.message}`);
          } else {
            colorLogger.info(`✓ Deleted auth user: ${user.email}`);
          }
          
          // Small delay to avoid overwhelming the database
          await sleep(200);
        }
      }
    } catch (err) {
      colorLogger.warn(`Error cleaning auth users: ${err.message}`);
    }
    
    // Wait for cascade deletions to complete
    colorLogger.info('Waiting for cascade deletions to complete...');
    await sleep(2000);
    
    // Verify profiles are deleted (double-check)
    const { data: remainingProfiles, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id, email')
      .limit(10);
    
    if (profileCheckError) {
      colorLogger.warn(`Error checking for remaining profiles: ${profileCheckError.message}`);
    } else if (remainingProfiles && remainingProfiles.length > 0) {
      colorLogger.warn(`Found ${remainingProfiles.length} remaining profiles, attempting manual cleanup...`);
      
      for (const profile of remainingProfiles) {
        try {
          const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', profile.id);
            
          if (deleteError) {
            colorLogger.warn(`Error deleting profile ${profile.id}: ${deleteError.message}`);
          } else {
            colorLogger.info(`✓ Manually deleted profile: ${profile.id}`);
          }
        } catch (err) {
          colorLogger.warn(`Failed to delete profile ${profile.id}: ${err.message}`);
        }
      }
    } else {
      colorLogger.info('All profiles successfully removed.');
    }

    colorLogger.success('✅ Database cleaned successfully');
  } catch (error) {
    colorLogger.error(`❌ Database cleanup failed: ${error.message}`);
    throw error;
  }
}

// =========================================================================
// STORAGE MANAGEMENT
// =========================================================================

/**
 * Ensures that all required storage buckets exist
 */
async function ensureStorageBuckets(supabase, colorLogger) {
  try {
    colorLogger.info('=== SETTING UP STORAGE BUCKETS ===');
    
    // List existing buckets
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      colorLogger.warn(`Error listing buckets: ${listError.message}`);
      return false;
    }
    
    const existingBucketNames = existingBuckets.map(b => b.name);
    
    // Create missing buckets
    for (const bucket of SEED_DATA.storageBuckets) {
      if (!existingBucketNames.includes(bucket.name)) {
        colorLogger.info(`Creating bucket: ${bucket.name}`);
        
        const { error: createError } = await supabase.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: 100 * 1024 * 1024 // 100MB
        });
        
        if (createError) {
          colorLogger.warn(`Error creating bucket ${bucket.name}: ${createError.message}`);
        } else {
          colorLogger.success(`✓ Created bucket: ${bucket.name}`);
        }
      } else {
        colorLogger.info(`Bucket already exists: ${bucket.name}`);
      }
    }
    
    colorLogger.success('✅ Storage buckets configured successfully');
    return true;
  } catch (error) {
    colorLogger.error(`❌ Storage configuration failed: ${error.message}`);
    return false;
  }
}

/**
 * Downloads an image from a URL and uploads it to Supabase storage
 */
async function uploadPhotoToStorage(supabase, photoUrl, userId, order, colorLogger, { axios }) {
  try {
    colorLogger.info(`Uploading photo ${order + 1} from ${photoUrl}...`);
    
    // Download the image
    const response = await axios.get(photoUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000 // 10 second timeout
    });
    
    const imageBuffer = Buffer.from(response.data, 'binary');
    
    // Determine file extension from content-type
    const contentType = response.headers['content-type'];
    const ext = contentType.split('/')[1] || 'jpg';
    
    // Generate a unique filename
    const filename = `${userId}_${order + 1}_${Date.now()}.${ext}`;
    
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('photos')
      .upload(filename, imageBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: true
      });
      
    if (error) throw error;
    
    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('photos')
      .getPublicUrl(filename);
      
    colorLogger.success(`✓ Photo uploaded: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    colorLogger.error(`Failed to upload photo: ${error.message}`);
    
    // Return the original URL as fallback
    return photoUrl;
  }
}

/**
 * Processes a video for storage - downloads thumbnail and gets video info
 */
async function processVideoForStorage(supabase, videoData, userId, isCustom, colorLogger, { axios }) {
  try {
    colorLogger.info(`Processing ${isCustom ? 'custom' : 'default'} video: ${videoData.title}...`);
    
    // For the MVP seeder, we'll just use the provided URLs for videos
    // But we'll download and upload the thumbnails to Supabase
    let thumbnailUrl = videoData.thumbnail_url;
    
    try {
      // Download the thumbnail
      const response = await axios.get(videoData.thumbnail_url, { 
        responseType: 'arraybuffer',
        timeout: 10000 // 10 second timeout
      });
      
      const imageBuffer = Buffer.from(response.data, 'binary');
      
      // Determine file extension from content-type
      const contentType = response.headers['content-type'];
      const ext = contentType.split('/')[1] || 'jpg';
      
      // Generate a unique filename
      const filename = `${userId}_${isCustom ? 'custom' : 'default'}_${Date.now()}.${ext}`;
      
      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('thumbnails')
        .upload(filename, imageBuffer, {
          contentType,
          cacheControl: '3600',
          upsert: true
        });
        
      if (error) throw error;
      
      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('thumbnails')
        .getPublicUrl(filename);
        
      thumbnailUrl = publicUrl;
      colorLogger.success(`✓ Thumbnail uploaded: ${thumbnailUrl}`);
    } catch (thumbError) {
      colorLogger.warn(`Could not process thumbnail, using original URL: ${thumbError.message}`);
    }
    
    return {
      title: videoData.title,
      video_url: videoData.video_url,
      thumbnail_url: thumbnailUrl,
      duration_seconds: videoData.duration_seconds,
      private_label: videoData.private_label,
      private_notes: videoData.private_notes
    };
  } catch (error) {
    colorLogger.error(`Failed to process video: ${error.message}`);
    return videoData; // Return original data as fallback
  }
}

// =========================================================================
// PROFILE & MEDIA CREATION
// =========================================================================

/**
 * Creates a user in Supabase Auth and sets up their profile
 */
async function createUserAndProfile(supabase, userData, colorLogger) {
  try {
    colorLogger.info(`Creating user: ${userData.email} (${userData.role})...`);
    
    // Create auth user with Supabase Auth
    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true,
      user_metadata: {
        full_name: userData.full_name,
        role: userData.role
      }
    });
    
    if (createError) {
      throw new Error(`Auth creation failed: ${createError.message}`);
    }
    
    const userId = authUser.user.id;
    colorLogger.info(`✓ Auth user created with ID: ${userId}`);
    
    // Wait for trigger to create the profile
    await sleep(1000);
    
    // Check if profile was created by trigger
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    let profile;
    
    if (existingProfile) {
      colorLogger.info(`Profile created by trigger, updating with full data...`);
      
      // Update the profile with complete data
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          role: userData.role,
          full_name: userData.full_name,
          age: userData.age,
          city: userData.city,
          job_title: userData.job_title,
          hobbies: userData.hobbies,
          bio: userData.bio,
          is_active: true,
          is_verified: true,
          profile_completed: true,
          profile_completion_percentage: 100,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();
      
      if (updateError) {
        throw new Error(`Profile update failed: ${updateError.message}`);
      }
      
      profile = updatedProfile;
      colorLogger.info(`✓ Profile updated successfully`);
    } else {
      colorLogger.info(`No profile found, creating manually...`);
      
      // We need to generate a profile token
      let profileToken;
      try {
        const { data: generatedToken, error: tokenError } = await supabase.rpc('generate_profile_token');
        if (tokenError) throw tokenError;
        profileToken = generatedToken;
      } catch (tokenGenError) {
        // If function doesn't exist, generate a simple token
        profileToken = `PRO-${Math.random().toString(36).substring(2, 15)}`;
        colorLogger.warn(`Could not generate token via RPC: ${tokenGenError.message}. Using fallback.`);
      }
      
      // Create profile manually
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: userData.email,
          profile_token: profileToken,
          role: userData.role,
          full_name: userData.full_name,
          age: userData.age,
          city: userData.city,
          job_title: userData.job_title,
          hobbies: userData.hobbies,
          bio: userData.bio,
          is_active: true,
          is_verified: true,
          profile_completed: true,
          profile_completion_percentage: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (profileError) {
        throw new Error(`Profile creation failed: ${profileError.message}`);
      }
      
      profile = newProfile;
      colorLogger.info(`✓ Profile created successfully`);
      
      // Log profile token creation
      try {
        await supabase
          .from('token_activity_logs')
          .insert({
            log_type: 'profile_token',
            profile_id: userId,
            activity_type: 'created',
            metadata: { created_by: 'seeder' }
          });
      } catch (logError) {
        colorLogger.warn(`Failed to log token creation: ${logError.message}`);
      }
    }
    
    return {
      userId,
      profile,
      success: true
    };
  } catch (error) {
    colorLogger.error(`Failed to create user: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Adds social links to a user profile
 */
async function addSocialLinks(supabase, userId, socialLinks, colorLogger) {
  try {
    if (!socialLinks || !socialLinks.length) return [];
    
    colorLogger.info(`Adding ${socialLinks.length} social links for user ${userId}...`);
    
    const socialLinkPayloads = socialLinks.map(link => ({
      user_id: userId,
      platform: link.platform,
      username: link.username,
      url: link.url,
      created_at: new Date().toISOString()
    }));
    
    const { data, error } = await supabase
      .from('user_social_links')
      .insert(socialLinkPayloads)
      .select();
      
    if (error) throw error;
    
    colorLogger.success(`✓ Added ${data.length} social links`);
    return data;
  } catch (error) {
    colorLogger.error(`Failed to add social links: ${error.message}`);
    return [];
  }
}

/**
 * Adds photos to a user profile
 */
async function addUserPhotos(supabase, userId, photoUrls, colorLogger, tools) {
  try {
    if (!photoUrls || !photoUrls.length) return [];
    
    colorLogger.info(`Adding ${Math.min(photoUrls.length, 3)} photos for user ${userId}...`);
    const photos = [];
    
    // Process each photo (maximum 3)
    for (let i = 0; i < Math.min(photoUrls.length, 3); i++) {
      try {
        // Upload photo to Supabase storage
        const photoUrl = await uploadPhotoToStorage(supabase, photoUrls[i], userId, i, colorLogger, tools);
        
        // Add to user_photos table
        const { data, error } = await supabase
          .from('user_photos')
          .insert({
            user_id: userId,
            photo_url: photoUrl,
            photo_order: i + 1,
            is_primary: i === 0,
            uploaded_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (error) throw error;
        
        photos.push(data);
        colorLogger.success(`✓ Added photo ${i + 1}`);
      } catch (photoError) {
        colorLogger.warn(`Failed to add photo ${i + 1}: ${photoError.message}`);
      }
    }
    
    return photos;
  } catch (error) {
    colorLogger.error(`Failed to add user photos: ${error.message}`);
    return [];
  }
}

/**
 * Creates a default video for a user
 */
async function createDefaultVideo(supabase, userId, videoData, colorLogger) {
  try {
    colorLogger.info(`Creating default video for user ${userId}...`);
    
    const videoPayload = {
      user_id: userId,
      video_url: videoData.video_url,
      thumbnail_url: videoData.thumbnail_url,
      duration_seconds: videoData.duration_seconds,
      video_type: 'default',
      is_active: true,
      storage_provider: 'supabase',
      storage_path: `videos/${userId}/default`,
      is_processing: false,
      processed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('videos')
      .insert(videoPayload)
      .select()
      .single();
      
    if (error) throw error;
    
    colorLogger.success(`✓ Created default video: ${data.id}`);
    return data;
  } catch (error) {
    colorLogger.error(`Failed to create default video: ${error.message}`);
    throw error;
  }
}

/**
 * Creates a custom video with an associated token
 */
async function createCustomVideoWithToken(supabase, userId, videoData, colorLogger) {
  try {
    colorLogger.info(`Creating custom video with token for user ${userId}...`);
    
    // Try using the RPC function first
    try {
      const { data: tokenResult, error: rpcError } = await supabase.rpc(
        'create_custom_video_with_token',
        {
          p_user_id: userId,
          p_video_url: videoData.video_url,
          p_thumbnail_url: videoData.thumbnail_url,
          p_duration_seconds: videoData.duration_seconds,
          p_private_label: videoData.private_label || null,
          p_private_notes: videoData.private_notes || null,
          p_days_valid: 30 // Making it valid for 30 days for testing
        }
      );
      
      if (rpcError) throw rpcError;
      
      colorLogger.success(`✓ Created custom video with token via RPC: ${tokenResult.token_code}`);
      return {
        success: true,
        tokenCode: tokenResult.token_code,
        videoId: tokenResult.video_id,
        tokenId: tokenResult.token_id
      };
    } catch (rpcError) {
      // Fall back to manual creation if RPC fails
      colorLogger.warn(`RPC method failed: ${rpcError.message}. Using fallback approach...`);
      
      // Create the video first
      const { data: video, error: videoError } = await supabase
        .from('videos')
        .insert({
          user_id: userId,
          video_url: videoData.video_url,
          thumbnail_url: videoData.thumbnail_url,
          duration_seconds: videoData.duration_seconds,
          video_type: 'custom',
          is_active: true,
          is_processing: false,
          storage_provider: 'supabase',
          storage_path: `videos/${userId}/custom/${Date.now()}`,
          processed_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (videoError) throw videoError;
      
      // Generate token code
      let tokenCode;
      try {
        const { data: generatedToken } = await supabase.rpc('generate_video_token');
        tokenCode = generatedToken;
      } catch (tokenGenError) {
        // If function doesn't exist, generate a simple token
        tokenCode = `VID-${Math.random().toString(36).substring(2, 10)}`;
      }
      
      // Create video token
      const { data: token, error: tokenError } = await supabase
        .from('video_tokens')
        .insert({
          token_code: tokenCode,
          status: 'active',
          user_id: userId,
          video_id: video.id,
          private_label: videoData.private_label || null,
          private_notes: videoData.private_notes || null,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        })
        .select()
        .single();
        
      if (tokenError) throw tokenError;
      
      // Log token creation
      try {
        await supabase
          .from('token_activity_logs')
          .insert({
            log_type: 'video_token',
            video_token_id: token.id,
            activity_type: 'created',
            metadata: { created_by: 'seeder' }
          });
      } catch (logError) {
        colorLogger.warn(`Failed to log token creation: ${logError.message}`);
      }
      
      colorLogger.success(`✓ Created custom video with token (manual): ${token.token_code}`);
      return {
        success: true,
        tokenCode: token.token_code,
        videoId: video.id,
        tokenId: token.id
      };
    }
  } catch (error) {
    colorLogger.error(`Failed to create custom video with token: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// =========================================================================
// MAIN SEEDING FUNCTION
// =========================================================================

/**
 * Main function to seed the database
 */
async function seedDatabase({ getAdminClient, colorLogger, axios, fs, path }) {
  const supabase = getAdminClient();
  const processed = [];
  const failed = [];
  const createdTokens = [];
  
  try {
    colorLogger.info('============================================');
    colorLogger.info('          PROFILE MVP - DATABASE SEEDER    ');
    colorLogger.info('============================================');
    
    // 1. Clean the database
    await cleanDatabase(supabase, colorLogger);
    
    // 2. Ensure storage buckets exist
    await ensureStorageBuckets(supabase, colorLogger);

    // 3. Process each user
    colorLogger.info('\n=== CREATING USERS AND PROFILES ===');
    
    for (const user of SEED_DATA.users) {
      try {
        // Create user and profile
        const { success, userId, profile, error } = await createUserAndProfile(supabase, user, colorLogger);
        
        if (!success) {
          throw new Error(error || 'Failed to create user');
        }
        
        // Add social links
        if (user.social_links && user.social_links.length > 0) {
          await addSocialLinks(supabase, userId, user.social_links, colorLogger);
        }
        
        // Add photos
        if (user.photos && user.photos.length > 0) {
          await addUserPhotos(supabase, userId, user.photos, colorLogger, { axios, fs, path });
        }
        
        // Add default video (using index to pick different videos)
        const defaultVideoIndex = processed.length % SEED_DATA.defaultVideos.length;
        const defaultVideoData = SEED_DATA.defaultVideos[defaultVideoIndex];
        
        // Process the video (potentially upload thumbnail to Supabase)
        const processedDefaultVideo = await processVideoForStorage(
          supabase, 
          defaultVideoData, 
          userId, 
          false, 
          colorLogger, 
          { axios }
        );
        
        // Create the default video record
        await createDefaultVideo(supabase, userId, processedDefaultVideo, colorLogger);
        
        // Add custom videos with tokens for regular users only
        if (user.role === 'USER') {
          // Create 1-2 custom videos for each regular user
          const numCustomVideos = Math.min(2, SEED_DATA.customVideos.length - processed.length % SEED_DATA.customVideos.length);
          
          for (let i = 0; i < numCustomVideos; i++) {
            const customVideoIndex = (processed.length + i) % SEED_DATA.customVideos.length;
            const customVideoData = SEED_DATA.customVideos[customVideoIndex];
            
            // Process the custom video
            const processedCustomVideo = await processVideoForStorage(
              supabase, 
              customVideoData, 
              userId, 
              true, 
              colorLogger, 
              { axios }
            );
            
            // Create the custom video with token
            const tokenResult = await createCustomVideoWithToken(supabase, userId, processedCustomVideo, colorLogger);
            
            if (tokenResult.success) {
              createdTokens.push({
                userId,
                userEmail: user.email,
                tokenCode: tokenResult.tokenCode,
                videoId: tokenResult.videoId,
                tokenId: tokenResult.tokenId,
                label: customVideoData.private_label
              });
            }
          }
        }
        
        // Final verification
        const { data: verifyProfile, error: verifyError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (verifyError || !verifyProfile) {
          throw new Error(`Profile verification failed: ${verifyError?.message || 'Profile not found'}`);
        }
        
        if (verifyProfile.role !== user.role) {
          throw new Error(`Role mismatch: expected ${user.role}, got ${verifyProfile.role}`);
        }
        
        colorLogger.success(`✅ Successfully processed user: ${user.email} with role: ${verifyProfile.role}`);
        processed.push({ 
          ...user, 
          id: userId, 
          profile_token: verifyProfile.profile_token 
        });
        
        // Small delay between users
        await sleep(500);
      } catch (error) {
        colorLogger.error(`❌ Failed to process ${user.email}: ${error.message}`);
        failed.push({ ...user, error: error.message });
      }
    }

    // 4. Final verification and report
    colorLogger.info('\n=== DATABASE SEEDING VERIFICATION ===');
    
    // Check profiles
    const { data: finalProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role, full_name, profile_token, created_at')
      .order('created_at', { ascending: true });
    
    if (profileError) {
      colorLogger.error(`Error fetching profiles: ${profileError.message}`);
    } else {
      colorLogger.info(`Total profiles created: ${finalProfiles.length}`);
      
      if (finalProfiles?.length > 0) {
        colorLogger.info('\nCreated Profiles:');
        finalProfiles.forEach(profile => {
          colorLogger.info(`  • ${profile.email} (${profile.role}) - ${profile.full_name}`);
          colorLogger.info(`    Profile Token: ${profile.profile_token}`);
        });
      }
    }
    
    // Check videos
    const { data: videos, error: videoError } = await supabase
      .from('videos')
      .select('id, video_type, user_id, duration_seconds')
      .order('created_at', { ascending: false });
    
    if (videoError) {
      colorLogger.error(`Error fetching videos: ${videoError.message}`);
    } else {
      const defaultVideos = videos?.filter(v => v.video_type === 'default')?.length || 0;
      const customVideos = videos?.filter(v => v.video_type === 'custom')?.length || 0;
      
      colorLogger.info(`\nTotal videos created: ${videos?.length || 0}`);
      colorLogger.info(`  • Default videos: ${defaultVideos}`);
      colorLogger.info(`  • Custom videos: ${customVideos}`);
    }
    
    // Check tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('video_tokens')
      .select('id, token_code, status, user_id, expires_at, private_label')
      .order('created_at', { ascending: false });
    
    if (tokenError) {
      colorLogger.error(`Error fetching tokens: ${tokenError.message}`);
    } else {
      colorLogger.info(`\nTotal tokens created: ${tokens?.length || 0}`);
      
      if (tokens?.length > 0) {
        colorLogger.info('\nCreated Video Tokens:');
        tokens.slice(0, 5).forEach(token => {
          const userEmail = processed.find(u => u.id === token.user_id)?.email || token.user_id;
          colorLogger.info(`  • ${token.token_code} (${token.status}) - ${userEmail}`);
          if (token.private_label) {
            colorLogger.info(`    Label: ${token.private_label}`);
          }
        });
        
        if (tokens.length > 5) {
          colorLogger.info(`    ... and ${tokens.length - 5} more`);
        }
      }
    }
    
    // Check photos
    const { data: photos, error: photoError } = await supabase
      .from('user_photos')
      .select('id, user_id, photo_url, photo_order, is_primary')
      .order('user_id, photo_order', { ascending: true });
    
    if (photoError) {
      colorLogger.error(`Error fetching photos: ${photoError.message}`);
    } else {
      colorLogger.info(`\nTotal photos created: ${photos?.length || 0}`);
    }
    
    // Check social links
    const { data: socialLinks, error: socialLinkError } = await supabase
      .from('user_social_links')
      .select('id, user_id, platform, username')
      .order('user_id, platform', { ascending: true });
    
    if (socialLinkError) {
      colorLogger.error(`Error fetching social links: ${socialLinkError.message}`);
    } else {
      colorLogger.info(`\nTotal social links created: ${socialLinks?.length || 0}`);
    }
    
    // 5. Summary
    colorLogger.info('\n=== SEEDING SUMMARY ===');
    colorLogger.success(`Successfully processed: ${processed.length} users`);
    colorLogger.error(`Failed to process: ${failed.length} users`);
    
    colorLogger.info(`Created ${finalProfiles?.length || 0} profiles`);
    colorLogger.info(`Created ${videos?.length || 0} videos (${videos?.filter(v => v.video_type === 'default')?.length || 0} default, ${videos?.filter(v => v.video_type === 'custom')?.length || 0} custom)`);
    colorLogger.info(`Created ${tokens?.length || 0} video tokens`);
    colorLogger.info(`Created ${photos?.length || 0} profile photos`);
    colorLogger.info(`Created ${socialLinks?.length || 0} social links`);
    
    return {
      success: processed.length > 0,
      processed,
      failed,
      stats: {
        profiles: finalProfiles?.length || 0,
        videos: videos?.length || 0,
        tokens: tokens?.length || 0,
        photos: photos?.length || 0,
        socialLinks: socialLinks?.length || 0
      }
    };
  } catch (error) {
    colorLogger.error(`Seeding failed: ${error.message}`);
    return { 
      success: false, 
      processed, 
      failed,
      error: error.message 
    };
  }
}

// =========================================================================
// MAIN EXECUTION
// =========================================================================

async function main() {
  try {
    const dependencies = await importDependencies();
    const result = await seedDatabase(dependencies);
    
    if (result.success) {
      dependencies.colorLogger.success('\n🎉 Database seeding completed successfully!');
      dependencies.colorLogger.info('You can now test the application with the seeded users.');
      
      // Display login credentials
      dependencies.colorLogger.info('\nLogin credentials:');
      SEED_DATA.users.forEach(user => {
        dependencies.colorLogger.info(`  • ${user.email} / ${user.password} (${user.role})`);
      });
      
      // Show profile tokens
      if (result.processed.length > 0) {
        dependencies.colorLogger.info('\nProfile Tokens:');
        result.processed.forEach(user => {
          dependencies.colorLogger.info(`  • ${user.email}: ${user.profile_token}`);
          dependencies.colorLogger.info(`    URL: /p/${user.profile_token}`);
        });
      }
      
      process.exit(0);
    } else {
      dependencies.colorLogger.error('\n❌ Database seeding completed with errors');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Database seeding failed: ${error.message}`);
    process.exit(1);
  }
}

// Check if run directly
const isRunDirectly = !module.parent || (typeof __filename !== 'undefined' && process.argv[1] === __filename);
if (isRunDirectly) {
  main();
}

// Export for CommonJS
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = seedDatabase;
}

// Export for ES modules
if (typeof exports !== 'undefined') {
  exports.__esModule = true;
  exports.default = seedDatabase;
}