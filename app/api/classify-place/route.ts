import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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

    const prompt = `以下の施設情報を分析して、カテゴリ(visit/food/hotel/move)と住所を抽出してください。

タイトル: ${title || ""}
説明: ${description || ""}
URL: ${url || ""}

JSON形式で返してください:
{
  "category": "visit" | "food" | "hotel" | "move",
  "name": "施設名",
  "address": "正確な番地までの住所"
}

カテゴリの判定基準:
- visit: 観光地、寺社、美術館、公園、テーマパーク等
- food: レストラン、カフェ、居酒屋等の飲食店
- hotel: ホテル、旅館、宿泊施設
- move: 駅、空港、バス停等の交通施設`;

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
      { category: "visit", name: "", address: "" },
      { status: 200 }
    );
  }
}
