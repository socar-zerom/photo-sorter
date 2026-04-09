import { NextResponse } from "next/server";
import { getBigQueryClient } from "@/lib/bigquery";
import { buildSearchQuery } from "@/lib/queries";
import { SearchParams } from "@/types";

export async function POST(request: Request) {
  try {
    const body: SearchParams = await request.json();

    if (!body.startAt || !body.endAt) {
      return NextResponse.json(
        { error: "시작/종료 시간은 필수입니다" },
        { status: 400 }
      );
    }
    if (!body.region1 && !body.zoneId) {
      return NextResponse.json(
        { error: "지역 또는 존을 선택해주세요" },
        { status: 400 }
      );
    }

    const bq = getBigQueryClient();
    const { query, queryParams } = buildSearchQuery(body);
    const [rows] = await bq.query({ query, params: queryParams });

    return NextResponse.json({ results: rows, count: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("search error:", message);
    return NextResponse.json(
      { error: `검색 중 오류: ${message}` },
      { status: 500 }
    );
  }
}
