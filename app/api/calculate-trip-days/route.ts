import { NextRequest, NextResponse } from "next/server";

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 地球の半径（km）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function getPlaceCoords(place: Record<string, unknown>): { lat: number; lon: number } | null {
  const lat = toFiniteNumber(place.latitude ?? place.lat);
  const lon = toFiniteNumber(place.longitude ?? place.lon);

  if (lat === null || lon === null) return null;
  return { lat, lon };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { departCoords, classifiedPlaces } = body;

    if (!classifiedPlaces || !Array.isArray(classifiedPlaces)) {
      return NextResponse.json({ tripDays: 1, stayDays: 0 });
    }

    const places = classifiedPlaces.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null);

    // カテゴリ別カウント
    const visitCount = places.filter((p) => p.category === "visit").length;
    const hotelCount = places.filter((p) => p.category === "hotel").length;

    const departLat = toFiniteNumber(departCoords?.lat);
    const departLon = toFiniteNumber(departCoords?.lon);

    // 距離計算（出発地→各候補の最大距離）
    let maxDistance = 0;
    for (const place of places) {
      if (place.category === "visit" || place.category === "hotel") {
        if (departLat === null || departLon === null) continue;
        const coords = getPlaceCoords(place);
        if (!coords) continue;

        const distance = calculateDistance(departLat, departLon, coords.lat, coords.lon);
        maxDistance = Math.max(maxDistance, distance);
      }
    }

    // ルールベース計算
    let tripDays = 1;
    
    // hotelカードがあれば最低でもその数+1日
    if (hotelCount > 0) {
      tripDays = hotelCount + 1;
    }
    
    // visitカードの数で調整（3箇所以上で+1日）
    if (visitCount >= 3) {
      tripDays = Math.max(tripDays, Math.ceil(visitCount / 2));
    }
    
    // 距離で調整
    if (maxDistance > 300) {
      tripDays = Math.max(tripDays, 2);
    }
    if (maxDistance > 500) {
      tripDays = Math.max(tripDays, 3);
    }
    
    // 最大7日まで
    tripDays = Math.min(tripDays, 7);
    
    const stayDays = tripDays - 1;

    return NextResponse.json({ tripDays, stayDays });
  } catch (error) {
    console.error("Calculate trip days error:", error);
    return NextResponse.json({ tripDays: 1, stayDays: 0 });
  }
}
