# 대차 차량 검색 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상담사가 지역(구/군) 또는 특정 존 기준으로, 특정 시간대에 가용한 대차 차량을 차급 유사도 순으로 빠르게 검색하는 내부 웹 도구

**Architecture:** Next.js App Router + API Routes가 @google-cloud/bigquery로 직접 쿼리. 프론트에서 지역/존/시간/차급 조건을 입력하면 API가 BigQuery에서 가용 차량을 조회하여 반환. 인증 없음.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 4, @google-cloud/bigquery

---

## File Structure

```
coding-project/replacement-car-finder/
├── src/
│   ├── app/
│   │   ├── layout.tsx              — 루트 레이아웃 (한국어, Geist 폰트)
│   │   ├── page.tsx                — 메인 페이지: 검색 폼 + 결과 테이블
│   │   ├── globals.css             — Tailwind 임포트
│   │   └── api/
│   │       ├── regions/route.ts    — GET: 시/도 → 구/군 목록
│   │       ├── zones/route.ts      — GET: 존 검색/목록 (region 필터 + 키워드)
│   │       └── search/route.ts     — POST: 가용 차량 검색 (핵심 쿼리)
│   ├── lib/
│   │   ├── bigquery.ts             — BigQuery 클라이언트 싱글턴
│   │   └── queries.ts              — SQL 쿼리 빌더 함수들
│   └── types/
│       └── index.ts                — 공유 타입 정의
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── .env.local.example              — 환경변수 템플릿
└── .gitignore
```

---

## BigQuery 참조 정보

### 핵심 테이블
- `tianjin_replica.car_info` — 차량 (id, class_id, zone_id, state, level, sharing_type, car_num)
- `tianjin_replica.car_class` — 차종 (id, car_name, maker, segment, body_type, capacity, power_source)
- `tianjin_replica.reservation_info` — 예약 VIEW (car_id, zone_id, start_at, end_at, occupy_start_at, occupy_end_at, state)
- `tianjin_replica.carzone_info` — 존 (id, name, address, region1, region2, region3, lat, lng, state)

### 차급 서열 (유사도 계산용)
A_SEGMENT(1) → B_SEGMENT(2) → C_SEGMENT(3) → D_SEGMENT(4) → E_SEGMENT(5) → F_SEGMENT(6) → S_SEGMENT(7)

### 필터 조건
- 차량: state=5(운영), level=1(정상), sharing_type='socar'
- 예약 충돌: state IN (1,2,4,5) AND occupy_start_at < 요청종료 AND occupy_end_at > 요청시작
- 존: state=1(운영)

---

## Task 1: 프로젝트 초기화

**Files:**
- Create: `coding-project/replacement-car-finder/package.json`
- Create: `coding-project/replacement-car-finder/tsconfig.json`
- Create: `coding-project/replacement-car-finder/next.config.ts`
- Create: `coding-project/replacement-car-finder/postcss.config.mjs`
- Create: `coding-project/replacement-car-finder/src/app/globals.css`
- Create: `coding-project/replacement-car-finder/src/app/layout.tsx`
- Create: `coding-project/replacement-car-finder/.env.local.example`
- Create: `coding-project/replacement-car-finder/.gitignore`

- [ ] **Step 1: Next.js 프로젝트 생성**

```bash
cd /Users/zerom/coding-project
mkdir replacement-car-finder && cd replacement-car-finder
npm init -y
npm install next@latest react@latest react-dom@latest @google-cloud/bigquery
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss@latest @tailwindcss/postcss postcss
```

- [ ] **Step 2: 설정 파일 작성**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

`postcss.config.mjs`:
```javascript
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`package.json` scripts 추가:
```json
{
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001"
  }
}
```

- [ ] **Step 3: 레이아웃 + .env.local.example 작성**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "대차 차량 검색",
  description: "상담사용 대차 가능 차량 검색 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${geist.variable} font-sans antialiased bg-gray-50`}>
        {children}
      </body>
    </html>
  );
}
```

`.env.local.example`:
```
GOOGLE_CLOUD_PROJECT=socar-data
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

`.gitignore`:
```
node_modules/
.next/
.env.local
```

- [ ] **Step 4: dev 서버 구동 확인**

```bash
cd /Users/zerom/coding-project/replacement-car-finder
npm run dev
```
Expected: http://localhost:3001 에서 빈 페이지 로드 (404이지만 서버 정상 구동)

- [ ] **Step 5: Commit**

```bash
git add coding-project/replacement-car-finder/
git commit -m "feat: 대차 차량 검색 도구 프로젝트 초기화"
```

---

## Task 2: 타입 정의 + BigQuery 클라이언트

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/bigquery.ts`

- [ ] **Step 1: 공유 타입 정의**

`src/types/index.ts`:
```typescript
export interface CarResult {
  carId: number;
  carNum: string;
  carName: string;
  maker: string;
  segment: string;
  bodyType: string;
  capacity: number;
  powerSource: string;
  zoneId: number;
  zoneName: string;
  address: string;
  region1: string;
  region2: string;
  segmentDistance: number;
}

export interface Region {
  region1: string;
  region2List: string[];
}

export interface Zone {
  id: number;
  name: string;
  address: string;
  region1: string;
  region2: string;
}

export interface SearchParams {
  region1?: string;
  region2?: string;
  zoneId?: number;
  startAt: string;  // ISO datetime
  endAt: string;    // ISO datetime
  referenceSegment?: string;
}

export const SEGMENT_RANK: Record<string, number> = {
  A_SEGMENT: 1,
  B_SEGMENT: 2,
  C_SEGMENT: 3,
  D_SEGMENT: 4,
  E_SEGMENT: 5,
  F_SEGMENT: 6,
  S_SEGMENT: 7,
};

export const SEGMENT_LABELS: Record<string, string> = {
  A_SEGMENT: "경차/소형",
  B_SEGMENT: "소형 SUV",
  C_SEGMENT: "준중형",
  D_SEGMENT: "중형",
  E_SEGMENT: "준대형",
  F_SEGMENT: "대형/승합",
  S_SEGMENT: "스포츠",
};
```

- [ ] **Step 2: BigQuery 클라이언트 싱글턴**

`src/lib/bigquery.ts`:
```typescript
import { BigQuery } from "@google-cloud/bigquery";

let client: BigQuery | null = null;

export function getBigQueryClient(): BigQuery {
  if (!client) {
    client = new BigQuery({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || "socar-data",
    });
  }
  return client;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/ src/lib/bigquery.ts
git commit -m "feat: 타입 정의 및 BigQuery 클라이언트 설정"
```

---

## Task 3: SQL 쿼리 빌더

**Files:**
- Create: `src/lib/queries.ts`

- [ ] **Step 1: 쿼리 함수들 작성**

`src/lib/queries.ts`:
```typescript
import { SearchParams } from "@/types";

export function buildRegionsQuery(): string {
  return `
    SELECT DISTINCT region1, region2
    FROM \`socar-data.tianjin_replica.carzone_info\`
    WHERE state = 1 AND region1 IS NOT NULL AND region2 IS NOT NULL
    ORDER BY region1, region2
  `;
}

export function buildZonesQuery(region1?: string, region2?: string, keyword?: string): { query: string; params: Record<string, string> } {
  let conditions = ["state = 1"];
  const params: Record<string, string> = {};

  if (region1) {
    conditions.push("region1 = @region1");
    params.region1 = region1;
  }
  if (region2) {
    conditions.push("region2 = @region2");
    params.region2 = region2;
  }
  if (keyword) {
    conditions.push("(name LIKE @keyword OR address LIKE @keyword)");
    params.keyword = `%${keyword}%`;
  }

  return {
    query: `
      SELECT id, name, address, region1, region2
      FROM \`socar-data.tianjin_replica.carzone_info\`
      WHERE ${conditions.join(" AND ")}
      ORDER BY name
      LIMIT 200
    `,
    params,
  };
}

export function buildSearchQuery(params: SearchParams): { query: string; queryParams: Record<string, unknown> } {
  // 지역 필터 조건
  let locationFilter: string;
  const queryParams: Record<string, unknown> = {
    req_start: params.startAt,
    req_end: params.endAt,
  };

  if (params.zoneId) {
    locationFilter = "ac.zone_id = @zone_id";
    queryParams.zone_id = params.zoneId;
  } else {
    const conditions: string[] = [];
    if (params.region1) {
      conditions.push("cz.region1 = @region1");
      queryParams.region1 = params.region1;
    }
    if (params.region2) {
      conditions.push("cz.region2 = @region2");
      queryParams.region2 = params.region2;
    }
    locationFilter = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  }

  // 차급 유사도 계산
  const segmentRankExpr = params.referenceSegment
    ? `ABS(IFNULL(so.seg_rank, 99) - @ref_rank)`
    : "0";

  if (params.referenceSegment) {
    const rankMap: Record<string, number> = {
      A_SEGMENT: 1, B_SEGMENT: 2, C_SEGMENT: 3,
      D_SEGMENT: 4, E_SEGMENT: 5, F_SEGMENT: 6, S_SEGMENT: 7,
    };
    queryParams.ref_rank = rankMap[params.referenceSegment] ?? 0;
  }

  const query = `
    WITH segment_order AS (
      SELECT 'A_SEGMENT' as segment, 1 as seg_rank UNION ALL
      SELECT 'B_SEGMENT', 2 UNION ALL
      SELECT 'C_SEGMENT', 3 UNION ALL
      SELECT 'D_SEGMENT', 4 UNION ALL
      SELECT 'E_SEGMENT', 5 UNION ALL
      SELECT 'F_SEGMENT', 6 UNION ALL
      SELECT 'S_SEGMENT', 7
    ),
    active_cars AS (
      SELECT
        ci.id as car_id,
        ci.car_num,
        ci.zone_id,
        cc.car_name,
        cc.maker,
        cc.segment,
        cc.body_type,
        cc.capacity,
        cc.power_source,
        so.seg_rank
      FROM \`socar-data.tianjin_replica.car_info\` ci
      JOIN \`socar-data.tianjin_replica.car_class\` cc ON ci.class_id = cc.id
      LEFT JOIN segment_order so ON cc.segment = so.segment
      WHERE ci.state = 5 AND ci.level = 1 AND ci.sharing_type = 'socar'
    ),
    reserved_cars AS (
      SELECT DISTINCT car_id
      FROM \`socar-data.tianjin_replica.reservation_info\` ri
      WHERE ri.state IN (1, 2, 4, 5)
        AND ri.occupy_start_at < TIMESTAMP(@req_end)
        AND ri.occupy_end_at > TIMESTAMP(@req_start)
    )
    SELECT
      ac.car_id AS carId,
      ac.car_num AS carNum,
      ac.car_name AS carName,
      ac.maker,
      ac.segment,
      ac.body_type AS bodyType,
      ac.capacity,
      ac.power_source AS powerSource,
      ac.zone_id AS zoneId,
      cz.name AS zoneName,
      cz.address,
      cz.region1,
      cz.region2,
      ${segmentRankExpr} AS segmentDistance
    FROM active_cars ac
    JOIN \`socar-data.tianjin_replica.carzone_info\` cz ON ac.zone_id = cz.id
    LEFT JOIN reserved_cars rc ON ac.car_id = rc.car_id
    WHERE rc.car_id IS NULL
      AND cz.state = 1
      AND ${locationFilter}
    ORDER BY segmentDistance ASC, ac.car_name ASC
    LIMIT 200
  `;

  return { query, queryParams };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: BigQuery SQL 쿼리 빌더 함수 구현"
```

---

## Task 4: API Routes

**Files:**
- Create: `src/app/api/regions/route.ts`
- Create: `src/app/api/zones/route.ts`
- Create: `src/app/api/search/route.ts`

- [ ] **Step 1: regions API**

`src/app/api/regions/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getBigQueryClient } from "@/lib/bigquery";
import { buildRegionsQuery } from "@/lib/queries";

export async function GET() {
  try {
    const bq = getBigQueryClient();
    const [rows] = await bq.query({ query: buildRegionsQuery() });

    // { region1: string, region2: string }[] → grouped
    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      if (!grouped[row.region1]) grouped[row.region1] = [];
      if (!grouped[row.region1].includes(row.region2)) {
        grouped[row.region1].push(row.region2);
      }
    }

    const regions = Object.entries(grouped).map(([region1, region2List]) => ({
      region1,
      region2List,
    }));

    return NextResponse.json(regions);
  } catch (error) {
    console.error("regions error:", error);
    return NextResponse.json({ error: "Failed to fetch regions" }, { status: 500 });
  }
}
```

- [ ] **Step 2: zones API**

`src/app/api/zones/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getBigQueryClient } from "@/lib/bigquery";
import { buildZonesQuery } from "@/lib/queries";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region1 = searchParams.get("region1") || undefined;
    const region2 = searchParams.get("region2") || undefined;
    const q = searchParams.get("q") || undefined;

    const bq = getBigQueryClient();
    const { query, params } = buildZonesQuery(region1, region2, q);
    const [rows] = await bq.query({ query, params });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("zones error:", error);
    return NextResponse.json({ error: "Failed to fetch zones" }, { status: 500 });
  }
}
```

- [ ] **Step 3: search API**

`src/app/api/search/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getBigQueryClient } from "@/lib/bigquery";
import { buildSearchQuery } from "@/lib/queries";
import { SearchParams } from "@/types";

export async function POST(request: Request) {
  try {
    const body: SearchParams = await request.json();

    if (!body.startAt || !body.endAt) {
      return NextResponse.json({ error: "시작/종료 시간은 필수입니다" }, { status: 400 });
    }
    if (!body.region1 && !body.zoneId) {
      return NextResponse.json({ error: "지역 또는 존을 선택해주세요" }, { status: 400 });
    }

    const bq = getBigQueryClient();
    const { query, queryParams } = buildSearchQuery(body);
    const [rows] = await bq.query({ query, params: queryParams });

    return NextResponse.json({ results: rows, count: rows.length });
  } catch (error) {
    console.error("search error:", error);
    return NextResponse.json({ error: "검색 중 오류가 발생했습니다" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/
git commit -m "feat: regions/zones/search API routes 구현"
```

---

## Task 5: 메인 페이지 UI

**Files:**
- Create: `src/app/page.tsx`

- [ ] **Step 1: 검색 폼 + 결과 테이블 페이지 작성**

`src/app/page.tsx` — 전체 UI를 단일 Client Component로 구현:

**검색 영역:**
- 시/도 드롭다운 → 구/군 드롭다운 (연동)
- "특정 존 검색" 토글 → 존 이름 텍스트 검색 + 드롭다운 선택
- 시작일시, 종료일시 (datetime-local input)
- 참고 차급 드롭다운 (선택사항, "선택 안 함" 포함)
- [검색] 버튼

**결과 영역:**
- 검색 결과 건수 표시
- 테이블: 유사도 뱃지 | 차종 | 번호판 | 차급 | 차체 | 인원 | 연료 | 쏘카존 | 주소
- 유사도 뱃지: "동급" (초록), "↑1" / "↓1" (노랑), "↑2↑" / "↓2↓" (회색)
- 로딩 상태, 빈 결과, 에러 처리

UI 구현 세부사항은 아래 코드 참조 (page.tsx는 약 300줄 예상)

- [ ] **Step 2: dev 서버에서 전체 플로우 테스트**

```bash
cd /Users/zerom/coding-project/replacement-car-finder
npm run dev
```

1. http://localhost:3001 접속
2. 서울특별시 → 강남구 선택 → 시간 입력 → C_SEGMENT 선택 → 검색
3. 결과 테이블에 차량 목록 표시 확인
4. "특정 존 검색" 토글 → 존 검색 → 선택 후 검색 확인

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: 대차 차량 검색 메인 페이지 UI 구현"
```

---

## Task 6: 마무리 및 빌드 확인

- [ ] **Step 1: 빌드 테스트**

```bash
cd /Users/zerom/coding-project/replacement-car-finder
npm run build
```
Expected: 빌드 성공

- [ ] **Step 2: 최종 commit**

```bash
git add -A
git commit -m "feat: 대차 차량 검색 도구 완성"
```
