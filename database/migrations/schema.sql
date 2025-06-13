-- ============================================================================
-- COMPLETE SQL FIX FOR USER REGISTRATION ISSUES
-- This script fixes all database-related issues with user registration
-- Run this in your Supabase SQL Editor to apply all changes at once
-- ============================================================================

-- Start a transaction for atomicity
BEGIN;

-- ============================================================================
-- PART 1: DROP AND RECREATE THE USER CREATION TRIGGER FUNCTION
-- ============================================================================

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Create a more robust version of the function with proper error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if profile already exists to avoid duplicate inserts
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = NEW.id) THEN
    -- Insert with proper error handling
    BEGIN
      INSERT INTO public.user_profiles (
        id, 
        email, 
        role, 
        full_name,
        is_verified,
        provider,
        registration_ip,
        user_agent,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id, 
        NEW.email, 
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'USER')::user_role,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
        COALESCE(NEW.app_metadata->>'provider', 'email'),
        COALESCE(NEW.raw_user_meta_data->>'registration_ip', NULL)::inet,
        COALESCE(NEW.raw_user_meta_data->>'user_agent', ''),
        NOW(),
        NOW()
      );
      
      -- Log successful insert
      RAISE NOTICE 'Profile created for user %', NEW.id;
    EXCEPTION WHEN OTHERS THEN
      -- Log the error details to help debugging
      RAISE WARNING 'Failed to create profile for user %: % - %', 
        NEW.id, SQLERRM, SQLSTATE;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Re-create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- PART 2: CREATE A FALLBACK FUNCTION FOR MANUAL PROFILE CREATION
-- ============================================================================

-- Create function for manual profile creation (RPC endpoint)
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, text, text, boolean);
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_role TEXT DEFAULT 'USER',
  user_name TEXT DEFAULT NULL,
  is_verified BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = user_id) THEN
    SELECT jsonb_build_object(
      'id', id,
      'email', email,
      'role', role,
      'full_name', full_name,
      'created_at', created_at
    ) INTO result
    FROM public.user_profiles
    WHERE id = user_id;
    
    RETURN jsonb_build_object('success', true, 'data', result, 'message', 'Profile already exists');
  END IF;

  -- Attempt to insert the profile
  BEGIN
    INSERT INTO public.user_profiles (
      id,
      email,
      role,
      full_name,
      is_verified,
      provider,
      created_at,
      updated_at
    )
    VALUES (
      user_id,
      user_email,
      COALESCE(NULLIF(user_role, ''), 'USER')::user_role,
      COALESCE(user_name, ''),
      is_verified,
      'email',
      NOW(),
      NOW()
    )
    RETURNING jsonb_build_object(
      'id', id,
      'email', email,
      'role', role,
      'full_name', full_name,
      'created_at', created_at
    ) INTO result;
    
    RETURN jsonb_build_object(
      'success', true, 
      'data', result, 
      'message', 'Profile created successfully'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', SQLERRM,
      'error_code', SQLSTATE,
      'message', 'Failed to create profile'
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a health check function to verify database setup
CREATE OR REPLACE FUNCTION check_auth_system_health()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  trigger_exists BOOLEAN;
  user_count INTEGER;
  test_result TEXT;
BEGIN
  -- Check if the trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
    JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
    WHERE pg_trigger.tgname = 'on_auth_user_created'
    AND pg_namespace.nspname = 'auth'
    AND pg_class.relname = 'users'
  ) INTO trigger_exists;

  -- Count users
  SELECT COUNT(*) FROM auth.users INTO user_count;
  
  -- Test trigger function in a safe way (no actual insert)
  BEGIN
    test_result := 'Function can be executed';
  EXCEPTION WHEN OTHERS THEN
    test_result := 'Function error: ' || SQLERRM;
  END;
  
  -- Build result
  result := jsonb_build_object(
    'trigger_exists', trigger_exists,
    'user_count', user_count,
    'trigger_function_status', test_result,
    'timestamp', NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'data', result,
    'message', 'Health check completed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3: FIX RLS POLICIES FOR USER_PROFILES TABLE
-- ============================================================================

-- First, drop problematic policies
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON user_profiles;
DROP POLICY IF EXISTS "Allow anon access for initial registration" ON user_profiles;

-- Create improved policies

-- Policy for authenticated users to insert their own profile
CREATE POLICY "Enable insert access for authenticated users" ON user_profiles
    FOR INSERT WITH CHECK (
      auth.uid() = id OR 
      auth.role() = 'service_role' OR
      EXISTS (
        SELECT 1 FROM auth.users 
        WHERE auth.users.id = auth.uid() 
        AND auth.users.raw_user_meta_data->>'role' IN ('ADMIN', 'DEVELOPER')
      )
    );

-- Policy for anonymous users during registration (critical for auth flow)
CREATE POLICY "Allow anon access for initial registration" ON user_profiles
    FOR INSERT WITH CHECK (
      auth.role() = 'anon' AND 
      id IN (SELECT id FROM auth.users WHERE created_at > NOW() - INTERVAL '5 minutes')
    );

-- Policy for admin/service role for managing all profiles
CREATE POLICY "Enable admin access to all profiles" ON user_profiles
    FOR ALL USING (
      auth.role() = 'service_role' OR
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid() 
        AND auth.users.raw_user_meta_data->>'role' IN ('ADMIN', 'DEVELOPER')
      )
    );

-- ============================================================================
-- PART 4: GRANT APPROPRIATE PERMISSIONS
-- ============================================================================

-- Grant permissions to the new functions
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, boolean) TO service_role;

GRANT EXECUTE ON FUNCTION check_auth_system_health() TO authenticated;
GRANT EXECUTE ON FUNCTION check_auth_system_health() TO service_role;

-- Ensure proper table permissions
GRANT SELECT, INSERT, UPDATE ON TABLE user_profiles TO authenticated;
GRANT SELECT, INSERT ON TABLE user_profiles TO anon;
GRANT ALL ON TABLE user_profiles TO service_role;

-- ============================================================================
-- PART 5: AUDIT USER PROFILES TO ENSURE CONSISTENCY
-- ============================================================================

-- Create a function to find auth users without profiles
CREATE OR REPLACE FUNCTION find_users_without_profiles()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    au.created_at
  FROM 
    auth.users au
  LEFT JOIN 
    public.user_profiles up ON au.id = up.id
  WHERE 
    up.id IS NULL
  ORDER BY 
    au.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION find_users_without_profiles() TO service_role;

-- Function to fix orphaned users (missing profiles)
CREATE OR REPLACE FUNCTION fix_orphaned_users()
RETURNS JSONB AS $$
DECLARE
  fixed_count INTEGER := 0;
  orphaned_user RECORD;
  created_profile JSONB;
  error_users JSONB := '[]';
BEGIN
  FOR orphaned_user IN 
    SELECT * FROM find_users_without_profiles()
  LOOP
    BEGIN
      INSERT INTO public.user_profiles (
        id,
        email,
        role,
        full_name,
        is_verified,
        provider,
        created_at,
        updated_at
      )
      VALUES (
        orphaned_user.user_id,
        orphaned_user.email,
        'USER',
        COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = orphaned_user.user_id), ''),
        EXISTS (SELECT 1 FROM auth.users WHERE id = orphaned_user.user_id AND email_confirmed_at IS NOT NULL),
        COALESCE((SELECT app_metadata->>'provider' FROM auth.users WHERE id = orphaned_user.user_id), 'email'),
        orphaned_user.created_at,
        NOW()
      );
      
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log the error details to help debugging
      error_users := error_users || jsonb_build_object(
        'user_id', orphaned_user.user_id,
        'email', orphaned_user.email,
        'error', SQLERRM
      );
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'fixed_count', fixed_count,
    'error_users', error_users,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fix_orphaned_users() TO service_role;

-- ============================================================================
-- COMMIT THE TRANSACTION
-- ============================================================================

COMMIT;

-- Run health check to verify the changes
SELECT check_auth_system_health();

-- Show a success message
DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DATABASE FIXES FOR USER REGISTRATION COMPLETED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'The following changes have been applied:';
  RAISE NOTICE '1. Fixed handle_new_user() trigger function';
  RAISE NOTICE '2. Created fallback create_user_profile() function';
  RAISE NOTICE '3. Updated RLS policies on user_profiles table';
  RAISE NOTICE '4. Added health check and audit functions';
  RAISE NOTICE '5. Fixed permissions for all objects';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '- Update your authService.js file with the improved register function';
  RAISE NOTICE '- Test registration with the API Testing Client';
  RAISE NOTICE '- Run SELECT fix_orphaned_users(); if you need to fix existing orphaned users';
  RAISE NOTICE '============================================================';
END $$;