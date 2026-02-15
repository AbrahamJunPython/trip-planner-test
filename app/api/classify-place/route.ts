import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { CLASSIFY_PLACE_SYSTEM_PROMPT, buildClassifyPlacePrompt } from "@/app/prompts/classify-place";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/api/classify-place");

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const { title, description, url } = await req.json();
    logger.info("Classify request received", {
      hasTitle: Boolean(title),
      hasDescription: Boolean(description),
      url,
    });

    if (!openai) {
      const fallback = {
        category: "visit",
        name: title || "",
        address: ""
      };
      logger.warn("OpenAI key missing, returning fallback classify result", {
        duration: `${Date.now() - startTime}ms`,
        result: fallback,
      });
      return NextResponse.json(fallback);
    }

    const prompt = CLASSIFY_PLACE_SYSTEM_PROMPT + "\n\n" + buildClassifyPlacePrompt({ title, description, url });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    logger.info("Classify response generated", {
      duration: `${Date.now() - startTime}ms`,
      result,
    });
    return NextResponse.json(result);
  } catch (error) {
    const fallback = { category: "visit", name: "", prefecture: "", address: "", pasted_url: null, corrected_url: null };
    logger.error("Classify error", error as Error, {
      duration: `${Date.now() - startTime}ms`,
      fallback,
    });
    return NextResponse.json(
      fallback,
      { status: 200 }
    );
  }
}
