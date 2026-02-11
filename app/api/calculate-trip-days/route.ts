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

export async function POST(req: NextRequest) {
  try {
    const { departCoords, classifiedPlaces } = await req.json();

    if (!departCoords || !classifiedPlaces) {
      return NextResponse.json({ tripDays: 1, stayDays: 0 });
    }

    // カテゴリ別カウント
    const visitCount = classifiedPlaces.filter((p: any) => p.category === "visit").length;
    const hotelCount = classifiedPlaces.filter((p: any) => p.category === "hotel").length;
    
    // 距離計算（出発地から最初の目的地まで）
    let maxDistance = 0;
    for (const place of classifiedPlaces) {
      if (place.category === "visit" || place.category === "hotel") {
        // 住所から緯度経度を取得（簡易版：ここでは仮の計算）
        // 実際にはgeocoding APIを使用
        const distance = Math.random() * 500; // 仮の距離
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
