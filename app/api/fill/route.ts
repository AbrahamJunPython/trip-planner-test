// app/api/fill/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function extractJson(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);

  return text.trim();
}

function stripTrailingCommas(jsonText: string): string {
  return jsonText.replace(/,\s*([}\]])/g, "$1");
}

function safeJsonParse(text: string) {
  const extracted = extractJson(String(text));
  const cleaned = stripTrailingCommas(extracted);
  return JSON.parse(cleaned);
}

type FillKind = "visit" | "food" | "hotel" | "move";

function buildFillPrompt(input: any) {
  const dayIndex = Number(input?.dayIndex);
  const kind = input?.kind as FillKind;
  const areaTitle = isNonEmptyString(input?.areaTitle) ? input.areaTitle.trim() : "";
  const departLabel = isNonEmptyString(input?.departLabel) ? input.departLabel.trim() : "";

  const outlineTitle = isNonEmptyString(input?.outlineTitle) ? input.outlineTitle.trim() : "";
  const prevTitle = isNonEmptyString(input?.prevTitle) ? input.prevTitle.trim() : null;
  const nextTitle = isNonEmptyString(input?.nextTitle) ? input.nextTitle.trim() : null;

  const destinationHint = isNonEmptyString(input?.destinationHint) ? input.destinationHint.trim() : "";
  const optional = isNonEmptyString(input?.optional) ? input.optional.trim() : "none";
  const previousVisits = isNonEmptyString(input?.previousVisits) ? input.previousVisits.trim() : null;
  
  const tripDays = Number(input?.tripDays) || 1;
  const isFinalday = dayIndex >= tripDays;

  const avoidanceRule = previousVisits 
    ? `
    # AVOIDANCE RULE (CRITICAL)
    過去の訪問地: ${previousVisits}は絶対に避けること。
        - 上記の場所と同じ名前や類似名は絶対に避ける
        - 部分致でも避ける（例：「清水寺」があれば「清水○○」も避ける）
        - 完全に異なる場所を選ぶ
        
    - You MUST stay within this area: ${areaTitle}

    - If this is the FINAL DAY of the trip:
        - All places MUST be on the natural return route toward the departure area.
        - DO NOT travel to a far city or different region for sightseeing/food/hotel.
        - Never detour to major distant cities (e.g., Tokyo/Chiba/Osaka) unless it is the final return destination itself.
        - Prefer places within the same area or directly on the way back.
        - If your first attempt violates the geo rules above, you MUST choose a different place.
    `
    : "";

  return `
Return ONLY valid JSON. No markdown, no extra text.

# PHASE2 / FILL ONE ITEM (RICH TITLE)
You must output a SPECIFIC proper noun for this one item.
- title MUST NOT be empty.
- title should look "rich" and informative (12-28 Japanese chars is OK).
- Choose ONE definitive name (no alternatives).
- If official URL is not confidently known, url=null (do NOT guess).
- detail: max 2 sentences in Japanese.
- budgetPerPerson: integer. durationMin: null ok.${avoidanceRule}

# Context
dayIndex=${dayIndex}
kind=${kind}
depart=${departLabel}
area=${areaTitle}
destinationHint=${destinationHint}
optional=${optional}
outlineTitle=${outlineTitle}
prevTitle=${prevTitle ?? "null"}
nextTitle=${nextTitle ?? "null"}

# Title rules (VERY IMPORTANT)
- title MUST NOT be empty.
- Make title "rich": include (1)固有名詞 + (2)名物/ジャンル/特徴.
- 最初の目的地からは移動製薬を設ける。
    - 1日目から2日目は60km圏内の移動可能。
    - 3日目から4日目は120km圏内の移動可能。
    - 5日目以降は200km圏内の移動可能。
- destinationHintやoptionalを参考にfood/visitのタイトルを具体化する。(departLabelは無視)
- food title format:
  "店名（名物/ジャンル）" 例: "鳥喜多（親子丼）" / "ひさご亭（鰻）"
- visit title format:
  "施設名（見どころ）" 例: "松山城（天守）" / "浅草寺（雷門）"
- hotel title format:
  "宿名（温泉/眺望/格）" 例: "道後館（温泉）" / "○○ホテル（夜景）"
- move title format:
  "A→B（手段）"（A=prevTitle, B=nextTitleを優先）
    - 次の目的地まで350km以上はすべて飛行機
    - 次の目的地まで60km以上は高速バス/新幹線/特急/レンタカー
    - 次の目的地まで20km以上は在来線/普通列車/バス
    - 次の目的地まで20km未満は徒歩/自転車/タクシー
# Detail rules
- food: ジャンル + 予約可否 + 混雑 + "滞在60分"
- visit: 見どころ + 営業時間/混雑ひとこと
- hotel: ランク感 + 特徴
- move: 手段 + 所要（durationMinはMUST）
    - 次の目的地まで350km以上はすべて飛行機
    - 次の目的地まで60km以上は高速バス/新幹線/特急/レンタカー
    - 次の目的地まで20km以上は在来線/普通列車/バス
    - 次の目的地まで20km未満は徒歩/自転車/タクシー

# OUTPUT (valid JSON)
{
  "kind": "${kind}",
  "title": "",
  "detail": null,
  "durationMin": null,
  "url": null,
  "time": null,
  "budgetPerPerson": 0
}
`.trim();
}

async function callOpenAIChat(apiKey: string, prompt: string, maxTokens: number) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      // ★これが本命：JSONを強制
      response_format: { type: "json_object" },

      messages: [
        {
          role: "system",
          content:
            'Return ONLY valid JSON. No markdown. No code fences. Use double quotes. Start with "{" and end with "}".',
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  });

  const json = await r.json().catch(() => ({ error: { message: "Invalid JSON from OpenAI" } }));
  if (!r.ok) {
    const msg = json?.error?.message || `HTTP ${r.status}: ${r.statusText}`;
    throw new Error(msg);
  }

  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No content received from OpenAI");

  // response_format が効いていれば text は JSON 文字列のはず
  // 念のため extractJson を通す
  const raw = extractJson(String(text));
  return JSON.parse(raw);
}

/* =====================
 * handler (PHASE2)
 ===================== */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const kind = body?.kind;
    if (!["visit", "food", "hotel", "move"].includes(kind)) {
      return NextResponse.json({ error: "kind must be one of visit|food|hotel|move" }, { status: 400 });
    }

    if (!isNonEmptyString(body?.areaTitle)) {
      return NextResponse.json({ error: "areaTitle is required (phase1 day/title etc.)" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です（VercelのEnvironment Variablesに設定してください）" },
        { status: 500 }
      );
    }

    const prompt = buildFillPrompt(body);

    const filledItem = await callOpenAIChat(apiKey, prompt, 420);

    if (!filledItem || typeof filledItem !== "object") {
      return NextResponse.json({ error: "AI returned non-object JSON", raw: filledItem }, { status: 500 });
    }

    // 最低限の正規化（空でも落とさない）
    if (!isNonEmptyString(filledItem.title)) filledItem.title = body?.outlineTitle || "未設定";
    if (typeof filledItem.budgetPerPerson !== "number") filledItem.budgetPerPerson = 0;
    if (!("url" in filledItem)) filledItem.url = null;
    if (!("time" in filledItem)) filledItem.time = null;

    return NextResponse.json({ item: filledItem });
    } catch (e: any) {
      console.error("API Error:", e);
      return NextResponse.json(
        { error: e?.message || "Internal server error", hint: "Check OpenAI raw output in logs." },
        { status: 500 }
      );
    }
  }
