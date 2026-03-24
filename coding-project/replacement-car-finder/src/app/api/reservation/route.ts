import { NextResponse } from "next/server";
import { getBigQueryClient } from "@/lib/bigquery";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ error: "유효한 예약번호를 입력해주세요" }, { status: 400 });
    }

    const bq = getBigQueryClient();
    const query = `
      SELECT
        ri.id,
        ri.start_at,
        ri.end_at,
        ri.car_id,
        ri.zone_id,
        ri.car_class_id,
        ri.way,
        cc.car_name,
        cc.segment,
        cc.power_source,
        cz.name AS zone_name,
        cz.region1,
        cz.region2,
        cz.lat,
        cz.lng
      FROM \`socar-data.tianjin_replica.reservation_info\` ri
      LEFT JOIN \`socar-data.tianjin_replica.car_class\` cc ON ri.car_class_id = cc.id
      LEFT JOIN \`socar-data.tianjin_replica.carzone_info\` cz ON ri.zone_id = cz.id
      WHERE ri.id = @reservation_id
    `;
    const [rows] = await bq.query({ query, params: { reservation_id: Number(id) } });

    if (rows.length === 0) {
      return NextResponse.json({ error: "해당 예약을 찾을 수 없습니다" }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      id: row.id,
      startAt: row.start_at?.value || String(row.start_at),
      endAt: row.end_at?.value || String(row.end_at),
      carName: row.car_name,
      segment: row.segment,
      zoneName: row.zone_name,
      region1: row.region1,
      region2: row.region2,
      way: row.way,
      lat: row.lat,
      lng: row.lng,
      powerSource: row.power_source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("reservation error:", message);
    return NextResponse.json({ error: `조회 오류: ${message}` }, { status: 500 });
  }
}
