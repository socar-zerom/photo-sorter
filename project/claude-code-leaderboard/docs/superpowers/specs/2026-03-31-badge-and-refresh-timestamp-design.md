# Badge System & Data Refresh Timestamp Design

## Overview

리더보드에 두 가지 기능을 추가한다:
1. **데이터 갱신 일시** — 테이블 하단에 마지막 데이터 갱신 시각 표시
2. **누적 사용량 뱃지** — all-time 토큰 사용량 기반 뱃지를 닉네임 앞에 표시

## Feature 1: 데이터 갱신 일시

### 변경 파일
- `src/app/page.tsx`

### 동작
- `fetchLeaderboard` 성공 시 `lastUpdated` state에 `new Date()` 저장
- 테이블 하단에 `"마지막 갱신: 14:32:05"` 형태로 표시 (HH:MM:SS)
- 1분마다 자동 갱신 시에도 시각 업데이트

### UI
- 테이블과 설치 명령어 섹션 사이에 위치
- 작은 회색 텍스트 (`text-xs text-gray-500`), 우측 정렬

## Feature 2: 누적 사용량 뱃지

### 뱃지 티어

| 누적 토큰 | 뱃지 | 이름 |
|-----------|------|------|
| 0+ | 🌱 | 새싹 |
| 10,000,000+ | ⚡ | 러너 |
| 100,000,000+ | 🔥 | 파워유저 |
| 500,000,000+ | ⚔️ | 히어로 |
| 1,000,000,000+ | 💎 | 마스터 |
| 10,000,000,000+ | 👑 | 레전드 |

### 접근 방식
프론트엔드 순수 계산 방식. DB 변경 없음.

### API 변경 (`src/app/api/leaderboard/route.ts`)
- 기간 필터 적용된 `total_tokens`와 별도로 **all-time 누적 토큰**을 계산
- 기간이 `daily`나 `weekly`일 때: sessions 전체를 한번 더 집계하여 `all_time_tokens` 산출
- 기간이 `all`일 때: `total_tokens`와 `all_time_tokens`는 동일한 값
- 응답 각 항목에 `all_time_tokens: number` 필드 추가

### 프론트엔드 변경 (`src/components/LeaderboardTable.tsx`)
- `Entry` 타입에 `all_time_tokens: number` 추가
- 뱃지 티어 상수 배열 정의 (내림차순 threshold)
- `getBadge(allTimeTokens: number) → string` 함수: threshold 매칭하여 이모지 반환
- 닉네임 렌더링: `{badge} {nickname}` (뱃지 이모지 + 공백 + 닉네임)

### 데이터 흐름
```
[API]
  sessions 전체 집계 → userAllTimeTotals (Map<userId, number>)
  sessions 기간별 집계 → userTotals (Map<userId, number>) — 기존
  응답: { ...기존, all_time_tokens }

[Frontend]
  all_time_tokens → getBadge() → 이모지
  닉네임 앞에 이모지 표시
```

### 변경 파일 요약
| 파일 | 변경 내용 |
|------|----------|
| `src/app/api/leaderboard/route.ts` | all-time 집계 추가, 응답에 `all_time_tokens` 포함 |
| `src/components/LeaderboardTable.tsx` | Entry 타입 확장, 뱃지 계산 함수, 닉네임 렌더링 |
| `src/app/page.tsx` | `lastUpdated` state, 갱신 일시 UI |
