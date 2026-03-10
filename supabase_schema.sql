-- =====================================================
-- IKEA AR Treasure Hunt - Supabase Database Schema
-- Run this SQL in Supabase SQL Editor to create tables
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Table: access_codes
-- Stores 6-digit access codes for players
-- =====================================================
CREATE TABLE IF NOT EXISTS access_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    code VARCHAR(6) UNIQUE NOT NULL,
    user_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'unused' CHECK (status IN ('unused', 'active', 'completed', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ
);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_status ON access_codes(status);

-- =====================================================
-- Table: game_sessions
-- Tracks player game sessions and progress
-- =====================================================
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    access_code VARCHAR(6) REFERENCES access_codes(code) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    current_clue_index INTEGER DEFAULT 0,
    wrong_scans INTEGER DEFAULT 0,
    completed_clues JSONB DEFAULT '[]'::jsonb,
    assigned_clues JSONB DEFAULT '[]'::jsonb,
    rewards_earned JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ
);

-- Index for session lookups by access code
CREATE INDEX IF NOT EXISTS idx_game_sessions_access_code ON game_sessions(access_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);

-- =====================================================
-- Table: clues (optional - for dynamic clue management)
-- Master list of clues - can be managed via admin
-- =====================================================
CREATE TABLE IF NOT EXISTS clues (
    id VARCHAR(50) PRIMARY KEY,
    target_index INTEGER NOT NULL,
    zone VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    hint TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default clues
INSERT INTO clues (id, target_index, zone, text, hint) VALUES
    ('clue_1', 0, 'Living Room', 'Find a lamp shaped like a Cloud', 'HINT: It''s available in the living area.'),
    ('clue_2', 1, 'Bedroom', 'What rises in the east, sets in the west, and is also a lamp :)', 'HINT: It''s in the bedroom area.'),
    ('clue_3', 2, 'Kitchen', 'It''s fork, It''s a spoon, It''s both!', 'HINT: It''s in the kitchen area.'),
    ('clue_4', 0, 'Checkout', 'One last check! Can you find the giant IKEA Blue Bag?', 'HINT: It''s near the checkout counters.')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Table: analytics_logs (for dashboard reporting)
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    access_code VARCHAR(6),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Table: login_attempts (for rate limiting)
-- =====================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    ip VARCHAR(45) PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    last_attempt TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_logs_event_type ON analytics_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_logs_created_at ON analytics_logs(created_at);

-- =====================================================
-- View: dashboard_stats (for admin dashboard)
-- =====================================================
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'unused') as codes_unused,
    COUNT(*) FILTER (WHERE status = 'active') as codes_active,
    COUNT(*) FILTER (WHERE status = 'completed') as codes_completed,
    COUNT(*) FILTER (WHERE status = 'expired') as codes_expired,
    COUNT(*) as codes_total
FROM access_codes;

-- =====================================================
-- Function: Generate test access codes (for testing)
-- =====================================================
CREATE OR REPLACE FUNCTION generate_test_codes(count INTEGER DEFAULT 10)
RETURNS TABLE(code VARCHAR(6)) AS $$
DECLARE
    new_code VARCHAR(6);
    i INTEGER;
BEGIN
    FOR i IN 1..count LOOP
        -- Generate random 6-digit code
        new_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
        
        -- Insert if unique
        BEGIN
            INSERT INTO access_codes (code, status) VALUES (new_code, 'unused');
            code := new_code;
            RETURN NEXT;
        EXCEPTION WHEN unique_violation THEN
            -- Skip duplicate, try next
            CONTINUE;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Example: Generate 10 test codes
-- SELECT * FROM generate_test_codes(10);
-- =====================================================

-- =====================================================
-- Row Level Security (RLS) - Optional but recommended
-- =====================================================

-- Enable RLS on tables
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read/write (for public game access)
-- In production, you may want to restrict this further
CREATE POLICY "Allow public access to access_codes" ON access_codes
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to game_sessions" ON game_sessions
    FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- DONE! Your database is ready.
-- =====================================================
