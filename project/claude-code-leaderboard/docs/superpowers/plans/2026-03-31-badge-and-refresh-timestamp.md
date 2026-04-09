# Badge System & Refresh Timestamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리더보드에 누적 사용량 기반 뱃지(닉네임 앞 이모지)와 데이터 갱신 일시 표시를 추가한다.

**Architecture:** API에서 기간별 토큰과 별도로 all-time 누적 토큰을 함께 내려주고, 프론트엔드에서 뱃지 이모지를 계산하여 닉네임 앞에 표시한다. 갱신 일시는 fetch 성공 시점을 state로 관리하여 테이블 하단에 표시한다.

**Tech Stack:** Next.js (App Router), React, TypeScript, Supabase, Tailwind CSS

---

### Task 1: API에 all-time 누적 토큰 추가

**Files:**
- Modify: `src/app/api/leaderboard/route.ts`

- [ ] **Step 1: all-time sessions 집계 로직 추가**

`src/app/api/leaderboard/route.ts`에서, 기존 `sessionsQuery` 아래에 all-time 집계를 추가한다. period가 `all`이면 기존 집계를 재사용한다.

```typescript
  // --- 기존 코드: 기간별 sessions 집계 ---
  const { data: sessions, error: sessionsError } = await sessionsQuery
  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 })

  const userTotals = new Map<string, number>()
  for (const s of sessions || []) {
    userTotals.set(s.user_id, (userTotals.get(s.user_id) || 0) + (s.total_tokens || 0))
  }

  // --- 새로 추가: all-time 누적 토큰 집계 ---
  let userAllTimeTotals: Map<string, number>
  if (period === 'all') {
    // period=all이면 기간별 집계가 곧 all-time
    userAllTimeTotals = userTotals
  } else {
    const { data: allSessions, error: allError } = await serviceClient
      .from('sessions')
      .select('user_id, total_tokens')
    if (allError) return NextResponse.json({ error: allError.message }, { status: 500 })

    userAllTimeTotals = new Map<string, number>()
    for (const s of allSessions || []) {
      userAllTimeTotals.set(s.user_id, (userAllTimeTotals.get(s.user_id) || 0) + (s.total_tokens || 0))
    }
  }
```

- [ ] **Step 2: 응답에 all_time_tokens 필드 추가**

같은 파일의 result 생성 부분에서 `all_time_tokens`를 추가한다.

```typescript
  const result = (users || [])
    .map(u => ({
      user_id: u.id,
      nickname: u.nickname,
      department: u.department,
      role: u.role,
      total_tokens: userTotals.get(u.id) || 0,
      all_time_tokens: userAllTimeTotals.get(u.id) || 0,
      isMe: u.id === user.id,
    }))
    .filter(u => u.total_tokens > 0)
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .map((u, i) => ({ ...u, rank: i + 1 }))
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/leaderboard/route.ts
git commit -m "feat: API에 all-time 누적 토큰 필드 추가"
```

---

### Task 2: LeaderboardTable에 뱃지 시스템 추가

**Files:**
- Modify: `src/components/LeaderboardTable.tsx`

- [ ] **Step 1: Entry 타입에 all_time_tokens 추가**

```typescript
type Entry = {
  rank: number
  nickname: string
  department: string
  total_tokens: number
  all_time_tokens: number
  isMe?: boolean
}
```

- [ ] **Step 2: 뱃지 티어 상수 및 계산 함수 추가**

컴포넌트 파일 상단 (Entry 타입 아래)에 추가:

```typescript
const BADGE_TIERS = [
  { threshold: 10_000_000_000, emoji: '👑' }, // 레전드
  { threshold:  1_000_000_000, emoji: '💎' }, // 마스터
  { threshold:    500_000_000, emoji: '⚔️' }, // 히어로
  { threshold:    100_000_000, emoji: '🔥' }, // 파워유저
  { threshold:     10_000_000, emoji: '⚡' }, // 러너
  { threshold:              0, emoji: '🌱' }, // 새싹
]

function getBadge(allTimeTokens: number): string {
  return BADGE_TIERS.find(t => allTimeTokens >= t.threshold)!.emoji
}
```

- [ ] **Step 3: 닉네임 렌더링에 뱃지 적용**

테이블 body의 닉네임 셀을 수정한다.

기존:
```tsx
<td className="py-3 px-4 font-medium">
  {entry.nickname} {entry.isMe && <span className="text-blue-400 text-xs ml-1">나</span>}
</td>
```

변경:
```tsx
<td className="py-3 px-4 font-medium">
  <span className="mr-1">{getBadge(entry.all_time_tokens)}</span>
  {entry.nickname}
  {entry.isMe && <span className="text-blue-400 text-xs ml-1">나</span>}
</td>
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/components/LeaderboardTable.tsx
git commit -m "feat: 누적 사용량 기반 뱃지를 닉네임 앞에 표시"
```

---

### Task 3: 데이터 갱신 일시 표시

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: lastUpdated state 추가**

기존 state 선언부에 추가:

```typescript
const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
```

- [ ] **Step 2: fetchLeaderboard에서 갱신 시각 저장**

`fetchLeaderboard` 함수의 성공 핸들러에서 `setLastUpdated(new Date())` 추가:

```typescript
const fetchLeaderboard = (silent = false) => {
  if (!silent) setLoading(true)
  fetch(`/api/leaderboard?period=${period}&role=${role}`)
    .then(res => res.json())
    .then(json => {
      setData(json.data || [])
      setLoading(false)
      setLastUpdated(new Date())
    })
    .catch(() => setLoading(false))
}
```

- [ ] **Step 3: 갱신 일시 UI 추가**

`<LeaderboardTable>` 컴포넌트와 설치 명령어 `<div>` 사이에 추가:

```tsx
{lastUpdated && (
  <p className="text-right text-xs text-gray-500">
    마지막 갱신: {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
  </p>
)}
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음

- [ ] **Step 5: dev 서버에서 시각적 확인**

Run: `npm run dev`
확인 사항:
1. 리더보드 테이블 하단에 "마지막 갱신: HH:MM:SS" 표시됨
2. 닉네임 앞에 뱃지 이모지 표시됨 (사용량 없으면 🌱)
3. 기간 탭 전환해도 뱃지는 변하지 않음 (all-time 기준)

- [ ] **Step 6: 커밋**

```bash
git add src/app/page.tsx
git commit -m "feat: 데이터 갱신 일시를 테이블 하단에 표시"
```
