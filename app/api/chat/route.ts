import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { place, context } = await req.json();

    const categoryName = place.category === "hotel" ? "宿泊施設" : place.category === "visit" ? "観光地" : place.category === "food" ? "飲食店" : "移動手段";

    const systemPrompt = `あなたは旅行施設の情報を確認するアシスタントです。
ユーザーが追加した施設について、以下の情報を簡潔に提供してください：

1. 施設名の確認
2. 施設の特徴や魅力を80字以内で説明

出力形式：
施設名: [正式名称]
説明: [80字以内の説明文]

簡潔で分かりやすく、旅行者目線で書いてください。かわいい口語体でお願いします。`;

    const userPrompt = `以下の施設について情報を教えてください：

名前: ${place.name}
住所: ${place.address}
カテゴリ: ${categoryName}
URL: ${place.url}

出発地: ${context.depart || "未設定"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const reply = completion.choices[0]?.message?.content || "情報を取得できませんでした。";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "情報取得中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
