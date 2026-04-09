import { NextResponse } from "next/server";
import { getBigQueryClient } from "@/lib/bigquery";
import { buildRegionsQuery } from "@/lib/queries";

export async function GET() {
  try {
    const bq = getBigQueryClient();
    const [rows] = await bq.query({ query: buildRegionsQuery() });

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
