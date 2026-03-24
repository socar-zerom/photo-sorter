"use client";

import { useState, useEffect, useCallback } from "react";
import { CarResult, Region, Zone, SEGMENT_LABELS } from "@/types";

const SEGMENTS = Object.entries(SEGMENT_LABELS);
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES_10 = [0, 10, 20, 30, 40, 50];

type OccBlock = { occStart: string; occEnd: string };
type AvailabilityMap = Record<number, OccBlock[]>;

function segmentBadge(distance: number, diff: number): { label: string; color: string } {
  if (distance === 0) return { label: "동급", color: "bg-green-100 text-green-800" };
  if (diff > 0) return { label: `+${distance}급`, color: "bg-blue-100 text-blue-800" };
  return { label: `-${distance}급`, color: "bg-orange-100 text-orange-800" };
}

function formatPowerSource(ps: string): string {
  const map: Record<string, string> = {
    GASOLINE: "가솔린", DIESEL: "디젤", LPG: "LPG",
    HEV: "하이브리드", PHEV: "플러그인HEV", EV: "전기",
  };
  return map[ps] || ps;
}

function formatWay(way: string): string {
  const map: Record<string, string> = {
    round: "왕복",
    d2d_round: "부름왕복",
    d2d_oneway: "부름편도",
    d2d_rev: "부름",
    z2d_oneway: "존편도",
  };
  return map[way] || way;
}

function formatBodyType(bt: string): string {
  const map: Record<string, string> = {
    SEDAN: "세단", SUV: "SUV", HATCHBACK: "해치백",
    MPV: "승합", CONVERTIBLE: "컨버터블", RV: "RV",
  };
  return map[bt] || bt;
}

function to24h(hour12: number, ampm: "AM" | "PM"): number {
  if (ampm === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function to12h(hour24: number): { hour: number; ampm: "AM" | "PM" } {
  if (hour24 === 0) return { hour: 12, ampm: "AM" };
  if (hour24 < 12) return { hour: hour24, ampm: "AM" };
  if (hour24 === 12) return { hour: 12, ampm: "PM" };
  return { hour: hour24 - 12, ampm: "PM" };
}

function roundMinute(m: number): number {
  return Math.round(m / 10) * 10 >= 60 ? 50 : Math.round(m / 10) * 10;
}

function buildDatetime(date: string, hour12: number, minute: number, ampm: "AM" | "PM"): string {
  if (!date) return "";
  const h = to24h(hour12, ampm);
  return `${date}T${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatHM(dt: Date): string {
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function calcFreeWindow(
  windowStart: Date, windowEnd: Date, reqStart: Date, reqEnd: Date, blocks: OccBlock[]
): { freeFrom: Date; freeUntil: Date } {
  let freeFrom = windowStart;
  let freeUntil = windowEnd;

  for (const b of blocks) {
    const bEnd = new Date(b.occEnd);
    const bStart = new Date(b.occStart);
    if (bEnd <= reqStart && bEnd > freeFrom) freeFrom = bEnd;
    if (bStart >= reqEnd && bStart < freeUntil) freeUntil = bStart;
  }

  return { freeFrom, freeUntil };
}

function formatDateTime(dt: Date): string {
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const h = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${m}/${d} ${h}:${min}`;
}

function FreeWindow({
  windowStart, windowEnd, reqStart, reqEnd, blocks,
}: {
  windowStart: Date; windowEnd: Date; reqStart: Date; reqEnd: Date; blocks: OccBlock[];
}) {
  const { freeFrom, freeUntil } = calcFreeWindow(windowStart, windowEnd, reqStart, reqEnd, blocks);
  return (
    <div className="text-xs text-gray-700">
      <span className="text-green-700 font-medium">{formatDateTime(freeFrom)}</span>
      <span className="text-gray-400 mx-1">~</span>
      <span className="text-green-700 font-medium">{formatDateTime(freeUntil)}</span>
    </div>
  );
}

const selectClass = "border border-gray-300 rounded-md px-2 py-2 text-sm";

function TimePicker({
  label, date, hour, minute, ampm,
  onDateChange, onHourChange, onMinuteChange, onAmpmChange,
}: {
  label: string; date: string; hour: number; minute: number; ampm: "AM" | "PM";
  onDateChange: (v: string) => void; onHourChange: (v: number) => void;
  onMinuteChange: (v: number) => void; onAmpmChange: (v: "AM" | "PM") => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input type="date" className={`${selectClass} w-36`} value={date} onChange={(e) => onDateChange(e.target.value)} />
        <select className={`${selectClass} w-16`} value={ampm} onChange={(e) => onAmpmChange(e.target.value as "AM" | "PM")}>
          <option value="AM">오전</option>
          <option value="PM">오후</option>
        </select>
        <select className={`${selectClass} w-16`} value={hour} onChange={(e) => onHourChange(Number(e.target.value))}>
          {HOURS_12.map((h) => (<option key={h} value={h}>{h}시</option>))}
        </select>
        <select className={`${selectClass} w-18`} value={minute} onChange={(e) => onMinuteChange(Number(e.target.value))}>
          {MINUTES_10.map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}분</option>))}
        </select>
      </div>
    </div>
  );
}

export default function Home() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [region1, setRegion1] = useState("");
  const [region2, setRegion2] = useState("");

  const [zoneMode, setZoneMode] = useState(false);
  const [zoneSearch, setZoneSearch] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [zonesLoading, setZonesLoading] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [startHour, setStartHour] = useState(1);
  const [startMinute, setStartMinute] = useState(0);
  const [startAmpm, setStartAmpm] = useState<"AM" | "PM">("AM");

  const [endDate, setEndDate] = useState("");
  const [endHour, setEndHour] = useState(1);
  const [endMinute, setEndMinute] = useState(0);
  const [endAmpm, setEndAmpm] = useState<"AM" | "PM">("PM");

  const [referenceSegment, setReferenceSegment] = useState("");

  const [reservationId, setReservationId] = useState("");
  const [reservationLoading, setReservationLoading] = useState(false);
  const [reservationInfo, setReservationInfo] = useState("");
  const [refLat, setRefLat] = useState<number | null>(null);
  const [refLng, setRefLng] = useState<number | null>(null);
  const [refPowerSource, setRefPowerSource] = useState<string>("");

  const [results, setResults] = useState<CarResult[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 가용 시간대 데이터
  const [availability, setAvailability] = useState<AvailabilityMap>({});
  const [searchedStartAt, setSearchedStartAt] = useState("");
  const [searchedEndAt, setSearchedEndAt] = useState("");

  useEffect(() => {
    fetch("/api/regions").then((r) => r.json()).then((data) => setRegions(data)).catch(() => {});
  }, []);

  const searchZones = useCallback(async (q: string, r1: string, r2: string) => {
    if (!q && !r1) return;
    setZonesLoading(true);
    try {
      const params = new URLSearchParams();
      if (r1) params.set("region1", r1);
      if (r2) params.set("region2", r2);
      if (q) params.set("q", q);
      const res = await fetch(`/api/zones?${params}`);
      setZones(await res.json());
    } catch { setZones([]); }
    finally { setZonesLoading(false); }
  }, []);

  useEffect(() => {
    if (!zoneMode) return;
    const timer = setTimeout(() => searchZones(zoneSearch, region1, region2), 300);
    return () => clearTimeout(timer);
  }, [zoneSearch, region1, region2, zoneMode, searchZones]);

  const region2List = regions.find((r) => r.region1 === region1)?.region2List || [];

  async function handleReservationLookup() {
    if (!reservationId.trim()) return;
    setReservationLoading(true);
    setReservationInfo("");
    setError("");
    try {
      const res = await fetch(`/api/reservation?id=${reservationId.trim()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const startDt = new Date(data.startAt);
      const endDt = new Date(data.endAt);

      setStartDate(startDt.toISOString().slice(0, 10));
      const s12 = to12h(startDt.getHours());
      setStartHour(s12.hour); setStartMinute(roundMinute(startDt.getMinutes())); setStartAmpm(s12.ampm);

      setEndDate(endDt.toISOString().slice(0, 10));
      const e12 = to12h(endDt.getHours());
      setEndHour(e12.hour); setEndMinute(roundMinute(endDt.getMinutes())); setEndAmpm(e12.ampm);

      if (data.region1) setRegion1(data.region1);
      if (data.region2) setRegion2(data.region2);
      if (data.segment) setReferenceSegment(data.segment);
      if (data.lat != null && data.lng != null) { setRefLat(data.lat); setRefLng(data.lng); }
      if (data.powerSource) setRefPowerSource(data.powerSource);

      setReservationInfo(
        `${data.way ? formatWay(data.way) : ""} | ${data.carName || "차종 미상"} | ${data.zoneName || "존 미상"} | ${startDt.toLocaleString("ko-KR")} ~ ${endDt.toLocaleString("ko-KR")}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "예약 조회 실패");
    } finally { setReservationLoading(false); }
  }

  // 가용 시간대 로딩
  async function fetchAvailability(carIds: number[], startAt: string, endAt: string) {
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carIds, startAt, endAt }),
      });
      if (res.ok) {
        setAvailability(await res.json());
      }
    } catch { /* 실패해도 검색 결과는 유지 */ }
  }

  async function handleSearch() {
    setError("");
    setResults([]);
    setCount(null);
    setAvailability({});

    const startAt = buildDatetime(startDate, startHour, startMinute, startAmpm);
    const endAt = buildDatetime(endDate, endHour, endMinute, endAmpm);

    if (!startAt || !endAt) { setError("날짜와 시간을 모두 입력해주세요"); return; }
    if (!zoneMode && !region1) { setError("지역을 선택해주세요"); return; }
    if (zoneMode && !selectedZone) { setError("존을 선택해주세요"); return; }

    setLoading(true);
    setSearchedStartAt(startAt);
    setSearchedEndAt(endAt);
    try {
      const body: Record<string, unknown> = { startAt, endAt };
      if (zoneMode && selectedZone) { body.zoneId = selectedZone.id; }
      else { body.region1 = region1; if (region2) body.region2 = region2; }
      if (referenceSegment) body.referenceSegment = referenceSegment;
      if (refLat != null && refLng != null) { body.refLat = refLat; body.refLng = refLng; }
      if (refPowerSource) body.refPowerSource = refPowerSource;

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "검색 실패"); }

      const data = await res.json();
      // 중복 제거 (EV 보장 차량이 5km 이내 결과와 겹칠 수 있음)
      const seen = new Set<number>();
      const deduped = (data.results as CarResult[]).filter((r) => {
        if (seen.has(r.carId)) return false;
        seen.add(r.carId);
        return true;
      });
      setResults(deduped);
      setCount(deduped.length);

      // 검색 결과 있으면 가용 시간대 비동기 로딩
      if (data.results.length > 0) {
        const carIds = data.results.map((r: CarResult) => r.carId);
        fetchAvailability(carIds, startAt, endAt);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색 중 오류 발생");
    } finally { setLoading(false); }
  }

  // 타임라인 윈도우 계산 (±4시간)
  const windowStart = searchedStartAt ? new Date(new Date(searchedStartAt).getTime() - 4 * 3600000) : null;
  const windowEnd = searchedEndAt ? new Date(new Date(searchedEndAt).getTime() + 4 * 3600000) : null;
  const reqStartDt = searchedStartAt ? new Date(searchedStartAt) : null;
  const reqEndDt = searchedEndAt ? new Date(searchedEndAt) : null;

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">대차 차량 검색</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        {/* Reservation lookup */}
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">예약번호로 자동 입력</label>
          <div className="flex items-center gap-2">
            <input type="text" className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48"
              placeholder="예약번호 입력" value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReservationLookup()} />
            <button className="bg-amber-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-amber-700 disabled:bg-gray-400"
              onClick={handleReservationLookup} disabled={reservationLoading}>
              {reservationLoading ? "조회 중..." : "조회"}
            </button>
          </div>
          {reservationInfo && <p className="mt-2 text-sm text-amber-800">{reservationInfo}</p>}
        </div>

        {/* Region */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시/도</label>
              <select className={`${selectClass} w-40`} value={region1}
                onChange={(e) => { setRegion1(e.target.value); setRegion2(""); setSelectedZone(null); }}>
                <option value="">선택</option>
                {regions.map((r) => (<option key={r.region1} value={r.region1}>{r.region1}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">구/군</label>
              <select className={`${selectClass} w-32`} value={region2}
                onChange={(e) => { setRegion2(e.target.value); setSelectedZone(null); }} disabled={!region1}>
                <option value="">전체</option>
                {region2List.map((r2) => (<option key={r2} value={r2}>{r2}</option>))}
              </select>
            </div>
          </div>
        </div>

        {/* Time pickers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <TimePicker label="시작 일시" date={startDate} hour={startHour} minute={startMinute} ampm={startAmpm}
            onDateChange={setStartDate} onHourChange={setStartHour} onMinuteChange={setStartMinute} onAmpmChange={setStartAmpm} />
          <TimePicker label="종료 일시" date={endDate} hour={endHour} minute={endMinute} ampm={endAmpm}
            onDateChange={setEndDate} onHourChange={setEndHour} onMinuteChange={setEndMinute} onAmpmChange={setEndAmpm} />
        </div>

        {/* Segment + Zone toggle */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">참고 차급 (정렬 기준)</label>
            <select className={selectClass} value={referenceSegment} onChange={(e) => setReferenceSegment(e.target.value)}>
              <option value="">선택 안 함</option>
              {SEGMENTS.map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="zoneMode" checked={zoneMode}
              onChange={(e) => { setZoneMode(e.target.checked); setSelectedZone(null); }} className="rounded" />
            <label htmlFor="zoneMode" className="text-sm text-gray-700">특정 존 검색</label>
          </div>
        </div>

        {/* Zone search */}
        {zoneMode && (
          <div className="mb-4 p-4 bg-blue-50 rounded-md">
            <label className="block text-sm font-medium text-gray-700 mb-1">존 이름 검색</label>
            <input type="text" className="w-full md:w-96 border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
              placeholder="존 이름 또는 주소 검색..." value={zoneSearch}
              onChange={(e) => { setZoneSearch(e.target.value); setSelectedZone(null); }} />
            {selectedZone && (
              <div className="text-sm text-blue-800 font-medium mb-2">
                선택: {selectedZone.name} ({selectedZone.address})
                <button className="ml-2 text-red-500 hover:text-red-700" onClick={() => setSelectedZone(null)}>취소</button>
              </div>
            )}
            {zonesLoading && <p className="text-sm text-gray-500">검색 중...</p>}
            {!zonesLoading && zones.length > 0 && !selectedZone && (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded bg-white">
                {zones.map((z) => (
                  <button key={z.id} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-100 border-b border-gray-100"
                    onClick={() => { setSelectedZone(z); setZones([]); }}>
                    <span className="font-medium">{z.name}</span>
                    <span className="text-gray-500 ml-2">{z.address}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button className="bg-blue-600 text-white px-6 py-2 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          onClick={handleSearch} disabled={loading}>
          {loading ? "검색 중..." : "검색"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Results */}
      {count !== null && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">
              검색 결과: {count}대 (5km 이내)
            </span>
          </div>

          {results.length === 0 ? (
            <div className="p-12 text-center text-gray-500">가용한 차량이 없습니다</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {refLat != null && <th className="px-4 py-3 text-right">거리</th>}
                    {referenceSegment && <th className="px-4 py-3 text-left">유사도</th>}
                    <th className="px-4 py-3 text-left">차종</th>
                    <th className="px-4 py-3 text-left">번호판</th>
                    <th className="px-4 py-3 text-left">차급</th>
                    <th className="px-4 py-3 text-left">차체</th>
                    <th className="px-4 py-3 text-center">인원</th>
                    <th className="px-4 py-3 text-left">연료</th>
                    <th className="px-4 py-3 text-left">쏘카존</th>
                    <th className="px-4 py-3 text-left">가용 시간대</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((car) => {
                    const badge = segmentBadge(car.segmentDistance, car.segmentDiff);
                    const blocks = availability[car.carId] || [];
                    return (
                      <tr key={car.carId} className="hover:bg-gray-50">
                        {refLat != null && (
                          <td className="px-4 py-3 text-right font-mono text-gray-700">
                            {car.distanceKm != null ? `${car.distanceKm}km` : "-"}
                          </td>
                        )}
                        {referenceSegment && (
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
                              {badge.label}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium text-gray-900">{car.carName}</td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{car.carNum}</td>
                        <td className="px-4 py-3 text-gray-600">{SEGMENT_LABELS[car.segment] || car.segment}</td>
                        <td className="px-4 py-3 text-gray-600">{formatBodyType(car.bodyType)}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{car.capacity}</td>
                        <td className="px-4 py-3 text-gray-600">{formatPowerSource(car.powerSource)}</td>
                        <td className="px-4 py-3 text-gray-700">{car.zoneName}</td>
                        <td className="px-4 py-2">
                          {windowStart && windowEnd && reqStartDt && reqEndDt ? (
                            <FreeWindow
                              windowStart={windowStart}
                              windowEnd={windowEnd}
                              reqStart={reqStartDt}
                              reqEnd={reqEndDt}
                              blocks={blocks}
                            />
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
