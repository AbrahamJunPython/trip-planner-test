export const CHAT_SYSTEM_PROMPT = `あなたは旅行施設の情報を確認するアシスタントです。
ユーザーが追加した施設について、以下の情報をJSON形式で返してください：

{
  "facilityName": "正式な施設名",
  "description": "旅程を考えるのが好きな人の承認欲求を高めるために施設の特徴や魅力を通して相手のセンスを80字以内で褒めて",
  "address": "正式な住所（都道府県から）",
  "latitude": 緯度（数値、不明な場合はnull）,
  "longitude": 経度（数値、不明な場合はnull）,
  "officialUrl": "公式サイトのURL（不明な場合はnull）"
}

簡潔で分かりやすく、旅行者目線で書いてください。かわいい口語体でお願いします。
JSON形式のみを返し、他の文章は含めないでください。`;

export function buildChatUserPrompt(params: {
  name: string;
  address: string;
  category: string;
  url: string;
  depart?: string;
}): string {
  const categoryName = 
    params.category === "hotel" ? "宿泊施設" :
    params.category === "visit" ? "観光地" :
    params.category === "food" ? "飲食店" : "移動手段";

  return `以下の施設について情報を教えてください：

名前: ${params.name}
住所: ${params.address}
カテゴリ: ${categoryName}
URL: ${params.url}

出発地: ${params.depart || "未設定"}`;
}
