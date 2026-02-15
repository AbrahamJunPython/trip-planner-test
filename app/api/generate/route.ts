// app/api/generate/route.ts
import { NextResponse } from "next/server";
import { createLogger } from "@/app/lib/logger";

export const runtime = "nodejs";
const logger = createLogger("/api/generate");

/* =====================
 * utils
 ===================== */
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

// JSONでありがちな「末尾カンマ」を軽く除去（安全寄り）
function stripTrailingCommas(jsonText: string): string {
  // } や ] の直前の , を除去
  return jsonText.replace(/,\s*([}\]])/g, "$1");
}

function safeJsonParse(text: string) {
  const extracted = extractJson(text);
  const cleaned = stripTrailingCommas(extracted);
  return JSON.parse(cleaned);
}

function formatDestinationForPrompt(
  destination: unknown
):
  | { kind: "text"; text: string }
  | { kind: "ogp"; ogps: { title?: string; description?: string; url: string }[] } {
  if (isNonEmptyString(destination)) {
    return { kind: "text", text: destination.trim() };
  }

  if (Array.isArray(destination)) {
    const ogps = destination
      .map((x) => {
        const url = (x as any)?.url;
        if (!isNonEmptyString(url)) return null;

        const title = isNonEmptyString((x as any)?.title) ? (x as any).title.trim() : undefined;

        const description = isNonEmptyString((x as any)?.description)
          ? (x as any).description.trim()
          : undefined;

        return { title, description, url: url.trim() };
      })
      .filter(
        (v): v is { title: string | undefined; description: string | undefined; url: string } => Boolean(v)
      );

    if (ogps.length > 0) return { kind: "ogp", ogps };
  }

  return { kind: "text", text: "" };
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function clampInt(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.trunc(x);
}

/* =====================
 * skeleton builder
 ===================== */
type SkeletonStepType = "start" | "move" | "food" | "visit" | "hotel" | "end";

type SkeletonStep = {
  day: number;
  order: number;
  type: SkeletonStepType;
  label?: string;
  index?: number;
  mealSlot?: "lunchOrDinner";
  night?: number;
};

function buildSkeletonFromDays(tripDaysInput: unknown, stayDaysInput: unknown): SkeletonStep[] {
  const tripDays = Math.max(1, clampInt(tripDaysInput, 1));
  const stayDaysRaw = Math.max(0, clampInt(stayDaysInput, 0));
  const stayDays = Math.min(stayDaysRaw, Math.max(0, tripDays - 1));

  const steps: SkeletonStep[] = [];
  let globalVisit = 0;
  let globalNight = 0;

  for (let day = 1; day <= tripDays; day++) {
    let order = 1;

    if (day === 1) steps.push({ day, order: order++, type: "start", label: "出発地" });

    steps.push({ day, order: order++, type: "move" });
    steps.push({ day, order: order++, type: "food", mealSlot: "lunchOrDinner" });

    steps.push({ day, order: order++, type: "move" });
    globalVisit += 1;
    steps.push({ day, order: order++, type: "visit", index: globalVisit });

    const isLastDay = day === tripDays;
    const canStay = !isLastDay && globalNight < stayDays;

    if (canStay) {
      steps.push({ day, order: order++, type: "move" });
      globalNight += 1;
      steps.push({ day, order: order++, type: "hotel", night: globalNight, index: globalNight });
    } else {
      steps.push({ day, order: order++, type: "move" });
      steps.push({ day, order: order++, type: "end", label: "帰着地" });
    }
  }

  return steps;
}

function skeletonToPromptBlock(skel: SkeletonStep[]) {
  const byDay = new Map<number, SkeletonStep[]>();
  for (const s of skel) {
    const arr = byDay.get(s.day) ?? [];
    arr.push(s);
    byDay.set(s.day, arr);
  }

  const dayLines: string[] = [];
  for (const [day, arr] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const chain = arr
      .sort((a, b) => a.order - b.order)
      .map((x) => {
        if (x.type === "start") return "start";
        if (x.type === "end") return "end";
        if (x.type === "food") return "food";
        if (x.type === "visit") return `visit(${x.index ?? ""})`;
        if (x.type === "hotel") return `hotel(${x.night ?? ""})`;
        return "move";
      })
      .join("->");
    dayLines.push(`D${day}:${chain}`);
  }

  return dayLines.join("\n");
}

function buildOutlinePrompt(input: any) {
  const tripName = isNonEmptyString(input?.tripName) ? input.tripName.trim() : "新しい旅行";

  const departType = input?.depart?.type;
  const departValue = input?.depart?.value;

  const startDate = isNonEmptyString(input?.startDate) ? input.startDate.trim() : "";
  const endDate = isNonEmptyString(input?.endDate) ? input.endDate.trim() : null;

  const tripDays = safeNumber(input?.tripDays) || 1;
  const stayDays = safeNumber(input?.stayDays) || 0;

  const destination = formatDestinationForPrompt(input?.destination);

  const skeleton = buildSkeletonFromDays(tripDays, stayDays);
  const skeletonBlock = skeletonToPromptBlock(skeleton);

  const people = safeNumber(input?.people);
  const companion = isNonEmptyString(input?.companion) ? input.companion.trim() : null;
  const budget = isNonEmptyString(input?.budget) ? input.budget.trim() : null;
  const gender = isNonEmptyString(input?.gender) ? input.gender.trim() : null;
  const age = isNonEmptyString(input?.age) ? input.age.trim() : null;

  const departLabel =
    departType === "station"
      ? `最寄駅:${departValue}`
      : departType === "postal"
      ? `郵便番号:${departValue}`
      : `出発地:${departValue}`;

  const destinationBlock =
    destination.kind === "ogp"
      ? `OGP\n${destination.ogps
          .map((o, i) => `${i + 1}) t=${o.title ?? "null"} d=${o.description ?? "null"} url=${o.url}`)
          .join("\n")}`
      : `TEXT:${destination.text}`;

  const optionalLines: string[] = [];
  if (people !== null) optionalLines.push(`people=${people}`);
  if (companion) optionalLines.push(`companion=${companion}`);
  if (budget) optionalLines.push(`budget=${budget}`);
  if (gender) optionalLines.push(`gender=${gender}`);
  if (age) optionalLines.push(`age=${age}`);
  const optionalBlock = optionalLines.length ? optionalLines.join("\n") : "none";

  // ★ Phase1は「具体名禁止」「URL禁止」「雛形JSONで強制」＝壊れにくい＆速い
  return `
Return ONLY valid JSON. No markdown, no extra text.

# PHASE1 / OUTLINE (FAST)
- 施設名・店名・ホテル名は絶対に入れてほしい。
- url は必ず null（推測禁止）。
- skeleton順序は厳守。

# MUST
- 国内のみ。出発地は変更しない。
- 行き先は1つに確定（候補列挙しない）。
- tripDays>=3 なら、移動時間は60分以内なら他の都道府県に移動しても良い。
- title MUST NOT be empty for any item.
- If not decided, use placeholders like:
  move: "移動（未確定）"
  food: "食事（未確定）"
  hotel: "宿（未確定）"
  visit: "{エリア}散策"

# INPUT
tripName=${tripName}
depart=${departLabel}
destination=${destinationBlock}
startDate=${startDate}
endDate=${endDate ?? "null"}
tripDays=${tripDays}
stayDays=${stayDays}
optional=${optionalBlock}
skeleton:
${skeletonBlock}

# OUTPUT (valid JSON shape)
{
  "tripName": "${tripName}",
  "tripDays": ${tripDays},
  "stayDays": ${stayDays},
  "summary": "",
  "budgetPerPerson": 0,
  "days": [
    {
      "dayIndex": 1,
      "date": null,
      "title": null,
      "budgetPerPerson": 0,
      "items": [
        {
          "kind": "move",
          "title": "",
          "detail": null,
          "durationMin": null,
          "url": null,
          "time": null,
          "budgetPerPerson": 0
        }
      ]
    }
  ],
  "warnings": []
}
`.trim();
}

async function callOpenAIChat(apiKey: string, prompt: string, maxTokens: number) {
  logger.info("Generate OpenAI call started", {
    promptLength: prompt.length,
    maxTokens,
  });
  
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: 'Return ONLY valid JSON. No markdown. No code fences. Use double quotes. Start with "{" and end with "}".',
        },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    }),
  });

  const json = await r.json().catch(() => ({ error: { message: "Invalid JSON from OpenAI" } }));
  if (!r.ok) {
    const msg = json?.error?.message || `HTTP ${r.status}: ${r.statusText}`;
    logger.error("Generate OpenAI API error", new Error(msg), { status: r.status });
    throw new Error(msg);
  }

  const text = json?.choices?.[0]?.message?.content;
  if (!text) {
    logger.error("Generate OpenAI returned empty content");
    throw new Error("No content received from OpenAI");
  }

  try {
    const raw = extractJson(String(text));
    logger.info("Generate OpenAI response parsed", {
      rawLength: raw.length,
      responsePreview: raw.substring(0, 200),
    });
    const result = JSON.parse(raw);
    return result;
  } catch (parseError) {
    logger.error("Generate JSON parse failed", parseError as Error, {
      rawPreview: text.slice(0, 300),
    });
    const err: any = new Error(`Invalid JSON: ${parseError.message}`);
    err.rawOutput = text;   // ← ここ重要
    throw err;
  }
}

/* =====================
 * handler (PHASE1)
 ===================== */
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      logger.warn("Generate request invalid JSON");
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    logger.info("Generate request received", {
      tripName: body?.tripName ?? null,
      departType: body?.depart?.type ?? null,
      hasDestinationArray: Array.isArray(body?.destination),
      startDate: body?.startDate ?? null,
      tripDays: body?.tripDays ?? null,
      stayDays: body?.stayDays ?? null,
    });

    const departType = body?.depart?.type;
    const departValue = body?.depart?.value;
    if (!isNonEmptyString(departType) || !isNonEmptyString(departValue)) {
      logger.warn("Generate request rejected: missing depart", { departType, departValue });
      return NextResponse.json({ error: "depart.type と depart.value は必須です" }, { status: 400 });
    }

    const startDate = body?.startDate;
    if (!isNonEmptyString(startDate)) {
      logger.warn("Generate request rejected: missing startDate");
      return NextResponse.json({ error: "startDate は必須です" }, { status: 400 });
    }

    const destFormatted = formatDestinationForPrompt(body?.destination);
    const hasDest =
      (destFormatted.kind === "text" && isNonEmptyString(destFormatted.text)) ||
      (destFormatted.kind === "ogp" && destFormatted.ogps.length > 0);
    if (!hasDest) {
      logger.warn("Generate request rejected: missing destination");
      return NextResponse.json({ error: "destination は必須です（テキスト or OGP配列）" }, { status: 400 });
    }

    // ✅ MUST: env key only（直書き禁止）
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("OPENAI_API_KEY missing for generate endpoint");
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です（VercelのEnvironment Variablesに設定してください）" },
        { status: 500 }
      );
    }

    const prompt = buildOutlinePrompt(body);

    // Phase1は軽く
    const itinerary = await callOpenAIChat(apiKey, prompt, 900);

    if (!itinerary || typeof itinerary !== "object") {
      logger.warn("Generate returned non-object itinerary", { itineraryType: typeof itinerary });
      return NextResponse.json({ error: "AI returned non-object JSON", raw: itinerary }, { status: 500 });
    }
    if (!Array.isArray(itinerary.days)) itinerary.days = [];
    if (!Array.isArray(itinerary.warnings)) itinerary.warnings = [];

    itinerary._meta = { stage: "outline" };
    logger.info("Generate response generated", {
      duration: `${Date.now() - startTime}ms`,
      tripName: itinerary.tripName ?? null,
      dayCount: Array.isArray(itinerary.days) ? itinerary.days.length : 0,
      warningCount: Array.isArray(itinerary.warnings) ? itinerary.warnings.length : 0,
    });

    return NextResponse.json({ itinerary });
    } catch (e: any) {
      logger.error("Generate API error", e as Error, {
        duration: `${Date.now() - startTime}ms`,
      });

      // ★ 追加：OpenAIの生レスポンスをログに出す
      if (typeof e?.rawOutput === "string") {
        logger.warn("Generate OpenAI raw output preview", {
          rawOutputPreview: e.rawOutput.slice(0, 300),
        });
      }

      return NextResponse.json(
        {
          error: e?.message || "Internal server error",
          debug: process.env.NODE_ENV === "development" ? e?.rawOutput?.slice(0, 300) : undefined,
        },
        { status: 500 }
      );
    }
  }
