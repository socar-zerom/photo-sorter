# Claude Code 사내 리더보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 쏘카 전사 직원 대상 Claude Code 사용량 리더보드를 만든다. curl 한 줄로 셋업, 이후 자동 추적.

**Architecture:** Next.js App Router + Supabase (Auth + PostgreSQL). Claude Code Stop hook으로 세션 종료 시 토큰 사용량을 자동 수집하여 서버로 전송. 웹 UI에서 일간/주간/누적 리더보드를 제공.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS 4, Supabase (Auth + DB), Vercel

**Spec:** `docs/superpowers/specs/2026-03-25-claude-code-leaderboard-design.md`

---

## File Structure

```
coding-project/claude-code-leaderboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  ← 루트 레이아웃 (Supabase Provider)
│   │   ├── page.tsx                    ← 리더보드 메인 (로그인 필수)
│   │   ├── login/page.tsx              ← 로그인 (매직링크)
│   │   ├── signup/page.tsx             ← 가입 + 프로필 + curl 표시
│   │   ├── my/page.tsx                 ← 내 대시보드
│   │   ├── auth/callback/route.ts      ← Supabase Auth 콜백
│   │   └── api/
│   │       ├── setup/route.ts          ← GET: bash 셋업 스크립트 반환
│   │       ├── report/route.ts         ← POST: 사용량 수신 (UPSERT)
│   │       ├── leaderboard/route.ts    ← GET: 리더보드 데이터
│   │       ├── me/route.ts             ← GET: 내 사용량
│   │       └── token/regenerate/route.ts ← POST: 토큰 재발급
│   ├── components/
│   │   ├── LeaderboardTable.tsx         ← 순위 테이블
│   │   ├── PeriodTabs.tsx              ← 일간/주간/누적 탭
│   │   ├── RoleTabs.tsx                ← 전체/개발자/비개발자 탭
│   │   ├── UsageChart.tsx              ← 일별 사용량 차트
│   │   └── CurlCommand.tsx             ← curl 명령어 복사 UI
│   ├── lib/
│   │   ├── supabase-server.ts          ← 서버사이드 Supabase 클라이언트
│   │   └── supabase-browser.ts         ← 브라우저 Supabase 클라이언트
│   └── middleware.ts                    ← 인증 미들웨어
├── public/
│   └── report-usage.js                 ← 다운로드용 리포트 스크립트
├── supabase/
│   └── migrations/
│       └── 001_init.sql                ← 테이블 + RLS + RPC 함수 생성
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.local.example
└── .gitignore
```

---

### Task 1: 프로젝트 초기화 + Supabase 설정

**Files:**
- Create: `coding-project/claude-code-leaderboard/package.json`
- Create: `coding-project/claude-code-leaderboard/tsconfig.json`
- Create: `coding-project/claude-code-leaderboard/next.config.ts`
- Create: `coding-project/claude-code-leaderboard/.env.local.example`
- Create: `coding-project/claude-code-leaderboard/.gitignore`
- Create: `coding-project/claude-code-leaderboard/supabase/migrations/001_init.sql`

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
cd /Users/zerom/coding-project
npx create-next-app@latest claude-code-leaderboard --typescript --tailwind --app --src-dir --use-npm --no-eslint --no-import-alias
```

- [ ] **Step 2: Supabase 패키지 설치**

```bash
cd /Users/zerom/coding-project/claude-code-leaderboard
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: .env.local.example 생성**

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: DB 마이그레이션 SQL 작성**

`supabase/migrations/001_init.sql`:
```sql
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
-- sessions INSERT는 service role (RLS bypass)로만 수행하므로 정책 불필요

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
```

- [ ] **Step 5: Supabase 대시보드에서 마이그레이션 실행**

Supabase 프로젝트 생성 후 SQL Editor에서 `001_init.sql` 실행.
Supabase Auth > Settings > Restrict email domain to `socar.kr` 설정.

- [ ] **Step 6: .env.local 생성 (실제 키 입력)**

`.env.local.example`을 `.env.local`로 복사하고 Supabase 대시보드에서 키 복사.

- [ ] **Step 7: dev 서버 확인**

```bash
npm run dev
```
Expected: http://localhost:3000 에서 Next.js 기본 페이지 표시

- [ ] **Step 8: 커밋**

```bash
git add coding-project/claude-code-leaderboard/
git commit -m "feat: 리더보드 프로젝트 초기화 + Supabase 마이그레이션"
```

---

### Task 2: Supabase 클라이언트 + 인증 미들웨어

**Files:**
- Create: `src/lib/supabase-server.ts`
- Create: `src/lib/supabase-browser.ts`
- Create: `src/middleware.ts`
- Create: `src/app/auth/callback/route.ts`

- [ ] **Step 1: 서버사이드 Supabase 클라이언트 작성**

`src/lib/supabase-server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )
}

// Service role client (API routes에서 RLS 우회 시 사용)
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 2: 브라우저 Supabase 클라이언트 작성**

`src/lib/supabase-browser.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: 인증 미들웨어 작성**

`src/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 로그인 불필요 경로
  const publicPaths = ['/login', '/signup', '/auth/callback', '/api/setup', '/api/report']
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|report-usage.js).*)'],
}
```

- [ ] **Step 4: Auth 콜백 라우트 작성**

`src/app/auth/callback/route.ts`:
```typescript
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

- [ ] **Step 5: dev 서버에서 미들웨어 동작 확인**

```bash
npm run dev
```
Expected: `/` 접속 시 `/login`으로 리다이렉트

- [ ] **Step 6: 커밋**

```bash
git add .
git commit -m "feat: Supabase 클라이언트 + 인증 미들웨어"
```

---

### Task 3: 가입 + 로그인 페이지

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/signup/page.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/components/CurlCommand.tsx`

- [ ] **Step 1: 루트 레이아웃 수정**

`src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Claude Code Leaderboard',
  description: '쏘카 Claude Code 사용량 리더보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-950 text-white">
        <main className="max-w-4xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: 로그인 페이지 작성**

`src/app/login/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.endsWith('@socar.kr')) {
      setError('쏘카 이메일(@socar.kr)만 사용할 수 있습니다.')
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h1 className="text-2xl font-bold">메일을 확인하세요</h1>
        <p className="text-gray-400">{email}로 로그인 링크를 보냈습니다.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <h1 className="text-3xl font-bold">Claude Code Leaderboard</h1>
      <p className="text-gray-400">쏘카 이메일로 로그인하세요</p>
      <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="email"
          placeholder="name@socar.kr"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 font-medium">
          로그인 링크 받기
        </button>
      </form>
      <p className="text-gray-500 text-sm">
        처음이신가요? <a href="/signup" className="text-blue-400 hover:underline">가입하기</a>
      </p>
    </div>
  )
}
```

- [ ] **Step 3: CurlCommand 컴포넌트 작성**

`src/components/CurlCommand.tsx`:
```typescript
'use client'
import { useState } from 'react'

export default function CurlCommand({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  const command = `curl -sL "${appUrl}/api/setup" | bash -s -- ${token}`

  const handleCopy = () => {
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full">
      <p className="text-sm text-gray-400 mb-2">아래 명령어를 터미널에 붙여넣으세요:</p>
      <div className="relative bg-gray-900 rounded-lg p-4 font-mono text-sm border border-gray-700">
        <code className="text-green-400 break-all">{command}</code>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-3 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600"
        >
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 가입 페이지 작성**

`src/app/signup/page.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import CurlCommand from '@/components/CurlCommand'

type Step = 'email' | 'verify' | 'profile' | 'done'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState<'developer' | 'non-developer'>('developer')
  const [apiToken, setApiToken] = useState('')
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.endsWith('@socar.kr')) {
      setError('쏘카 이메일(@socar.kr)만 사용할 수 있습니다.')
      return
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/signup` },
    })
    if (error) setError(error.message)
    else setStep('verify')
  }

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인 상태가 아닙니다.'); return }

    const token = crypto.randomUUID()
    const { error } = await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      nickname,
      department,
      role,
      api_token: token,
    })
    if (error) { setError(error.message); return }

    setApiToken(token)
    setStep('done')
  }

  // 이메일 인증 후 돌아왔을 때 프로필 단계로 이동
  // (auth/callback이 /signup으로 리다이렉트)
  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && step === 'email') {
      // 이미 users 테이블에 있으면 done으로
      const { data } = await supabase.from('users').select('api_token').eq('id', user.id).single()
      if (data) {
        setApiToken(data.api_token)
        setStep('done')
      } else {
        setEmail(user.email || '')
        setStep('profile')
      }
    }
  }
  // 컴포넌트 마운트 시 체크
  useEffect(() => { checkAuth() }, [])

  if (step === 'verify') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h1 className="text-2xl font-bold">메일을 확인하세요</h1>
        <p className="text-gray-400">{email}로 인증 링크를 보냈습니다.</p>
        <p className="text-gray-500 text-sm">링크를 클릭하면 자동으로 돌아옵니다.</p>
      </div>
    )
  }

  if (step === 'profile') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="text-2xl font-bold">프로필 설정</h1>
        <form onSubmit={handleProfile} className="flex flex-col gap-4 w-full max-w-sm">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">닉네임</label>
            <input
              type="text" required value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="리더보드에 표시될 이름"
              className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">부서</label>
            <input
              type="text" required value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="소속 부서명"
              className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">역할</label>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => setRole('developer')}
                className={`flex-1 py-3 rounded-lg border ${role === 'developer' ? 'border-blue-500 bg-blue-500/20' : 'border-gray-700 bg-gray-800'}`}>
                개발자
              </button>
              <button type="button"
                onClick={() => setRole('non-developer')}
                className={`flex-1 py-3 rounded-lg border ${role === 'non-developer' ? 'border-blue-500 bg-blue-500/20' : 'border-gray-700 bg-gray-800'}`}>
                비개발자
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 font-medium">
            완료
          </button>
        </form>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="text-2xl font-bold">설정 완료!</h1>
        <CurlCommand token={apiToken} />
        <a href="/" className="text-blue-400 hover:underline">리더보드 보기 →</a>
      </div>
    )
  }

  // step === 'email'
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <h1 className="text-3xl font-bold">가입하기</h1>
      <p className="text-gray-400">쏘카 이메일로 가입하세요</p>
      <form onSubmit={handleSendEmail} className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="email" placeholder="name@socar.kr"
          value={email} onChange={e => setEmail(e.target.value)}
          className="px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 font-medium">
          인증 메일 보내기
        </button>
      </form>
      <p className="text-gray-500 text-sm">
        이미 가입하셨나요? <a href="/login" className="text-blue-400 hover:underline">로그인</a>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: 브라우저에서 가입 플로우 확인**

```bash
npm run dev
```
Expected: `/signup` → 이메일 입력 → 인증 → 프로필 → curl 명령어 표시

- [ ] **Step 6: 커밋**

```bash
git add .
git commit -m "feat: 가입 + 로그인 페이지"
```

---

### Task 4: API Routes (setup, report, leaderboard, me, token)

**Files:**
- Create: `src/app/api/setup/route.ts`
- Create: `src/app/api/report/route.ts`
- Create: `src/app/api/leaderboard/route.ts`
- Create: `src/app/api/me/route.ts`
- Create: `src/app/api/token/regenerate/route.ts`

- [ ] **Step 1: setup API 작성**

`src/app/api/setup/route.ts` — bash 셋업 스크립트를 반환. 기존 settings.json의 Stop hook에 머지하는 로직 포함.

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const script = `#!/bin/bash
set -e

TOKEN="\${1:?Usage: curl -sL '${appUrl}/api/setup' | bash -s -- <API_TOKEN>}"
CONFIG_DIR="$HOME/.config/socar-board"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

echo "🚀 Claude Code Leaderboard 설치 중..."

# 1. config 디렉토리 생성
mkdir -p "$CONFIG_DIR"

# 2. 토큰 저장
echo -n "$TOKEN" > "$CONFIG_DIR/token"
chmod 600 "$CONFIG_DIR/token"

# 3. API URL 저장
echo -n "${appUrl}" > "$CONFIG_DIR/api_url"

# 4. report-usage.js 다운로드
curl -sL "${appUrl}/report-usage.js" > "$CONFIG_DIR/report-usage.js"

# 5. Claude Code settings.json에 Stop hook 추가 (기존 hook 보존)
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  mkdir -p "$HOME/.claude"
  echo '{}' > "$CLAUDE_SETTINGS"
fi

# jq가 없으면 node로 머지
if command -v jq &>/dev/null; then
  HOOK_CMD="node $CONFIG_DIR/report-usage.js"
  ALREADY=$(jq -r '.hooks.Stop // [] | .[].hooks // [] | .[].command // ""' "$CLAUDE_SETTINGS" 2>/dev/null | grep -c "socar-board/report-usage" || true)
  if [ "$ALREADY" = "0" ]; then
    jq '.hooks.Stop = (.hooks.Stop // []) + [{"matcher":".*","hooks":[{"type":"command","command":"node '"$CONFIG_DIR"'/report-usage.js"}]}]' "$CLAUDE_SETTINGS" > "$CLAUDE_SETTINGS.tmp"
    mv "$CLAUDE_SETTINGS.tmp" "$CLAUDE_SETTINGS"
  fi
else
  node -e "
    const fs = require('fs');
    const p = '$CLAUDE_SETTINGS';
    const s = JSON.parse(fs.readFileSync(p,'utf8'));
    if (!s.hooks) s.hooks = {};
    if (!s.hooks.Stop) s.hooks.Stop = [];
    const exists = s.hooks.Stop.some(e => e.hooks && e.hooks.some(h => h.command && h.command.includes('socar-board')));
    if (!exists) {
      s.hooks.Stop.push({matcher:'.*',hooks:[{type:'command',command:'node $CONFIG_DIR/report-usage.js'}]});
      fs.writeFileSync(p, JSON.stringify(s, null, 2));
    }
  "
fi

echo ""
echo "✅ 설치 완료! Claude Code를 사용하면 자동으로 사용량이 추적됩니다."
echo "📊 리더보드: ${appUrl}"
`

  return new NextResponse(script, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
```

- [ ] **Step 2: report API 작성**

`src/app/api/report/route.ts` — api_token 검증 후 UPSERT:

```typescript
import { createServiceClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()

    // 토큰으로 사용자 조회
    const { data: user } = await supabase
      .from('users').select('id').eq('api_token', token).single()
    if (!user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const body = await request.json()
    const { session_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens } = body

    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

    // UPSERT — 동일 session_id는 업데이트
    const { error } = await supabase.from('sessions').upsert(
      {
        user_id: user.id,
        session_id,
        input_tokens: input_tokens || 0,
        output_tokens: output_tokens || 0,
        cache_read_tokens: cache_read_tokens || 0,
        cache_write_tokens: cache_write_tokens || 0,
      },
      { onConflict: 'user_id,session_id' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: leaderboard API 작성**

`src/app/api/leaderboard/route.ts`:

```typescript
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'all'
  const role = searchParams.get('role') || 'all'

  const validPeriods = ['daily', 'weekly', 'all']
  const validRoles = ['all', 'developer', 'non-developer']
  if (!validPeriods.includes(period) || !validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('get_leaderboard', {
    date_filter: period,
    role_filter: role,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data || []).map((entry: any) => ({
    ...entry,
    isMe: entry.user_id === user.id,
  }))

  return NextResponse.json({ data: result })
}
```

- [ ] **Step 4: me API 작성**

`src/app/api/me/route.ts`:

```typescript
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('*').eq('id', user.id).single()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ profile, sessions })
}
```

- [ ] **Step 5: token/regenerate API 작성**

`src/app/api/token/regenerate/route.ts`:

```typescript
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const newToken = crypto.randomUUID()
  const { error } = await supabase
    .from('users').update({ api_token: newToken }).eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ api_token: newToken })
}
```

- [ ] **Step 6: curl로 report API 테스트**

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Authorization: Bearer {테스트_토큰}" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-1","input_tokens":100,"output_tokens":50}'
```
Expected: `{"ok":true}`

- [ ] **Step 7: 커밋**

```bash
git add .
git commit -m "feat: API routes (setup, report, leaderboard, me, token)"
```

---

### Task 5: report-usage.js (클라이언트 스크립트)

**Files:**
- Create: `public/report-usage.js`

- [ ] **Step 1: report-usage.js 작성**

`public/report-usage.js` — ainc의 `report-usage.js`를 기반으로 socar-board용으로 작성. 핵심 로직: stdin에서 transcript_path 파싱 → JSONL에서 토큰 집계 → delta 계산 → 서버 전송 → 실패 시 로컬 큐.

```javascript
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const http = require("http");

// 5초 hard timeout
const HARD_TIMEOUT = setTimeout(() => process.exit(0), 5000);
HARD_TIMEOUT.unref();

const CONFIG_DIR = path.join(os.homedir(), ".config", "socar-board");

// --- Session Cache ---
function getSessionCachePath() {
  return path.join(CONFIG_DIR, "session-cache.json");
}

function loadSessionCache() {
  try { return JSON.parse(fs.readFileSync(getSessionCachePath(), "utf8")); }
  catch { return {}; }
}

function saveSessionCache(cache) {
  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [key, val] of Object.entries(cache)) {
      if (val.ts && val.ts < cutoff) delete cache[key];
    }
    fs.writeFileSync(getSessionCachePath(), JSON.stringify(cache));
  } catch {}
}

// --- Local Queue ---
function getQueuePath() { return path.join(CONFIG_DIR, "queue.jsonl"); }

function enqueue(data) {
  try { fs.appendFileSync(getQueuePath(), data + "\n"); } catch {}
}

function drainQueue(apiUrl, token, maxItems) {
  try {
    const qPath = getQueuePath();
    if (!fs.existsSync(qPath)) return;
    const lines = fs.readFileSync(qPath, "utf8").split("\n").filter(Boolean);
    if (lines.length === 0) return;
    const toSend = lines.slice(0, maxItems);
    const remaining = lines.slice(maxItems);
    const results = new Array(toSend.length).fill(false);
    let done = 0;
    for (let i = 0; i < toSend.length; i++) {
      httpPost(apiUrl, token, toSend[i], 3000, (ok) => {
        results[i] = ok;
        done++;
        if (done === toSend.length) {
          try {
            const failed = toSend.filter((_, idx) => !results[idx]);
            const kept = [...failed, ...remaining];
            if (kept.length === 0) fs.unlinkSync(qPath);
            else fs.writeFileSync(qPath, kept.join("\n") + "\n");
          } catch {}
        }
      });
    }
  } catch {}
}

function httpPost(apiUrl, token, data, timeoutMs, callback) {
  try {
    const url = new URL(apiUrl + "/api/report");
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      timeout: timeoutMs,
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => callback(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on("timeout", () => { req.destroy(); callback(false); });
    req.on("error", () => callback(false));
    req.write(data);
    req.end();
  } catch { callback(false); }
}

// --- Self Update (하루 1회) ---
function selfUpdate(apiUrl) {
  try {
    const lastUpdateFile = path.join(CONFIG_DIR, ".last-update");
    const today = new Date().toISOString().slice(0, 10);
    const lastUpdate = fs.existsSync(lastUpdateFile) ? fs.readFileSync(lastUpdateFile, "utf8").trim() : "";
    if (lastUpdate === today) return;
    const url = new URL(apiUrl + "/report-usage.js");
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(url, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          if (res.statusCode === 200 && body.length > 100) {
            const selfPath = path.join(CONFIG_DIR, "report-usage.js");
            const current = fs.existsSync(selfPath) ? fs.readFileSync(selfPath, "utf8") : "";
            if (body.trim() !== current.trim()) fs.writeFileSync(selfPath, body);
          }
          fs.writeFileSync(lastUpdateFile, today);
        } catch {}
      });
    });
    req.setTimeout(3000, () => req.destroy());
    req.on("error", () => {});
  } catch {}
}

// --- Main ---
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  try {
    const event = JSON.parse(input);
    const transcriptPath = event.transcript_path;
    const sessionId = event.session_id;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

    const token = fs.readFileSync(path.join(CONFIG_DIR, "token"), "utf8").trim();
    const apiUrl = fs.readFileSync(path.join(CONFIG_DIR, "api_url"), "utf8").trim();

    selfUpdate(apiUrl);
    drainQueue(apiUrl, token, 10);

    const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "assistant") continue;
        const usage = entry.message && entry.message.usage;
        if (usage) {
          totalInput += usage.input_tokens || 0;
          totalOutput += usage.output_tokens || 0;
          totalCacheWrite += usage.cache_creation_input_tokens || 0;
          totalCacheRead += usage.cache_read_input_tokens || 0;
        }
      } catch {}
    }

    const totalTokens = totalInput + totalOutput + totalCacheRead + totalCacheWrite;
    if (totalTokens === 0) process.exit(0);

    // Delta 계산
    const cache = loadSessionCache();
    const prev = (sessionId && cache[sessionId]) || { inp: 0, out: 0, cr: 0, cw: 0, n: 0 };
    const dI = Math.max(0, totalInput - prev.inp);
    const dO = Math.max(0, totalOutput - prev.out);
    const dCR = Math.max(0, totalCacheRead - prev.cr);
    const dCW = Math.max(0, totalCacheWrite - prev.cw);
    const dTotal = dI + dO + dCR + dCW;
    if (dTotal <= 0) process.exit(0);

    if (sessionId) {
      cache[sessionId] = { inp: totalInput, out: totalOutput, cr: totalCacheRead, cw: totalCacheWrite, n: prev.n + 1, ts: Date.now() };
      saveSessionCache(cache);
    }

    const submissionId = sessionId ? (prev.n > 0 ? sessionId + "_r" + prev.n : sessionId) : null;

    const data = JSON.stringify({
      session_id: submissionId,
      input_tokens: dI,
      output_tokens: dO,
      cache_read_tokens: dCR,
      cache_write_tokens: dCW,
    });

    enqueue(data);
    httpPost(apiUrl, token, data, 3000, (ok) => {
      if (ok) {
        try {
          const qPath = getQueuePath();
          const qLines = fs.readFileSync(qPath, "utf8").split("\n").filter(Boolean);
          const idx = qLines.lastIndexOf(data);
          if (idx >= 0) qLines.splice(idx, 1);
          if (qLines.length === 0) fs.unlinkSync(qPath);
          else fs.writeFileSync(qPath, qLines.join("\n") + "\n");
        } catch {}
      }
      process.exit(0);
    });
  } catch { process.exit(0); }
});
```

- [ ] **Step 2: 커밋**

```bash
git add public/report-usage.js
git commit -m "feat: report-usage.js 클라이언트 스크립트"
```

---

### Task 6: 리더보드 UI (메인 페이지)

**Files:**
- Create: `src/components/LeaderboardTable.tsx`
- Create: `src/components/PeriodTabs.tsx`
- Create: `src/components/RoleTabs.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: PeriodTabs 컴포넌트 작성**

`src/components/PeriodTabs.tsx`:
```typescript
'use client'

const PERIODS = [
  { key: 'daily', label: '일간' },
  { key: 'weekly', label: '주간' },
  { key: 'all', label: '누적' },
] as const

type Period = typeof PERIODS[number]['key']

export default function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            value === p.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}>
          {p.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: RoleTabs 컴포넌트 작성**

`src/components/RoleTabs.tsx`:
```typescript
'use client'

const ROLES = [
  { key: 'all', label: '전체' },
  { key: 'developer', label: '개발자' },
  { key: 'non-developer', label: '비개발자' },
] as const

type Role = typeof ROLES[number]['key']

export default function RoleTabs({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {ROLES.map(r => (
        <button key={r.key} onClick={() => onChange(r.key)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            value === r.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}>
          {r.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: LeaderboardTable 컴포넌트 작성**

`src/components/LeaderboardTable.tsx`:
```typescript
'use client'

type Entry = {
  rank: number
  nickname: string
  department: string
  total_tokens: number
  isMe?: boolean
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export default function LeaderboardTable({ data, loading }: { data: Entry[]; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-12 text-gray-500">불러오는 중...</div>
  }

  if (data.length === 0) {
    return <div className="text-center py-12 text-gray-500">아직 데이터가 없습니다.</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-sm">
            <th className="py-3 px-4 text-left w-16">#</th>
            <th className="py-3 px-4 text-left">닉네임</th>
            <th className="py-3 px-4 text-left">부서</th>
            <th className="py-3 px-4 text-right">토큰</th>
          </tr>
        </thead>
        <tbody>
          {data.map(entry => (
            <tr key={entry.rank}
              className={`border-b border-gray-800/50 ${entry.isMe ? 'bg-blue-500/10' : 'hover:bg-gray-800/50'}`}>
              <td className="py-3 px-4 font-mono text-gray-400">
                {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
              </td>
              <td className="py-3 px-4 font-medium">
                {entry.nickname} {entry.isMe && <span className="text-blue-400 text-xs ml-1">나</span>}
              </td>
              <td className="py-3 px-4 text-gray-400">{entry.department}</td>
              <td className="py-3 px-4 text-right font-mono">{formatTokens(entry.total_tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: 메인 페이지 작성**

`src/app/page.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import PeriodTabs from '@/components/PeriodTabs'
import RoleTabs from '@/components/RoleTabs'
import LeaderboardTable from '@/components/LeaderboardTable'

export default function Home() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'all'>('daily')
  const [role, setRole] = useState<'all' | 'developer' | 'non-developer'>('all')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leaderboard?period=${period}&role=${role}`)
      .then(res => res.json())
      .then(json => { setData(json.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period, role])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Claude Code Leaderboard</h1>
        <a href="/my" className="text-sm text-blue-400 hover:underline">내 대시보드 →</a>
      </div>
      <div className="flex flex-wrap gap-3">
        <PeriodTabs value={period} onChange={setPeriod} />
        <RoleTabs value={role} onChange={setRole} />
      </div>
      <LeaderboardTable data={data} loading={loading} />
    </div>
  )
}
```

- [ ] **Step 5: 브라우저에서 리더보드 UI 확인**

```bash
npm run dev
```
Expected: `/` 에서 탭 전환 + 테이블 표시

- [ ] **Step 6: 커밋**

```bash
git add .
git commit -m "feat: 리더보드 UI (메인 페이지 + 컴포넌트)"
```

---

### Task 7: 내 대시보드 페이지

**Files:**
- Create: `src/components/UsageChart.tsx`
- Create: `src/app/my/page.tsx`

- [ ] **Step 1: recharts 설치**

```bash
npm install recharts
```

- [ ] **Step 2: UsageChart 컴포넌트 작성**

`src/components/UsageChart.tsx`:
```typescript
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type DailyData = { date: string; tokens: number }

export default function UsageChart({ data }: { data: DailyData[] }) {
  if (data.length === 0) return null

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#fff' }}
          />
          <Bar dataKey="tokens" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: 내 대시보드 페이지 작성**

`src/app/my/page.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import UsageChart from '@/components/UsageChart'
import CurlCommand from '@/components/CurlCommand'

export default function MyPage() {
  const [profile, setProfile] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.json())
      .then(json => {
        setProfile(json.profile)
        setSessions(json.sessions || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-500">불러오는 중...</div>
  if (!profile) return <div className="text-center py-12 text-gray-500">프로필을 찾을 수 없습니다.</div>

  const totalTokens = sessions.reduce((sum: number, s: any) => sum + (s.total_tokens || 0), 0)

  // 일별 집계
  const dailyMap = new Map<string, number>()
  sessions.forEach((s: any) => {
    const date = new Date(s.created_at).toISOString().split('T')[0]
    dailyMap.set(date, (dailyMap.get(date) || 0) + (s.total_tokens || 0))
  })
  const chartData = Array.from(dailyMap.entries())
    .map(([date, tokens]) => ({ date: date.slice(5), tokens }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14) // 최근 14일

  const handleRegenerate = async () => {
    if (!confirm('토큰을 재발급하면 기존 토큰은 무효화됩니다. 계속하시겠습니까?')) return
    const res = await fetch('/api/token/regenerate', { method: 'POST' })
    const json = await res.json()
    if (json.api_token) {
      setProfile({ ...profile, api_token: json.api_token })
      alert('토큰이 재발급되었습니다. curl 명령어를 다시 실행하세요.')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">내 대시보드</h1>
        <a href="/" className="text-sm text-blue-400 hover:underline">← 리더보드</a>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">닉네임</p>
          <p className="text-xl font-bold mt-1">{profile.nickname}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">부서</p>
          <p className="text-xl font-bold mt-1">{profile.department}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">총 토큰</p>
          <p className="text-xl font-bold mt-1">{totalTokens.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-gray-800/50 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">일별 사용량 (최근 14일)</h2>
        <UsageChart data={chartData} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">설치 명령어</h2>
        <CurlCommand token={profile.api_token} />
        <button onClick={handleRegenerate}
          className="text-sm text-red-400 hover:text-red-300">
          토큰 재발급
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 브라우저에서 내 대시보드 확인**

```bash
npm run dev
```
Expected: `/my` 에서 프로필 + 차트 + curl 명령어 표시

- [ ] **Step 5: 커밋**

```bash
git add .
git commit -m "feat: 내 대시보드 (사용량 차트 + 토큰 재발급)"
```

---

### Task 8: 통합 테스트 + Vercel 배포

**Files:**
- Modify: `package.json` (build script 확인)

- [ ] **Step 1: 빌드 테스트**

```bash
cd /Users/zerom/coding-project/claude-code-leaderboard
npm run build
```
Expected: 빌드 성공, 에러 없음

- [ ] **Step 2: 전체 플로우 로컬 테스트**

1. `/signup` → 이메일 가입 → 프로필 입력 → curl 명령어 확인
2. curl 명령어 실행 → `~/.config/socar-board/` 파일 생성 확인
3. `~/.claude/settings.json`에 hook 추가 확인
4. 수동 report API 테스트
5. `/` 리더보드에 데이터 표시 확인
6. `/my` 대시보드 확인

- [ ] **Step 3: Vercel 배포**

```bash
npx vercel --prod
```
환경변수 설정: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`

- [ ] **Step 4: 프로덕션 플로우 테스트**

배포된 URL로 가입 → 셋업 → 리더보드 확인

- [ ] **Step 5: 최종 커밋**

```bash
git add .
git commit -m "feat: Claude Code 사내 리더보드 v1 완성"
```
