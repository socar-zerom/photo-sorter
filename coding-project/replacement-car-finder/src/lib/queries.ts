import { SearchParams } from "@/types";

export function buildRegionsQuery(): string {
  return `
    SELECT DISTINCT region1, region2
    FROM \`socar-data.tianjin_replica.carzone_info\`
    WHERE state = 1 AND region1 IS NOT NULL AND region2 IS NOT NULL
    ORDER BY region1, region2
  `;
}

export function buildZonesQuery(
  region1?: string,
  region2?: string,
  keyword?: string
): { query: string; params: Record<string, string> } {
  const conditions = ["state = 1"];
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

export function buildSearchQuery(params: SearchParams): {
  query: string;
  queryParams: Record<string, unknown>;
} {
  const queryParams: Record<string, unknown> = {
    req_start: params.startAt.replace("T", " ") + ":00",
    req_end: params.endAt.replace("T", " ") + ":00",
  };

  let locationFilter: string;

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

  // 전기차 여부
  const isEV = params.refPowerSource && ["EV", "PHEV", "HEV"].includes(params.refPowerSource);

  // 거리 계산 (차량 마지막 위치 기준)
  const hasRef = params.refLat != null && params.refLng != null;
  const distanceExpr = hasRef
    ? "ROUND(ST_DISTANCE(ST_GEOGPOINT(COALESCE(lp.last_lng, cz.lng), COALESCE(lp.last_lat, cz.lat)), ST_GEOGPOINT(@ref_lng, @ref_lat)) / 1000, 1)"
    : "NULL";
  if (hasRef) {
    queryParams.ref_lat = params.refLat;
    queryParams.ref_lng = params.refLng;
  }

  const segmentRankExpr = params.referenceSegment
    ? "ABS(IFNULL(ac.seg_rank, 99) - @ref_rank)"
    : "0";

  // 부호 있는 차급 차이 (양수 = 상위급, 음수 = 하위급)
  const segmentDiffExpr = params.referenceSegment
    ? "(IFNULL(ac.seg_rank, 99) - @ref_rank)"
    : "0";

  if (params.referenceSegment) {
    const rankMap: Record<string, number> = {
      A_SEGMENT: 1,
      B_SEGMENT: 2,
      C_SEGMENT: 3,
      D_SEGMENT: 4,
      E_SEGMENT: 5,
      F_SEGMENT: 6,
      S_SEGMENT: 7,
    };
    queryParams.ref_rank = rankMap[params.referenceSegment] ?? 0;
  }

  const AES_KEY = "c2595a5a2d181ae13c227fc2e2980d4d";

  const query = `
    CREATE TEMP FUNCTION aes_decrypt(base64_text STRING, key STRING) RETURNS STRING LANGUAGE js AS
    """return decrypt(base64_text, key)""" OPTIONS ( library="gs://socar-bq-udf/crypt.js" );

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
    occupied_cars AS (
      SELECT DISTINCT car_id
      FROM \`socar-data.socar_occupation.car_occupation\`
      WHERE state = 'CONFIRMED'
        AND start_at < TIMESTAMP(@req_end, 'Asia/Seoul')
        AND end_at > TIMESTAMP(@req_start, 'Asia/Seoul')
    ),
    last_position AS (
      SELECT car_id,
             SAFE_CAST(aes_decrypt(lat_enc, "${AES_KEY}") AS FLOAT64) AS last_lat,
             SAFE_CAST(aes_decrypt(lng_enc, "${AES_KEY}") AS FLOAT64) AS last_lng
      FROM (
        SELECT car_id, lat_enc, lng_enc,
               ROW_NUMBER() OVER (PARTITION BY car_id ORDER BY created_at DESC) AS rn
        FROM \`socar-data.log_replica.connect_info_compact\`
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
          AND gps_valid = 'GOOD'
          AND lat_enc IS NOT NULL AND lat_enc != ''
      )
      WHERE rn = 1
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
      ${segmentRankExpr} AS segmentDistance,
      ${segmentDiffExpr} AS segmentDiff,
      ${distanceExpr} AS distanceKm,
      'normal' AS resultType
    FROM active_cars ac
    JOIN \`socar-data.tianjin_replica.carzone_info\` cz ON ac.zone_id = cz.id
    LEFT JOIN occupied_cars oc ON ac.car_id = oc.car_id
    LEFT JOIN last_position lp ON ac.car_id = lp.car_id
    WHERE oc.car_id IS NULL
      AND cz.state = 1
      AND ${locationFilter}
      ${hasRef ? "AND " + distanceExpr + " <= 5" : ""}

    ${isEV ? `
    UNION ALL

    -- 전기차 보장 3대 (5km 제한 없이, 거리순)
    SELECT * FROM (
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
        ${segmentRankExpr} AS segmentDistance,
        ${segmentDiffExpr} AS segmentDiff,
        ${distanceExpr} AS distanceKm,
        'ev' AS resultType
      FROM active_cars ac
      JOIN \`socar-data.tianjin_replica.carzone_info\` cz ON ac.zone_id = cz.id
      LEFT JOIN occupied_cars oc ON ac.car_id = oc.car_id
      LEFT JOIN last_position lp ON ac.car_id = lp.car_id
      WHERE oc.car_id IS NULL
        AND cz.state = 1
        AND ac.power_source IN ('EV', 'PHEV', 'HEV')
        AND ${locationFilter.replace("cz.region2 = @region2", "cz.region1 = @region1")}
      ORDER BY distanceKm ASC
      LIMIT 3
    )
    ` : ""}

    ORDER BY resultType ASC, ${hasRef ? "distanceKm ASC," : ""} segmentDistance ASC, carName ASC
    LIMIT 200
  `;

  return { query, queryParams };
}

export function buildAvailabilityQuery(carIds: number[], startAt: string, endAt: string): {
  query: string;
  queryParams: Record<string, unknown>;
} {
  const queryParams: Record<string, unknown> = {
    window_start: startAt.replace("T", " ") + ":00",
    window_end: endAt.replace("T", " ") + ":00",
  };

  const carIdList = carIds.join(",");

  const query = `
    SELECT
      co.car_id AS carId,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M', co.start_at, 'Asia/Seoul') AS occStart,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M', co.end_at, 'Asia/Seoul') AS occEnd
    FROM \`socar-data.socar_occupation.car_occupation\` co
    WHERE co.car_id IN (${carIdList})
      AND co.state = 'CONFIRMED'
      AND co.start_at < TIMESTAMP_ADD(TIMESTAMP(@window_end, 'Asia/Seoul'), INTERVAL 4 HOUR)
      AND co.end_at > TIMESTAMP_ADD(TIMESTAMP(@window_start, 'Asia/Seoul'), INTERVAL -4 HOUR)
    ORDER BY co.car_id, co.start_at
  `;

  return { query, queryParams };
}
