// テストケース: previousVisits機能のテスト

// モックデータ: 2泊3日の京都旅行
const mockItinerary = {
  tripName: "京都2泊3日",
  days: [
    {
      dayIndex: 1,
      title: "京都到着",
      items: [
        { kind: "visit", title: "清水寺" },
        { kind: "food", title: "湯豆腐 順正" },
        { kind: "hotel", title: "京都ホテル" }
      ]
    },
    {
      dayIndex: 2,
      title: "京都観光",
      items: [
        { kind: "visit", title: "金閣寺" },
        { kind: "food", title: "京料理 菊乃井" },
        { kind: "hotel", title: "京都ホテル" }
      ]
    },
    {
      dayIndex: 3,
      title: "京都最終日",
      items: [
        { kind: "visit", title: "伏見稲荷大社" },
        { kind: "food", title: "おばんざい 大原" }
      ]
    }
  ]
};

// テスト関数: 過去の訪問地履歴を収集
function collectPreviousVisits(itinerary, currentDayIndex) {
  return itinerary.days
    .filter(d => d.dayIndex < currentDayIndex)
    .flatMap(d => d.items.filter(it => it.kind === "visit" || it.kind === "food"))
    .map(it => it.title)
    .filter(Boolean)
    .join(", ");
}

// テスト実行
console.log("=== previousVisits機能テスト ===\n");

// Day1のテスト
const day1Previous = collectPreviousVisits(mockItinerary, 1);
console.log("Day1の過去訪問地:", day1Previous || "(なし)");
console.log("期待値: (なし) - Day1は過去の訪問地がない\n");

// Day2のテスト
const day2Previous = collectPreviousVisits(mockItinerary, 2);
console.log("Day2の過去訪問地:", day2Previous);
console.log("期待値: 清水寺, 湯豆腐 順正 - Day1のvisit/foodを回避\n");

// Day3のテスト
const day3Previous = collectPreviousVisits(mockItinerary, 3);
console.log("Day3の過去訪問地:", day3Previous);
console.log("期待値: 清水寺, 湯豆腐 順正, 金閣寺, 京料理 菊乃井 - Day1,2のvisit/foodを回避\n");

// FillRequest生成テスト
function createFillRequest(dayIndex, kind, itinerary) {
  const previousVisits = collectPreviousVisits(itinerary, dayIndex);
  
  return {
    dayIndex,
    kind,
    areaTitle: "京都",
    departLabel: "出発地:京都駅",
    outlineTitle: `${kind}の場所`,
    prevTitle: null,
    nextTitle: null,
    destinationHint: "京都観光",
    optional: "budget=出し惜しみせずに旅先を堪能",
    previousVisits: previousVisits || undefined
  };
}

console.log("=== FillRequest生成テスト ===\n");

// Day2のvisit場所生成リクエスト
const day2VisitRequest = createFillRequest(2, "visit", mockItinerary);
console.log("Day2 visit用FillRequest:");
console.log("previousVisits:", day2VisitRequest.previousVisits);
console.log("→ AIは清水寺以外の観光地を提案すべき\n");

// Day3のfood場所生成リクエスト
const day3FoodRequest = createFillRequest(3, "food", mockItinerary);
console.log("Day3 food用FillRequest:");
console.log("previousVisits:", day3FoodRequest.previousVisits);
console.log("→ AIは湯豆腐 順正、京料理 菊乃井以外のレストランを提案すべき\n");

console.log("=== テスト完了 ===");
console.log("実装が正しければ、Day2以降で過去の訪問地を回避した提案がされます");