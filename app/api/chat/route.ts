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

    const { place, context, ogpData } = await req.json();

    const categoryName = place.category === "hotel" ? "宿泊施設" : place.category === "visit" ? "観光地" : place.category === "food" ? "飲食店" : "移動手段";

    const systemPrompt = `あなたは旅行施設の情報を確認するアシスタントです。
ユーザーが追加した施設について、以下の情報をJSON形式で返してください：

{
  "facilityName": "正式な施設名",
  "description": "施設の特徴や魅力を80字以内で説明",
  "address": "正式な住所（都道府県から）",
  "latitude": 緯度（数値、不明な場合はnull）,
  "longitude": 経度（数値、不明な場合はnull）,
  "officialUrl": "公式サイトのURL（不明な場合はnull）"
}

簡潔で分かりやすく、旅行者目線で書いてください。かわいい口語体でお願いします。
JSON形式のみを返し、他の文章は含めないでください。`;

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
      response_format: { type: "json_object" },
    });

    const reply = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(reply);

    return NextResponse.json({
      facilityName: parsed.facilityName || place.name,
      description: parsed.description || "情報を取得できませんでした。",
      address: parsed.address || place.address,
      latitude: parsed.latitude || null,
      longitude: parsed.longitude || null,
      officialUrl: parsed.officialUrl || place.url,
      sourceUrl: place.url,
      category: place.category,
      ogp: ogpData || null
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "情報取得中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
