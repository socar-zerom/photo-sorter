-- buddy 활성화 여부 (Cobalt 선인장 컴패니언)
ALTER TABLE users ADD COLUMN IF NOT EXISTS buddy BOOLEAN NOT NULL DEFAULT FALSE;

-- 한줄 소개 (30자 이내, 유니코드 문자 수 기준)
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT NULL;
ALTER TABLE users ADD CONSTRAINT bio_length_check CHECK (LENGTH(bio) <= 30);

-- 리더보드 RPC 함수에 buddy, bio 추가
CREATE OR REPLACE FUNCTION get_leaderboard(date_filter TEXT, role_filter TEXT)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  nickname TEXT,
  department TEXT,
  role TEXT,
  total_tokens BIGINT,
  buddy BOOLEAN,
  bio TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(s.total_tokens) DESC) as rank,
    u.id as user_id,
    u.nickname,
    u.department,
    u.role,
    COALESCE(SUM(s.total_tokens), 0)::BIGINT as total_tokens,
    u.buddy,
    u.bio
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
  GROUP BY u.id, u.nickname, u.department, u.role, u.buddy, u.bio
  HAVING COALESCE(SUM(s.total_tokens), 0) > 0
  ORDER BY total_tokens DESC;
END;
$$;
