-- 사용자
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('developer', 'non-developer')),
  api_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 세션별 사용량
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS
    (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) STORED,
  session_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, session_id)
);

-- 인덱스
CREATE INDEX idx_sessions_user_created ON sessions(user_id, created_at);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
CREATE INDEX idx_users_api_token ON users(api_token);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_authenticated" ON users
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "sessions_read_authenticated" ON sessions
  FOR SELECT USING (auth.role() = 'authenticated');

-- 리더보드 RPC 함수
CREATE OR REPLACE FUNCTION get_leaderboard(date_filter TEXT, role_filter TEXT)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  nickname TEXT,
  department TEXT,
  role TEXT,
  total_tokens BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(s.total_tokens) DESC) as rank,
    u.id as user_id,
    u.nickname,
    u.department,
    u.role,
    COALESCE(SUM(s.total_tokens), 0)::BIGINT as total_tokens
  FROM users u
  LEFT JOIN sessions s ON s.user_id = u.id
    AND (
      CASE
        WHEN date_filter = 'daily' THEN s.created_at >= (CURRENT_DATE AT TIME ZONE 'Asia/Seoul')
        WHEN date_filter = 'weekly' THEN s.created_at >= ((CURRENT_DATE - INTERVAL '7 days') AT TIME ZONE 'Asia/Seoul')
        ELSE TRUE
      END
    )
  WHERE
    CASE
      WHEN role_filter = 'all' THEN TRUE
      ELSE u.role = role_filter
    END
  GROUP BY u.id, u.nickname, u.department, u.role
  HAVING COALESCE(SUM(s.total_tokens), 0) > 0
  ORDER BY total_tokens DESC;
END;
$$;
