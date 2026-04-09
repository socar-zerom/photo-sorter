import { NextResponse } from "next/server";
import { getBigQueryClient } from "@/lib/bigquery";
import { buildAvailabilityQuery } from "@/lib/queries";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { carIds, startAt, endAt } = body;

    if (!carIds?.length || !startAt || !endAt) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    const bq = getBigQueryClient();
    const { query, queryParams } = buildAvailabilityQuery(carIds, startAt, endAt);
    const [rows] = await bq.query({ query, params: queryParams });

    // car_id별로 그룹핑
    const grouped: Record<number, { occStart: string; occEnd: string }[]> = {};
    for (const row of rows) {
      const id = row.carId;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push({ occStart: row.occStart, occEnd: row.occEnd });
    }

    return NextResponse.json(grouped);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("availability error:", message);
    return NextResponse.json({ error: `조회 오류: ${message}` }, { status: 500 });
  }
}
