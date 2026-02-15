import { NextRequest } from "next/server";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/api/generate-stream");

// Preset templates for common destinations
const PRESET_TEMPLATES = {
  "京都": {
    summary: "古都京都の王道観光コース。清水寺、金閣寺などの定番スポットを効率よく巡ります。",
    baseItems: {
      visit: ["清水寺", "金閣寺", "伏見稲荷大社", "嵐山"],
      food: ["湯豆腐", "京懐石", "抹茶スイーツ"],
      hotel: ["京都駅周辺ホテル", "祇園エリア旅館"]
    }
  },
  "大阪": {
    summary: "食い倒れの街大阪を満喫。たこ焼き、お好み焼きなどのグルメと観光を楽しみます。",
    baseItems: {
      visit: ["大阪城", "道頓堀", "通天閣", "ユニバーサルスタジオ"],
      food: ["たこ焼き", "お好み焼き", "串カツ"],
      hotel: ["梅田エリアホテル", "難波エリアホテル"]
    }
  },
  "東京": {
    summary: "首都東京の多彩な魅力を体験。伝統とモダンが融合した観光スポットを巡ります。",
    baseItems: {
      visit: ["浅草寺", "東京スカイツリー", "明治神宮", "渋谷"],
      food: ["寿司", "ラーメン", "もんじゃ焼き"],
      hotel: ["新宿エリアホテル", "銀座エリアホテル"]
    }
  }
};

function detectDestination(input: any): string | null {
  const destText = typeof input.destination === 'string' ? input.destination : '';
  const ogpTitles = Array.isArray(input.destination) 
    ? input.destination.map((d: any) => d.title || '').join(' ')
    : '';
  
  const searchText = (destText + ' ' + ogpTitles).toLowerCase();
  
  for (const [key] of Object.entries(PRESET_TEMPLATES)) {
    if (searchText.includes(key.toLowerCase())) {
      return key;
    }
  }
  return null;
}

async function generateWithPreset(input: any, preset: any): Promise<any> {
  const tripDays = input.tripDays || 1;
  const stayDays = input.stayDays || 0;
  
  // Generate days in parallel
  const dayPromises = Array.from({ length: tripDays }, async (_, i) => {
    const dayIndex = i + 1;
    const isLastDay = dayIndex === tripDays;
    
    return {
      dayIndex,
      date: null,
      title: preset.baseItems.visit[i % preset.baseItems.visit.length],
      budgetPerPerson: dayIndex === 1 ? 8000 : 6000,
      items: [
        {
          kind: "move",
          title: `${preset.baseItems.visit[i % preset.baseItems.visit.length]}へ電車で移動`,
          detail: "電車で約30分、混雑時間を避けて移動",
          durationMin: 30,
          url: null,
          time: { start: "09:00", end: "09:30" },
          budgetPerPerson: 500
        },
        {
          kind: "visit",
          title: preset.baseItems.visit[i % preset.baseItems.visit.length],
          detail: "約2時間の観光、写真撮影スポット多数",
          durationMin: 120,
          url: null,
          time: { start: "09:30", end: "11:30" },
          budgetPerPerson: 1000
        },
        {
          kind: "food",
          title: `${preset.baseItems.food[i % preset.baseItems.food.length]}で食事`,
          detail: "地元の名店、予約不要、60分滞在",
          durationMin: 60,
          url: null,
          time: { start: "12:00", end: "13:00" },
          budgetPerPerson: 2000
        },
        ...(!isLastDay ? [{
          kind: "hotel",
          title: `${preset.baseItems.hotel[i % preset.baseItems.hotel.length]}に宿泊`,
          detail: "駅近の便利なホテル、朝食付き",
          durationMin: null,
          url: null,
          time: null,
          budgetPerPerson: dayIndex === 1 ? 4500 : 2500
        }] : [])
      ]
    };
  });
  
  const days = await Promise.all(dayPromises);
  const totalBudget = days.reduce((sum, day) => sum + (day.budgetPerPerson || 0), 0);
  
  return {
    tripName: input.tripName || "新しい旅行",
    tripDays,
    stayDays,
    summary: preset.summary,
    budgetPerPerson: totalBudget,
    days,
    warnings: ["飲食店が混雑している場合は、近隣の類似店舗をご利用ください。"]
  };
}

export const runtime = "nodejs";

async function callAwsLambdaGenerate(body: unknown): Promise<Response | null> {
  const lambdaUrl = process.env.AWS_LAMBDA_GENERATE_URL;
  if (!lambdaUrl) return null;

  const accessKey = process.env.AWS_S3_ACCESS_KEY;
  const secret = process.env.AWS_S3_SECRET;
  if (!accessKey || !secret) {
    throw new Error("AWS Lambda auth env vars are missing");
  }

  return fetch(lambdaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-aws-access-key": accessKey,
      "x-aws-secret": secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    logger.info("Generate-stream request received", {
      tripName: body?.tripName ?? null,
      hasDestinationArray: Array.isArray(body?.destination),
      tripDays: body?.tripDays ?? null,
      stayDays: body?.stayDays ?? null,
    });

    const detectedDest = detectDestination(body);
    if (detectedDest && PRESET_TEMPLATES[detectedDest as keyof typeof PRESET_TEMPLATES]) {
      const preset = PRESET_TEMPLATES[detectedDest as keyof typeof PRESET_TEMPLATES];
      const result = await generateWithPreset(body, preset);
      logger.info("Generate-stream preset matched", {
        duration: `${Date.now() - startTime}ms`,
        detectedDest,
        tripDays: result.tripDays,
        stayDays: result.stayDays,
      });

      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          // SSEのdata行として返す（クライアントが同じロジックで読める）
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ itinerary: result })}\n\n`));
          controller.enqueue(enc.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        },
      });
    }

    // fallback（/api/generate がSSEならそのまま中継）
        // AWS Lambda route (if configured)
    if (process.env.AWS_LAMBDA_GENERATE_URL) {
      logger.info("Generate-stream trying AWS Lambda", {
        detectedDest,
        duration: `${Date.now() - startTime}ms`,
      });

      try {
        const lambdaRes = await callAwsLambdaGenerate(body);
        if (lambdaRes && lambdaRes.ok) {
          const contentType = lambdaRes.headers.get("content-type") ?? "application/json; charset=utf-8";
          logger.info("Generate-stream AWS Lambda success", {
            status: lambdaRes.status,
            contentType,
            duration: `${Date.now() - startTime}ms`,
          });

          return new Response(lambdaRes.body, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-store",
            },
          });
        }

        const lambdaErrorBody = lambdaRes ? await lambdaRes.text() : "";
        logger.warn("Generate-stream AWS Lambda returned error", {
          status: lambdaRes?.status ?? null,
          bodyPreview: lambdaErrorBody.slice(0, 200),
          duration: `${Date.now() - startTime}ms`,
        });
      } catch (lambdaError) {
        logger.error("Generate-stream AWS Lambda call failed", lambdaError as Error, {
          duration: `${Date.now() - startTime}ms`,
        });
      }
    }

    // fallback (local /api/generate)
    logger.info("Generate-stream fallback to local /api/generate", {
      detectedDest,
      duration: `${Date.now() - startTime}ms`,
    });
    const upstream = await fetch(new URL("/api/generate", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // upstreamのエラーを握りつぶさない（重要）
    if (!upstream.ok) {
      const t = await upstream.text();
      logger.warn("Generate-stream upstream returned error", {
        status: upstream.status,
        duration: `${Date.now() - startTime}ms`,
        bodyPreview: t.slice(0, 200),
      });
      return new Response(t, { status: upstream.status, headers: { "Content-Type": "application/json" } });
    }

    logger.info("Generate-stream upstream success", {
      status: upstream.status,
      contentType: upstream.headers.get("content-type"),
      duration: `${Date.now() - startTime}ms`,
    });

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("Generate-stream failed", error as Error, {
      duration: `${Date.now() - startTime}ms`,
    });
    return Response.json({ error: "Generation failed" }, { status: 500 });
  }
}
