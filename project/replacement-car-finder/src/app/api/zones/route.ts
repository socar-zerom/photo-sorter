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
