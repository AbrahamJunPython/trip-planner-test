# AWS移行優先順位

## 現状分析

### 現在の構成
- **ホスティング**: Vercel
- **キャッシュ**: Vercel KV (Redis)
- **ストレージ**: なし（sessionStorage/URL共有のみ）
- **AI**: OpenAI API
- **データベース**: なし

## 優先順位

### 🔴 優先度：高（即効果あり）

#### 1. Amazon S3 - 旅行プラン永続化
**現状の課題**:
- 共有URLが24時間で消える（Vercel KV TTL）
- sessionStorageは別デバイスで見れない
- データが残らない

**移行メリット**:
- 永続的な共有URL
- 画像・PDF出力の保存先
- ユーザー履歴の保存
- コスト: 月$1未満（1万プラン保存でも）

**実装工数**: 1-2日
```typescript
// app/lib/s3.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export async function savePlanToS3(planId: string, data: any) {
  const s3 = new S3Client({ region: "ap-northeast-1" });
  await s3.send(new PutObjectCommand({
    Bucket: "trip-planner-plans",
    Key: `plans/${planId}.json`,
    Body: JSON.stringify(data),
    ContentType: "application/json"
  }));
}
```

#### 2. Amazon DynamoDB - メタデータ管理
**用途**:
- プランID → S3パスのマッピング
- アクセスカウント
- 作成日時・更新日時

**移行メリット**:
- 高速検索
- スケーラブル
- Vercel KVより安い（無料枠25GB）

**実装工数**: 1日

### 🟡 優先度：中（スケール時に必要）

#### 3. Amazon ElastiCache (Redis) - キャッシュ移行
**現状**: Vercel KV使用中

**移行タイミング**:
- 月間10万リクエスト超えたら
- Vercel KVコストが$50超えたら

**移行メリット**:
- コスト削減（大規模時）
- より細かい制御

**実装工数**: 2-3日

#### 4. Amazon CloudFront - CDN
**用途**:
- 静的アセット配信
- S3の画像配信高速化

**移行タイミング**:
- グローバル展開時
- 画像が増えたら

**実装工数**: 1日

### 🟢 優先度：低（将来的に検討）

#### 5. Amazon Bedrock - AI移行
**現状**: OpenAI API使用中

**移行タイミング**:
- OpenAIコストが月$500超えたら
- 日本語特化モデルが必要になったら

**移行メリット**:
- Claude 3.5 Sonnet使用可能
- AWSエコシステム統合

**実装工数**: 3-5日

#### 6. AWS Lambda - サーバーレス化
**現状**: Vercel Functions

**移行タイミング**:
- Vercel制限に達したら
- より細かい制御が必要になったら

**実装工数**: 1週間

## 推奨移行ロードマップ

### フェーズ1（即実施）: ストレージ基盤
```
週1-2: S3 + DynamoDB導入
- 永続的なプラン保存
- 共有URL無期限化
- コスト: 月$2-3
```

### フェーズ2（3ヶ月後）: キャッシュ最適化
```
月3-4: ElastiCache検討
- トラフィック増加時のみ
- Vercel KVコスト次第
```

### フェーズ3（6ヶ月後）: AI最適化
```
月6-7: Bedrock検討
- OpenAIコスト次第
- 日本語特化が必要なら
```

## コスト試算

### 現状（Vercel）
- Vercel Pro: $20/月
- Vercel KV: $0-50/月（使用量次第）
- OpenAI: $10-100/月（使用量次第）
**合計**: $30-170/月

### AWS移行後（フェーズ1）
- Vercel Pro: $20/月（継続）
- S3: $1/月（1万プラン）
- DynamoDB: $0/月（無料枠内）
- OpenAI: $10-100/月（継続）
**合計**: $31-121/月

**削減効果**: Vercel KV分が削減される可能性

## 実装例

### S3統合
```typescript
// app/api/share/route.ts
import { savePlanToS3, getPlanFromS3 } from "@/app/lib/s3";

export async function POST(req: Request) {
  const data = await req.json();
  const id = generateId();
  
  await savePlanToS3(id, data);
  
  return NextResponse.json({ id });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const data = await getPlanFromS3(id);
  
  return NextResponse.json({ data });
}
```

### DynamoDB統合
```typescript
// app/lib/dynamodb.ts
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function savePlanMetadata(planId: string, metadata: any) {
  const client = new DynamoDBClient({ region: "ap-northeast-1" });
  await client.send(new PutItemCommand({
    TableName: "trip-plans",
    Item: {
      planId: { S: planId },
      createdAt: { N: Date.now().toString() },
      s3Key: { S: `plans/${planId}.json` },
      accessCount: { N: "0" }
    }
  }));
}
```

## 必要なAWSリソース

### 最小構成（フェーズ1）
```yaml
Resources:
  - S3 Bucket: trip-planner-plans
  - DynamoDB Table: trip-plans
  - IAM Role: trip-planner-s3-access
  - CloudWatch Logs: エラー監視
```

### 環境変数追加
```bash
# .env.local
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET_NAME=trip-planner-plans
DYNAMODB_TABLE_NAME=trip-plans
```

## まとめ

**今すぐ実施すべき**: S3 + DynamoDB
- 実装簡単
- 効果大きい
- コスト安い

**様子見**: ElastiCache, Bedrock, Lambda
- トラフィック・コスト次第
- 現状のVercel構成で十分
