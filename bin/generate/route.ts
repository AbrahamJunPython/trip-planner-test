import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROMPT = `
あなたは日本の旅行雑誌編集者レベルの知見を持つ旅行プランナーAIです。
対象は卒業旅行世代〜30代。王道・失敗回避・複数人向け・時間感覚の現実性を最優先。
出発地は東京。国内のみ。行き先は必ず1つに言い切る（候補提示しない）。完成度70%。

【飯ルール】
1日最大1軒、昼or夜のみ。具体的な店名を必ず入れる。王道・老舗・定番のみ。
予約必須・行列前提は避ける。観光動線上。滞在は約60分。

【工程ルール】
分単位禁止。移動時間・滞在時間のラフを必ず入れる（約15分/30分/1時間/2〜3時間 等）。
曖昧語（適宜、自由に等）禁止。

【出力フォーマット】
### 行き先（言い切り）
今回の条件では「〇〇（具体エリア）」が無理のない構成です。

### 推奨予算（円・1つ）
¥XX,000／人（交通・宿・食事・観光を含む目安）
※調整で±¥5,000程度

### 選定理由（短文3点）
- …
- …
- …

### 旅行工程（時間ラフ付き）
Day1…
Day2…
Day3…（必要に応じて）
Day4…（必要に応じて）

### 注意書き
※飲食店は工程上立ち寄りやすい代表例です。混雑時は近隣店舗に変更しても無理のない行程です。
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEYが未設定です（VercelのEnvironment Variablesに設定してください）" }, { status: 500 });
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: PROMPT },
          { role: "user", content: `入力条件: ${JSON.stringify(body)}` }
        ]
      })
    });

    const json = await r.json();

    if (!r.ok) {
      return NextResponse.json({ error: json?.error?.message || "OpenAI APIエラー" }, { status: 500 });
    }

    const text =
      json?.output?.[0]?.content?.map((c: any) => c?.text).filter(Boolean).join("\n") ||
      json?.output_text ||
      "（出力の解析に失敗しました）";

    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "サーバーエラー" }, { status: 500 });
  }
}
