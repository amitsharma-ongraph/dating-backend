// src/configs/envConfig.js
const dotenv = require('dotenv');
dotenv.config();

// Required environment variables for Milestone 1
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

// Check for required environment variables
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
  process.exit(1);
}

const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 5000,
    env: process.env.NODE_ENV || 'development',
    url: process.env.SERVER_URL || 'http://localhost:5000',
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000']
  },

  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    photoBucket: process.env.PHOTO_BUCKET || 'photos',
    videoBucket: process.env.VIDEO_BUCKET || 'user-videos',
    maxPhotosPerUser: process.env.MAX_PHOTOS_PER_USER || 3,
    maxFileSize: process.env.MAX_FILE_SIZE || 5 * 1024 * 1024, // 5MB
    maxVideoSize: process.env.MAX_VIDEO_SIZE || 20 * 1024 * 1024, // 20MB
    allowedMimeTypes: process.env.ALLOWED_MIME_TYPES || ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
    allowedVideoMimeTypes: process.env.ALLOWED_VIDEO_MIME_TYPES || ['video/webm', 'video/mp4', 'video/quicktime']
  },

  // Frontend URL for redirects and email links
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000'
  }
};

module.exports = config;
