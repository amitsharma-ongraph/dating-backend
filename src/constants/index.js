// src/constants/index.js

// User roles
const ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
  DEVELOPER: 'DEVELOPER'
};

// Response messages
const MESSAGES = {
  SUCCESS: {
    LOGIN: 'Login successful',
    LOGOUT: 'Logout successful',
    REGISTER: 'Registration successful. Please verify your email.',
    PASSWORD_RESET_EMAIL: 'Password reset link has been sent. Please check your email.',
    PASSWORD_RESET: 'Password has been reset successfully',
    PROFILE_UPDATED: 'Profile updated successfully',
    PROFILE_RETRIEVED: 'Profile retrieved successfully'
  },
  ERROR: {
    UNAUTHORIZED: 'Authentication required. Please log in.',
    FORBIDDEN: 'You do not have permission to access this resource',
    INVALID_CREDENTIALS: 'Invalid email or password',
    INVALID_TOKEN: 'Invalid or expired token',
    USER_NOT_FOUND: 'User not found',
    USER_EXISTS: 'User already exists',
    SERVER_ERROR: 'An unexpected error occurred. Please try again later.',
    VALIDATION_ERROR: 'Validation error',
    EMAIL_NOT_VERIFIED: 'Please verify your email before logging in'
  }
};

module.exports = {
  ROLES,
  MESSAGES
};
