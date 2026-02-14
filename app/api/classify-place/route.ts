import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { CLASSIFY_PLACE_SYSTEM_PROMPT, buildClassifyPlacePrompt } from "@/app/prompts/classify-place";

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function POST(req: NextRequest) {
  try {
    const { title, description, url } = await req.json();

    if (!openai) {
      return NextResponse.json({
        category: "visit",
        name: title || "",
        address: ""
      });
    }

    const prompt = CLASSIFY_PLACE_SYSTEM_PROMPT + "\n\n" + buildClassifyPlacePrompt({ title, description, url });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return NextResponse.json(result);
  } catch (error) {
    console.error("Classify error:", error);
    return NextResponse.json(
      { category: "visit", name: "", prefecture: "", address: "", pasted_url: null, corrected_url: null },
      { status: 200 }
    );
  }
}