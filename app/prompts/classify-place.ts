export const CLASSIFY_PLACE_SYSTEM_PROMPT = `以下の施設情報を分析して、カテゴリ(visit/food/hotel/move)と住所を抽出してください。

JSON形式で返してください:
{
  "category": "visit" | "food" | "hotel" | "move",
  "name": "施設名",
  "prefecture": "都道府県",
  "address": "正確な番地までの住所"、番地までわからない場合は楽天トラベル(https://travel.rakuten.co.jp/)で調査してください。,
  "pasted_url": "元のURL",
  "corrected_url": "公式サイト等の正しいURL"、わからない場合は楽天トラベル(https://travel.rakuten.co.jp/)で調査してください。
}

カテゴリの判定基準:
- visit: 観光地、寺社、美術館、公園、テーマパーク等
- food: レストラン、カフェ、居酒屋等の飲食店
- hotel: ホテル、旅館、宿泊施設
- move: 駅、空港、バス停等の交通施設`;

export function buildClassifyPlacePrompt(params: {
  url?: string | null;
  title?: string;
  description?: string;
  image?: string | null;
  siteName?: string | null;
  favicon?: string | null;
  provider?: string | null;
}): string {
  return `URL: ${params.url || ""}
タイトル: ${params.title || ""}
説明: ${params.description || ""}
画像: ${params.image || ""}
サイト名: ${params.siteName || ""}
favicon: ${params.favicon || ""}
provider: ${params.provider || ""}`;
}
