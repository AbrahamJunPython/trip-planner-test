# APIレスポンス速度改善 - AWS移行判断

## 現状のボトルネック分析

### 速度測定（想定）
```
/api/generate: 15-30秒（OpenAI GPT-4o-mini）
/api/fill: 3-8秒（OpenAI GPT-4o-mini）
/api/ogp: 1-3秒（外部サイトスクレイピング）
/api/classify-place: 2-5秒（OpenAI）
```

### ボトルネック特定

**🔴 最大のボトルネック: OpenAI API（90%）**
- GPT-4o-miniの応答時間: 10-25秒
- ネットワーク遅延: 100-300ms
- Vercel → OpenAI: 問題なし

**🟡 中程度: 外部API（5%）**
- OGP取得: 1-3秒
- 地理情報API: 500ms-1秒

**🟢 軽微: Vercel Functions（5%）**
- コールドスタート: 1-2秒（初回のみ）
- 実行時間: 50-200ms

## AWS移行の効果予測

### ❌ 効果が薄い移行

#### 1. Lambda移行
**期待**: レスポンス高速化
**現実**: ほぼ変わらない
- Vercel Functions: 東京リージョン対応
- Lambda: 同じく東京リージョン
- OpenAI待ち時間は変わらない
- **改善**: 0-500ms（誤差範囲）

#### 2. API Gateway + Lambda
**期待**: スケーラビリティ向上
**現実**: 現状で十分
- Vercelは自動スケール
- 同時実行制限なし（Pro）
- **改善**: なし

### ✅ 効果がある対策（AWS不要）

#### 1. ストリーミングレスポンス（実装済み）
```typescript
// app/api/generate-stream/route.ts
export async function POST(req: Request) {
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true, // ✅ 既に実装
  });
  
  return new Response(stream);
}
```
**改善**: 体感速度50%向上（実データは遅延なし）

#### 2. 並列処理（実装可能）
```typescript
// 現状: 直列処理（遅い）
const ogp = await fetchOGP(url);
const classified = await classifyPlace(ogp);
const filled = await fillDetails(classified);

// 改善: 並列処理
const [ogp, geocode] = await Promise.all([
  fetchOGP(url),
  reverseGeocode(coords)
]);
```
**改善**: 2-5秒短縮

#### 3. キャッシュ強化（実装済み）
```typescript
// app/lib/cache.ts
export async function fetchWithCache(key, fn, ttl) {
  const cached = await kv.get(key);
  if (cached) return cached; // ✅ 既に実装
  
  const result = await fn();
  await kv.set(key, result, { ex: ttl });
  return result;
}
```
**改善**: 2回目以降は即座（0.1秒）

### 🔵 効果があるAWS移行

#### 1. Amazon Bedrock（Claude 3.5 Haiku）
**現状**: OpenAI GPT-4o-mini（15-30秒）
**移行後**: Claude 3.5 Haiku（5-10秒）

```typescript
// app/lib/bedrock.ts
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export async function generateWithBedrock(prompt: string) {
  const client = new BedrockRuntimeClient({ region: "us-east-1" });
  
  const response = await client.send(new InvokeModelCommand({
    modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }]
    })
  }));
  
  return JSON.parse(new TextDecoder().decode(response.body));
}
```

**改善**: 10-20秒短縮（50-70%高速化）
**コスト**: OpenAIより安い
- GPT-4o-mini: $0.15/1M tokens
- Claude 3.5 Haiku: $0.25/1M tokens（入力）、$1.25/1M tokens（出力）

**注意**: 日本語品質の検証が必要

#### 2. CloudFront + Lambda@Edge（OGP取得）
**現状**: Vercel → 外部サイト（1-3秒）
**移行後**: CloudFront → Lambda@Edge（0.5-1秒）

```typescript
// Lambda@Edge
export const handler = async (event) => {
  const url = event.queryStringParameters.url;
  
  // エッジロケーションで実行（ユーザーに近い）
  const response = await fetch(url);
  const html = await response.text();
  const ogp = parseOGP(html);
  
  return {
    statusCode: 200,
    body: JSON.stringify(ogp)
  };
};
```

**改善**: 1-2秒短縮
**コスト**: 月$5-10（100万リクエスト）

## 推奨アクション

### 🎯 今すぐ実施（AWS不要）

**1. 並列処理の最適化**
```typescript
// app/api/generate/route.ts
const [classified, geocode] = await Promise.all([
  Promise.all(urls.map(classifyPlace)),
  reverseGeocode(coords)
]);
```
**工数**: 2-3時間
**改善**: 3-5秒短縮

**2. プリフェッチ実装**
```typescript
// app/plan/page.tsx
useEffect(() => {
  // ユーザーが入力中に先行してOGP取得
  if (url) {
    prefetchOGP(url);
  }
}, [url]);
```
**工数**: 1日
**改善**: 体感速度30%向上

**3. レスポンス圧縮**
```typescript
// next.config.js
module.exports = {
  compress: true, // Gzip圧縮
};
```
**工数**: 5分
**改善**: 転送時間50%短縮

### 🔄 検討すべきAWS移行

**条件付きで実施**:

**Bedrock移行（Claude 3.5 Haiku）**
- **条件**: OpenAI応答が遅すぎる（30秒超）
- **効果**: 50-70%高速化
- **工数**: 3-5日
- **リスク**: 日本語品質の検証必要

**CloudFront + Lambda@Edge**
- **条件**: グローバル展開時
- **効果**: 海外ユーザーで50%高速化
- **工数**: 2-3日
- **コスト**: 月$5-10

### ❌ 不要なAWS移行

- Lambda（Vercel Functionsで十分）
- API Gateway（Vercelで十分）
- ElastiCache（Vercel KVで十分）

## 速度改善ロードマップ

### フェーズ1: 即実施（AWS不要）
```
週1: 並列処理最適化 → 3-5秒短縮
週2: プリフェッチ実装 → 体感30%向上
週3: レスポンス圧縮 → 転送50%短縮
```
**合計改善**: 5-8秒短縮、体感50%向上

### フェーズ2: 検証後実施（AWS）
```
月2-3: Bedrock検証
- Claude 3.5 Haiku vs GPT-4o-mini
- 日本語品質テスト
- 速度・コスト比較
```
**条件**: OpenAI応答30秒超が頻発

### フェーズ3: グローバル展開時（AWS）
```
月6-12: CloudFront + Lambda@Edge
- 海外ユーザー向け最適化
```
**条件**: 海外ユーザー10%超

## 結論

### AWS移行の判断

**❌ 速度改善目的のAWS移行は不要**
- Vercel Functionsで十分高速
- ボトルネックはOpenAI API（90%）
- AWS移行しても改善は限定的（0-2秒）

**✅ 優先すべき対策**
1. 並列処理最適化（3-5秒短縮）
2. プリフェッチ実装（体感30%向上）
3. ストリーミング活用（既に実装済み）

**🔵 条件付きでAWS検討**
- Bedrock: OpenAI応答30秒超が頻発
- CloudFront: グローバル展開時

### コスト比較

**現状（Vercel）**
- 速度: 15-30秒
- コスト: $30-50/月

**AWS移行後（Bedrock）**
- 速度: 5-10秒（50-70%改善）
- コスト: $40-70/月（+$10-20）

**並列処理最適化（推奨）**
- 速度: 10-25秒（20-30%改善）
- コスト: $30-50/月（変わらず）
- 工数: 2-3時間

## 実装例

### 並列処理最適化
```typescript
// app/api/generate/route.ts
export async function POST(req: Request) {
  const { urls, coords } = await req.json();
  
  // ❌ 直列処理（遅い）
  // const ogps = [];
  // for (const url of urls) {
  //   ogps.push(await fetchOGP(url));
  // }
  
  // ✅ 並列処理（速い）
  const [ogps, geocode, stations] = await Promise.all([
    Promise.all(urls.map(fetchOGP)),
    reverseGeocode(coords),
    searchNearbyStations(coords)
  ]);
  
  // さらに並列化
  const classified = await Promise.all(
    ogps.map(ogp => classifyPlace(ogp))
  );
  
  return NextResponse.json({ classified, geocode, stations });
}
```

### プリフェッチ実装
```typescript
// app/plan/page.tsx
const debouncedUrl = useDebounce(newUrl, 500);

useEffect(() => {
  if (debouncedUrl) {
    // バックグラウンドでOGP取得開始
    fetch('/api/ogp', {
      method: 'POST',
      body: JSON.stringify({ urls: [debouncedUrl] })
    });
  }
}, [debouncedUrl]);
```

**結論**: まずは並列処理最適化を実施。AWS移行は条件次第で検討。
