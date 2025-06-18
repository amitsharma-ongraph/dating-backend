-- ============================================================================
-- PROFILE MVP - STREAMLINED PRODUCTION SCHEMA
-- Two-tier token system: Profile tokens and Video tokens
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE USER TABLES
-- ============================================================================

-- User profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    profile_token VARCHAR(64) UNIQUE NOT NULL,
    profile_token_qr_url TEXT,
    full_name VARCHAR(100),
    age INTEGER CHECK (age >= 18 AND age <= 100),
    city VARCHAR(100),
    job_title VARCHAR(150),
    hobbies TEXT,
    bio TEXT CHECK (LENGTH(bio) <= 500),
    role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'DEVELOPER', 'ADMIN')),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    profile_completed BOOLEAN DEFAULT false,
    profile_completion_percentage INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User photos table (max 3 photos per user)
CREATE TABLE public.user_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    photo_order INTEGER NOT NULL CHECK (photo_order BETWEEN 1 AND 3),
    is_primary BOOLEAN DEFAULT false,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, photo_order)
);

-- Social links table
CREATE TABLE public.user_social_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'twitter', 'facebook', 'tiktok', 'other')),
    username VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

-- ============================================================================
-- VIDEO SYSTEM TABLES
-- ============================================================================

-- Videos table
CREATE TABLE public.videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_url TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER CHECK (duration_seconds >= 15 AND duration_seconds <= 35),
    video_type VARCHAR(20) NOT NULL CHECK (video_type IN ('default', 'custom')),
    is_active BOOLEAN DEFAULT true,
    is_processing BOOLEAN DEFAULT false,
    storage_provider VARCHAR(50) DEFAULT 'supabase',
    storage_path TEXT,
    file_size_bytes BIGINT,
    is_viewed BOOLEAN DEFAULT false,
    first_viewed_at TIMESTAMP WITH TIME ZONE,
    viewer_token_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- TOKEN SYSTEM TABLES
-- ============================================================================

-- Video tokens table (used for single-view custom videos)
CREATE TABLE public.video_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_code VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'viewed', 'expired', 'revoked')),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    private_label VARCHAR(255),
    private_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 days'),
    viewed_at TIMESTAMP WITH TIME ZONE,
    viewer_ip INET,
    viewer_user_agent TEXT,
    viewer_location JSONB,
    viewer_device JSONB
);

-- Token activity logs
CREATE TABLE public.token_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('profile_token', 'video_token')),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    video_token_id UUID REFERENCES video_tokens(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
        'created', 'viewed', 'responded', 'expired', 'revoked'
    )),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- VIEWER INTERACTION TABLES
-- ============================================================================

-- Viewer responses
CREATE TABLE public.viewer_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    response_type VARCHAR(20) NOT NULL CHECK (response_type IN ('profile', 'video')),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    video_token_id UUID REFERENCES video_tokens(id) ON DELETE CASCADE,
    CONSTRAINT one_response_target CHECK (
        (profile_id IS NOT NULL AND video_token_id IS NULL) OR
        (profile_id IS NULL AND video_token_id IS NOT NULL)
    ),
    interest_level VARCHAR(20) NOT NULL CHECK (interest_level IN ('interested', 'maybe_later', 'not_interested')),
    viewer_name VARCHAR(100),
    viewer_email VARCHAR(255),
    viewer_phone VARCHAR(20),
    viewer_instagram VARCHAR(100),
    preferred_contact_method VARCHAR(20) CHECK (preferred_contact_method IN ('email', 'phone', 'instagram')),
    message TEXT CHECK (LENGTH(message) <= 500),
    ip_address INET,
    user_agent TEXT,
    responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- NOTIFICATION SYSTEM TABLES
-- ============================================================================

-- Notifications table
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'profile_viewed', 'video_viewed', 'interested_response', 
        'profile_incomplete', 'video_processed', 'token_expired', 
        'weekly_summary', 'system_announcement'
    )),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    metadata JSONB,
    is_read BOOLEAN DEFAULT false,
    is_email_sent BOOLEAN DEFAULT false,
    is_sms_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    email_sent_at TIMESTAMP WITH TIME ZONE
);

-- User notification preferences
CREATE TABLE public.user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    email_profile_views BOOLEAN DEFAULT true,
    email_video_views BOOLEAN DEFAULT true,
    email_responses BOOLEAN DEFAULT true,
    email_weekly_summary BOOLEAN DEFAULT true,
    sms_responses BOOLEAN DEFAULT false,
    in_app_profile_views BOOLEAN DEFAULT true,
    in_app_video_views BOOLEAN DEFAULT true,
    in_app_responses BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- AUTH SUPPORT TABLES
-- ============================================================================

-- Auth audit log
CREATE TABLE public.auth_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'login', 'logout', 'signup', 'password_reset_requested',
        'password_reset_completed', 'password_changed', 'profile_updated',
        'account_activated', 'account_deactivated'
    )),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Profile indexes
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_profile_token ON profiles(profile_token);
CREATE INDEX idx_profiles_role ON profiles(role);

-- Video token indexes
CREATE INDEX idx_video_tokens_token_code ON video_tokens(token_code);
CREATE INDEX idx_video_tokens_user_id ON video_tokens(user_id);
CREATE INDEX idx_video_tokens_video_id ON video_tokens(video_id);
CREATE INDEX idx_video_tokens_status ON video_tokens(status);
CREATE INDEX idx_video_tokens_expires_at ON video_tokens(expires_at);

-- Activity log indexes
CREATE INDEX idx_token_activity_logs_profile_id ON token_activity_logs(profile_id);
CREATE INDEX idx_token_activity_logs_video_token_id ON token_activity_logs(video_token_id);

-- Response indexes
CREATE INDEX idx_viewer_responses_profile_id ON viewer_responses(profile_id);
CREATE INDEX idx_viewer_responses_video_token_id ON viewer_responses(video_token_id);

-- Notification indexes
CREATE INDEX idx_notifications_user_id_is_read ON notifications(user_id, is_read);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewer_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Helper function to check if user is admin or developer
CREATE OR REPLACE FUNCTION is_admin_or_developer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('ADMIN', 'DEVELOPER')
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate a secure profile token
CREATE OR REPLACE FUNCTION generate_profile_token()
RETURNS TEXT AS $$
BEGIN
    RETURN 'PRO-' || encode(gen_random_bytes(12), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Generate a secure video token
CREATE OR REPLACE FUNCTION generate_video_token()
RETURNS TEXT AS $$
BEGIN
    RETURN 'VID-' || encode(gen_random_bytes(10), 'hex');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Profiles policies
CREATE POLICY "Profiles are private and only accessible by token or owner" ON profiles
    FOR SELECT USING (auth.uid() = id OR is_admin_or_developer());

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id OR is_admin_or_developer());

-- User photos policies
CREATE POLICY "Photos viewable by profile owner only" ON user_photos
    FOR SELECT USING (auth.uid() = user_id OR is_admin_or_developer());

CREATE POLICY "Users can manage own photos" ON user_photos
    FOR ALL USING (auth.uid() = user_id OR is_admin_or_developer());

-- Videos policies
CREATE POLICY "Videos viewable by creator" ON videos
    FOR SELECT USING (auth.uid() = user_id OR is_admin_or_developer());

CREATE POLICY "Users can manage own videos" ON videos
    FOR ALL USING (auth.uid() = user_id OR is_admin_or_developer());

-- Video tokens policies
CREATE POLICY "Users can view own video tokens" ON video_tokens
    FOR SELECT USING (auth.uid() = user_id OR is_admin_or_developer());

CREATE POLICY "Users can create and update own video tokens" ON video_tokens
    FOR ALL USING (auth.uid() = user_id OR is_admin_or_developer());

-- Viewer responses policies
CREATE POLICY "Anyone can submit response" ON viewer_responses
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view responses to their profiles/videos" ON viewer_responses
    FOR SELECT USING (
        profile_id = auth.uid() OR 
        video_token_id IN (
            SELECT id FROM video_tokens WHERE user_id = auth.uid()
        ) OR 
        is_admin_or_developer()
    );

-- Notifications policies
CREATE POLICY "Users can manage own notifications" ON notifications
    FOR ALL USING (auth.uid() = user_id OR is_admin_or_developer());

-- ============================================================================
-- CORE TRIGGERS
-- ============================================================================

-- Auto-create profile on user signup with unique profile token
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role VARCHAR(20) := COALESCE(NEW.raw_user_meta_data->>'role', 'USER');
    new_profile_token TEXT;
BEGIN
    -- Generate unique profile token
    new_profile_token := generate_profile_token();
    
    -- Validate role
    IF user_role NOT IN ('USER', 'DEVELOPER', 'ADMIN') THEN
        user_role := 'USER';
    END IF;
    
    -- Create profile with unique token
    INSERT INTO public.profiles (
        id, 
        email, 
        profile_token,
        full_name, 
        role,
        is_verified,
        created_at, 
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        new_profile_token,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role,
        COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
        NOW(),
        NOW()
    );
    
    -- Create default notification preferences
    INSERT INTO public.user_notification_preferences (user_id)
    VALUES (NEW.id);
    
    -- Log signup event
    INSERT INTO public.auth_audit_log (user_id, event_type, metadata)
    VALUES (
        NEW.id,
        'signup',
        jsonb_build_object(
            'email', NEW.email,
            'provider', COALESCE(NEW.app_metadata->>'provider', 'email')
        )
    );
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update profile completion percentage
CREATE OR REPLACE FUNCTION update_profile_completion()
RETURNS TRIGGER AS $$
DECLARE
    completion_score INTEGER := 0;
    total_fields INTEGER := 8;
BEGIN
    -- Calculate completion percentage based on filled fields
    IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF NEW.age IS NOT NULL THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF NEW.city IS NOT NULL AND NEW.city != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF NEW.job_title IS NOT NULL AND NEW.job_title != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN
        completion_score := completion_score + 1;
    END IF;
    
    -- Check for photos
    IF EXISTS (SELECT 1 FROM user_photos WHERE user_id = NEW.id) THEN
        completion_score := completion_score + 1;
    END IF;
    
    -- Check for default video
    IF EXISTS (SELECT 1 FROM videos WHERE user_id = NEW.id AND video_type = 'default' AND is_active = true) THEN
        completion_score := completion_score + 1;
    END IF;
    
    -- Check for social links
    IF EXISTS (SELECT 1 FROM user_social_links WHERE user_id = NEW.id) THEN
        completion_score := completion_score + 1;
    END IF;
    
    -- Update percentage
    NEW.profile_completion_percentage := (completion_score * 100) / total_fields;
    NEW.profile_completed := (NEW.profile_completion_percentage >= 80);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profile_completion_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_profile_completion();

-- Handle video token expiration
CREATE OR REPLACE FUNCTION handle_video_token_expiration()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark expired tokens as such
    IF NEW.expires_at < NOW() AND NEW.status = 'active' THEN
        NEW.status := 'expired';
        
        -- Log expiration
        INSERT INTO token_activity_logs (
            log_type,
            video_token_id,
            activity_type,
            metadata
        ) VALUES (
            'video_token',
            NEW.id,
            'expired',
            jsonb_build_object('expired_at', NOW())
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_video_token_expiration
    BEFORE UPDATE ON video_tokens
    FOR EACH ROW EXECUTE FUNCTION handle_video_token_expiration();

-- Handle video token viewing (single-view enforcement)
CREATE OR REPLACE FUNCTION handle_video_token_viewing()
RETURNS TRIGGER AS $$
BEGIN
    -- If status changed to viewed, enforce one-time viewing
    IF OLD.status = 'active' AND NEW.status = 'viewed' THEN
        -- Update video record to mark as viewed
        UPDATE videos
        SET 
            is_viewed = true,
            first_viewed_at = NOW(),
            viewer_token_id = NEW.id
        WHERE id = NEW.video_id;
        
        -- Set viewed timestamp
        NEW.viewed_at := NOW();
        
        -- Log the view
        INSERT INTO token_activity_logs (
            log_type,
            video_token_id,
            activity_type,
            ip_address,
            user_agent,
            metadata
        ) VALUES (
            'video_token',
            NEW.id,
            'viewed',
            NEW.viewer_ip,
            NEW.viewer_user_agent,
            jsonb_build_object(
                'viewer_location', NEW.viewer_location,
                'viewer_device', NEW.viewer_device
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_video_token_viewing_trigger
    BEFORE UPDATE ON video_tokens
    FOR EACH ROW EXECUTE FUNCTION handle_video_token_viewing();

-- ============================================================================
-- CORE FUNCTIONS
-- ============================================================================

-- Create a custom video with token
CREATE OR REPLACE FUNCTION create_custom_video_with_token(
    p_user_id UUID,
    p_video_url TEXT,
    p_thumbnail_url TEXT,
    p_duration_seconds INTEGER,
    p_private_label TEXT DEFAULT NULL,
    p_private_notes TEXT DEFAULT NULL,
    p_days_valid INTEGER DEFAULT 3
)
RETURNS JSONB AS $$
DECLARE
    v_video_id UUID;
    v_token_code TEXT;
    v_token_id UUID;
BEGIN
    -- Create the custom video
    INSERT INTO videos (
        user_id,
        video_url,
        thumbnail_url,
        duration_seconds,
        video_type,
        is_active,
        storage_provider,
        processed_at
    ) VALUES (
        p_user_id,
        p_video_url,
        p_thumbnail_url,
        p_duration_seconds,
        'custom',
        true,
        'supabase',
        NOW()
    ) RETURNING id INTO v_video_id;
    
    -- Generate token for this video
    v_token_code := generate_video_token();
    
    -- Create video token
    INSERT INTO video_tokens (
        token_code,
        user_id,
        video_id,
        private_label,
        private_notes,
        expires_at
    ) VALUES (
        v_token_code,
        p_user_id,
        v_video_id,
        p_private_label,
        p_private_notes,
        NOW() + (p_days_valid || ' days')::INTERVAL
    ) RETURNING id INTO v_token_id;
    
    -- Log token creation
    INSERT INTO token_activity_logs (
        log_type,
        video_token_id,
        activity_type,
        metadata
    ) VALUES (
        'video_token',
        v_token_id,
        'created',
        jsonb_build_object(
            'video_id', v_video_id,
            'expires_at', NOW() + (p_days_valid || ' days')::INTERVAL
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'video_id', v_video_id,
        'token_id', v_token_id,
        'token_code', v_token_code,
        'expires_at', NOW() + (p_days_valid || ' days')::INTERVAL,
        'token_url', '/v/' || v_token_code
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Access profile via token
CREATE OR REPLACE FUNCTION access_profile_by_token(
    p_profile_token TEXT,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_profile JSONB;
    v_photos JSONB;
    v_social_links JSONB;
    v_default_video JSONB;
    v_profile_id UUID;
BEGIN
    -- Get profile by token
    SELECT 
        id,
        jsonb_build_object(
            'id', id,
            'full_name', full_name,
            'age', age,
            'city', city,
            'job_title', job_title,
            'hobbies', hobbies,
            'bio', bio
        ) INTO v_profile_id, v_profile
    FROM profiles
    WHERE profile_token = p_profile_token;
    
    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;
    
    -- Get photos
    SELECT jsonb_agg(jsonb_build_object(
        'id', up.id,
        'photo_url', up.photo_url,
        'photo_order', up.photo_order,
        'is_primary', up.is_primary
    )) INTO v_photos
    FROM user_photos up
    WHERE up.user_id = v_profile_id
    ORDER BY up.photo_order;
    
    -- Get social links
    SELECT jsonb_agg(jsonb_build_object(
        'platform', usl.platform,
        'username', usl.username,
        'url', usl.url
    )) INTO v_social_links
    FROM user_social_links usl
    WHERE usl.user_id = v_profile_id;
    
    -- Get default video
    SELECT jsonb_build_object(
        'id', v.id,
        'video_url', v.video_url,
        'thumbnail_url', v.thumbnail_url,
        'duration_seconds', v.duration_seconds
    ) INTO v_default_video
    FROM videos v
    WHERE v.user_id = v_profile_id 
    AND v.video_type = 'default' 
    AND v.is_active = true
    LIMIT 1;
    
    -- Log the profile view
    INSERT INTO token_activity_logs (
        log_type,
        profile_id,
        activity_type,
        ip_address,
        user_agent
    ) VALUES (
        'profile_token',
        v_profile_id,
        'viewed',
        p_ip_address,
        p_user_agent
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'profile', v_profile,
        'photos', COALESCE(v_photos, '[]'::jsonb),
        'social_links', COALESCE(v_social_links, '[]'::jsonb),
        'default_video', v_default_video
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Access video via token (one-time viewing only)
CREATE OR REPLACE FUNCTION access_video_by_token(
    p_token_code TEXT,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_token RECORD;
    v_video JSONB;
    v_profile JSONB;
BEGIN
    -- Get token and lock for update to prevent race conditions
    SELECT * INTO v_token
    FROM video_tokens
    WHERE token_code = p_token_code
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token not found');
    END IF;
    
    -- Check if token is valid
    IF v_token.status = 'expired' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token has expired');
    END IF;
    
    IF v_token.status = 'viewed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This video has already been viewed and is no longer available');
    END IF;
    
    IF v_token.status = 'revoked' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This token has been revoked by the sender');
    END IF;
    
    -- Get video
    SELECT jsonb_build_object(
        'id', v.id,
        'video_url', v.video_url,
        'thumbnail_url', v.thumbnail_url,
        'duration_seconds', v.duration_seconds,
        'created_at', v.created_at
    ) INTO v_video
    FROM videos v
    WHERE v.id = v_token.video_id;
    
    -- Get profile info (minimal)
    SELECT jsonb_build_object(
        'full_name', p.full_name
    ) INTO v_profile
    FROM profiles p
    WHERE p.id = v_token.user_id;
    
    -- Mark token as viewed (trigger will handle the rest)
    UPDATE video_tokens
    SET 
        status = 'viewed',
        viewer_ip = p_ip_address,
        viewer_user_agent = p_user_agent
    WHERE id = v_token.id;
    
    RETURN jsonb_build_object(
        'success', true,
        'token', jsonb_build_object(
            'id', v_token.id,
            'token_code', v_token.token_code
        ),
        'video', v_video,
        'profile', v_profile,
        'message', 'This is a one-time viewing. Once you close this video, it will no longer be accessible.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get response funnel statistics
CREATE OR REPLACE FUNCTION get_response_funnel(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    profile_views INT;
    video_views INT;
    total_responses INT;
    interested_responses INT;
BEGIN
    -- Count profile views
    SELECT COUNT(*) INTO profile_views
    FROM token_activity_logs
    WHERE profile_id = p_user_id
    AND log_type = 'profile_token'
    AND activity_type = 'viewed';
    
    -- Count video views
    SELECT COUNT(*) INTO video_views
    FROM video_tokens
    WHERE user_id = p_user_id
    AND status = 'viewed';
    
    -- Count total responses
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE interest_level = 'interested')
    INTO total_responses, interested_responses
    FROM viewer_responses
    WHERE (profile_id = p_user_id) OR 
          (video_token_id IN (SELECT id FROM video_tokens WHERE user_id = p_user_id));
    
    RETURN profile_views || ' profile views / ' || 
           video_views || ' video views / ' || 
           total_responses || ' responses / ' ||
           interested_responses || ' interested';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- User statistics view
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    p.id as user_id,
    p.email,
    p.full_name,
    p.profile_token,
    -- Profile stats
    (SELECT COUNT(*) FROM token_activity_logs 
     WHERE profile_id = p.id AND log_type = 'profile_token' AND activity_type = 'viewed') as profile_views,
    -- Video stats
    (SELECT COUNT(*) FROM video_tokens WHERE user_id = p.id) as total_videos_created,
    (SELECT COUNT(*) FROM video_tokens WHERE user_id = p.id AND status = 'viewed') as videos_viewed,
    (SELECT COUNT(*) FROM video_tokens WHERE user_id = p.id AND status = 'active') as active_video_tokens,
    -- Response stats
    (SELECT COUNT(*) FROM viewer_responses 
     WHERE profile_id = p.id OR 
           video_token_id IN (SELECT id FROM video_tokens WHERE user_id = p.id)) as total_responses,
    (SELECT COUNT(*) FROM viewer_responses 
     WHERE (profile_id = p.id OR 
            video_token_id IN (SELECT id FROM video_tokens WHERE user_id = p.id))
     AND interest_level = 'interested') as interested_responses,
    -- Response funnel
    get_response_funnel(p.id) as response_funnel,
    -- Profile completion
    p.profile_completion_percentage,
    p.profile_completed
FROM profiles p;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant specific function permissions
GRANT EXECUTE ON FUNCTION create_custom_video_with_token(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION access_profile_by_token(TEXT, INET, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION access_video_by_token(TEXT, INET, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_response_funnel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_or_developer() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION generate_profile_token() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_video_token() TO authenticated;