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
  segmentDiff: number;
  distanceKm: number | null;
  resultType: string;
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
  startAt: string;
  endAt: string;
  referenceSegment?: string;
  refLat?: number;
  refLng?: number;
  refPowerSource?: string;
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
