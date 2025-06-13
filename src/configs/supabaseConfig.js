// src/configs/supabaseConfig.js
const { createClient } = require('@supabase/supabase-js');
const config = require('./envConfig.js');

// Singleton instances
let adminClient = null;
let anonClient = null;

/**
 * Get Supabase admin client with service role key
 * Uses singleton pattern to avoid creating multiple instances
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase admin client
 */
const getAdminClient = () => {
  if (adminClient) return adminClient;

  const { url, serviceRoleKey } = config.supabase;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase admin credentials. Please check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.'
    );
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'x-application-name': 'profile-backend'
      }
    }
  });

  return adminClient;
};

/**
 * Get Supabase anon client for public operations
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase anon client
 */
const getAnonClient = () => {
  if (anonClient) return anonClient;

  const { url, anonKey } = config.supabase;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase public credentials. Please check SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.'
    );
  }

  anonClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    }
  });

  return anonClient;
};

/**
 * Get Supabase client for authenticated user operations
 * @param {string} accessToken - User's access token from login
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase client with user context
 */
const getUserClient = (accessToken) => {
  if (!accessToken) {
    throw new Error('Access token is required for user client');
  }

  const { url, anonKey } = config.supabase;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase credentials. Please check your .env file.');
  }

  // Create a new client instance for each user to avoid session conflicts
  const userClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });

  return userClient;
};

/**
 * Verify a user's token and get their data
 * @param {string} token - JWT token to verify
 * @returns {Promise<{user: Object, error: Error | null}>}
 */
const verifyUserToken = async (token) => {
  try {
    const adminClient = getAdminClient();
    const {
      data: { user },
      error
    } = await adminClient.auth.getUser(token);

    if (error) throw error;

    return { user, error: null };
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return { user: null, error };
  }
};

/**
 * Helper to extract user from request headers
 * @param {string} authHeader - Authorization header value
 * @returns {Promise<{user: Object | null, error: string | null}>}
 */
const getUserFromHeader = async (authHeader) => {
  if (!authHeader) {
    return { user: null, error: 'No authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return { user: null, error: 'No token provided' };
  }

  const { user, error } = await verifyUserToken(token);

  if (error) {
    return { user: null, error: error.message };
  }

  return { user, error: null };
};

// Middleware helper for Express
const createSupabaseMiddleware = () => {
  return async (req, res, next) => {
    const { user, error } = await getUserFromHeader(req.headers.authorization);

    if (error) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: error
      });
    }

    // Attach user and client to request
    req.user = user;
    req.supabase = getUserClient(req.headers.authorization.replace('Bearer ', ''));

    next();
  };
};

// Export a default admin client for backward compatibility
module.exports = {
  getAdminClient,
  getAnonClient,
  getUserClient,
  verifyUserToken,
  getUserFromHeader,
  createSupabaseMiddleware
};
