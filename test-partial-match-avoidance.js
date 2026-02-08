// テストケース: 部分一致回避機能のテスト

// モックデータ: 類似名称を含む旅行プラン
const mockItinerary = {
  tripName: "京都3日間",
  days: [
    {
      dayIndex: 1,
      title: "京都到着",
      items: [
        { kind: "visit", title: "清水寺（本堂）" },
        { kind: "food", title: "湯豆腐 順正（本店）" },
        { kind: "visit", title: "東寺（五重塔）" }
      ]
    },
    {
      dayIndex: 2,
      title: "京都観光",
      items: [
        { kind: "visit", title: "金閣寺" },
        { kind: "food", title: "京料理 菊乃井" }
      ]
    }
  ]
};

// 部分一致回避ルール生成関数
function generateAvoidanceRule(previousVisits) {
  if (!previousVisits) return "";
  
  return `

# AVOIDANCE RULE (CRITICAL)
過去の訪問地: ${previousVisits}
- 上記の場所と同じ名前や類似名は絶対に避ける
- 部分一致でも避ける（例：「清水寺」があれば「清水○○」も避ける）
- 完全に異なる場所を選ぶ`;
}

// テスト実行
console.log("=== 部分一致回避機能テスト ===\n");

// Day2の過去訪問地
const day2Previous = "清水寺（本堂）, 湯豆腐 順正（本店）, 東寺（五重塔）";
console.log("Day2の過去訪問地:", day2Previous);

// 回避ルール生成
const avoidanceRule = generateAvoidanceRule(day2Previous);
console.log("生成された回避ルール:", avoidanceRule);

console.log("\n=== 期待される回避パターン ===");
console.log("✅ 避けるべき場所（部分一致含む）:");
console.log("- 清水寺、清水坂、清水の舞台 など「清水」を含む全て");
console.log("- 順正、順正おかべ家 など「順正」を含む全て");
console.log("- 東寺、東寺餅 など「東寺」を含む全て");

console.log("\n✅ 提案されるべき場所:");
console.log("- 金閣寺、銀閣寺、伏見稲荷大社（完全に異なる名前）");
console.log("- がんこ寿司、嵐山吉兆（完全に異なる店名）");

// プロンプト例
const samplePrompt = `
Return ONLY valid JSON. No markdown, no extra text.

# PHASE2 / FILL ONE ITEM (RICH TITLE)
You must output a SPECIFIC proper noun for this one item.${avoidanceRule}

# Context
dayIndex=2
kind=visit
area=京都
destinationHint=京都観光
`;

console.log("\n=== 生成されるプロンプト例 ===");
console.log(samplePrompt);

console.log("\n=== テスト完了 ===");
console.log("実装により、AIは部分一致する場所も回避して提案するはずです");