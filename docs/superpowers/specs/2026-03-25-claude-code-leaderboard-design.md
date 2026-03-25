# Claude Code 사내 리더보드 설계

## 개요

쏘카 전사 직원 대상 Claude Code 사용량 리더보드. 사용자는 웹에서 가입 후 터미널에 curl 한 줄만 붙여넣으면, 이후 Claude Code 사용량이 자동으로 추적되어 리더보드에 반영된다.

## 요구사항

- **대상**: 쏘카 전사 직원 (사내 이메일 도메인 검증)
- **데이터**: 토큰 사용량
- **분류**: 전체 / 개발자 / 비개발자
- **기간**: 일간 / 주간 / 누적
- **온보딩**: curl 한 줄 복사 → 터미널 붙여넣기 → 끝
- **추적**: Claude Code Stop hook으로 자동 수집

## 기술 스택

| 구성 요소 | 기술 |
|----------|------|
| 프론트엔드 + API | Next.js (App Router) |
| 배포 | Vercel |
| DB | Supabase PostgreSQL |
| 인증 | Supabase Auth (이메일 인증) |
| 스타일링 | Tailwind CSS |

## 아키텍처

```
[사용자 터미널]
  │
  │ curl -sL https://{domain}/api/setup | bash -s -- {토큰}
  │
  ▼
[~/.config/socar-board/]
  ├── token              ← 사용자 인증 토큰 (권한 0600)
  ├── report-usage.js    ← Stop hook에서 실행되는 스크립트
  └── queue.jsonl        ← 전송 실패 시 로컬 큐
         │
         │ Claude Code 세션 종료 시 자동 실행 (5초 타임아웃)
         ▼
[Vercel - Next.js API Routes]
  ├── POST /api/report       ← 토큰 사용량 수신
  ├── GET  /api/setup        ← 셋업 bash 스크립트 반환
  └── GET  /api/leaderboard  ← 리더보드 데이터
         │
         ▼
[Supabase]
  ├── Auth  ← 이메일 가입 + @socar.kr 도메인 제한
  └── DB    ← users, sessions 테이블 (RLS 적용)
         │
         ▼
[Next.js 웹 UI]
  ├── /        ← 리더보드 (로그인 필수)
  ├── /signup  ← 가입 → 토큰 발급 → curl 명령어 표시
  └── /my      ← 내 대시보드
```

## DB 스키마

```sql
-- 사용자
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),  -- Supabase Auth와 연결
  email TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('developer', 'non-developer')),
  api_token TEXT UNIQUE NOT NULL,  -- crypto.randomUUID()로 생성
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 세션별 사용량
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS
    (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) STORED,
  session_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, session_id)  -- 동일 세션 중복 제출 방지
);

-- 인덱스
CREATE INDEX idx_sessions_user_created ON sessions(user_id, created_at);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);
CREATE INDEX idx_users_api_token ON users(api_token);

-- RLS 정책
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- users: 로그인 사용자만 닉네임/부서/역할 조회 가능, api_token은 본인만
CREATE POLICY "users_read_public" ON users
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- sessions: 본인만 삽입, 로그인 사용자는 집계 조회 가능
CREATE POLICY "sessions_insert_own" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_read_all" ON sessions
  FOR SELECT USING (auth.role() = 'authenticated');
```

## 사용자 플로우

### 가입 → 셋업

1. 웹사이트 접속 → `/signup`
2. 사내 이메일 입력 (`@socar.kr` 도메인만 허용)
3. 이메일 인증 링크 클릭
4. 프로필 입력:
   - 닉네임 (리더보드 표시명)
   - 부서 (주관식 텍스트 입력)
   - 역할 선택 (개발자 / 비개발자)
5. 개인 `api_token` 자동 생성 (`crypto.randomUUID()`)
6. 화면에 curl 명령어 표시 → 복사:
   ```bash
   curl -sL https://{domain}/api/setup | bash -s -- {api_token}
   ```
7. 터미널에 붙여넣기 → 끝!

### 셋업 스크립트 동작

1. `~/.config/socar-board/` 디렉토리 생성
2. `token` 파일에 `api_token` 저장 (권한 `0600`)
3. `report-usage.js`를 서버에서 다운로드
4. `~/.claude/settings.json`에 Stop hook 등록 (기존 hook 보존, 추가 머지):
   ```json
   {
     "hooks": {
       "Stop": [{
         "matcher": ".*",
         "hooks": [{
           "type": "command",
           "command": "node ~/.config/socar-board/report-usage.js"
         }]
       }]
     }
   }
   ```
   - 기존 `Stop` hook이 있으면 배열에 추가
   - 기존 hook을 덮어쓰지 않음
5. "설치 완료!" 메시지 출력

### 자동 추적 (report-usage.js)

1. Claude Code 세션 종료 → Stop hook 발동
2. `report-usage.js` 실행 (5초 hard timeout)
3. stdin으로 받은 JSON에서 `transcript_path` 추출
4. JSONL 트랜스크립트 파일 파싱 → `message.usage` 필드에서 토큰 집계
5. `POST /api/report` 으로 전송:
   ```json
   {
     "token": "api_token",
     "session_id": "세션ID",
     "input_tokens": 1234,
     "output_tokens": 567,
     "cache_read_tokens": 890,
     "cache_write_tokens": 12
   }
   ```
6. 전송 실패 시 `queue.jsonl`에 저장 → 다음 세션 종료 시 재시도
7. 동일 session_id 재전송 시 서버에서 UPSERT (중복 방지)

## 웹 UI 페이지

### `/` (메인 - 리더보드)
- Supabase Auth 로그인 필수 (사내 직원만 조회)
- 기간 탭: 일간 | 주간 | 누적
- 분류 탭: 전체 | 개발자 | 비개발자
- 순위 테이블: 랭크, 닉네임, 부서, 토큰 사용량
- 내 순위 하이라이트

### `/signup` (가입)
- 이메일 입력 → 인증
- 닉네임 + 부서 + 역할 입력 → 토큰 발급 + curl 명령어 표시

### `/my` (내 대시보드)
- 내 총 사용량
- 일별 사용량 차트
- curl 명령어 다시 보기
- api_token 재발급 버튼

## API 엔드포인트

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/setup` | 셋업 bash 스크립트 반환 | 없음 (토큰은 파라미터) |
| POST | `/api/report` | 세션 사용량 수신 (UPSERT) | api_token |
| GET | `/api/leaderboard` | 리더보드 데이터 (기간/분류 쿼리) | Supabase Auth |
| GET | `/api/me` | 내 사용량 데이터 | Supabase Auth |
| POST | `/api/token/regenerate` | api_token 재발급 | Supabase Auth |

## 보안

- `api_token`: `crypto.randomUUID()`로 생성, 로컬 파일 권한 `0600`
- 리더보드/API: Supabase Auth 로그인한 `@socar.kr` 사용자만 접근
- `/api/report`: api_token 검증 후 데이터 수신
- RLS: 테이블별 접근 정책 적용
- 토큰 탈취 시: `/my`에서 재발급 가능, 기존 토큰 즉시 무효화

## 프로젝트 구조

```
coding-project/claude-code-leaderboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                ← 리더보드 메인
│   │   ├── signup/page.tsx         ← 가입
│   │   ├── my/page.tsx             ← 내 대시보드
│   │   ├── login/page.tsx          ← 로그인
│   │   └── api/
│   │       ├── setup/route.ts      ← 셋업 스크립트 반환
│   │       ├── report/route.ts     ← 사용량 수신 (UPSERT)
│   │       ├── leaderboard/route.ts ← 리더보드 데이터
│   │       ├── me/route.ts         ← 내 데이터
│   │       └── token/
│   │           └── regenerate/route.ts ← 토큰 재발급
│   ├── components/
│   │   ├── LeaderboardTable.tsx
│   │   ├── PeriodTabs.tsx
│   │   ├── RoleTabs.tsx
│   │   └── UsageChart.tsx
│   └── lib/
│       └── supabase.ts             ← Supabase 클라이언트
├── public/
│   └── report-usage.js             ← 다운로드용 리포트 스크립트
├── package.json
├── tailwind.config.ts
└── .env.local
```
