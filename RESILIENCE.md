# API Resilience Features

このプロジェクトには、API呼び出しの信頼性を向上させる以下の機能が実装されています。

## 1. リトライ機能 (`app/lib/retry.ts`)

### 特徴
- **指数バックオフ**: 再試行間隔が指数的に増加
- **ジッター**: ランダムな遅延を追加して同時リトライを分散
- **選択的リトライ**: 特定のエラーコードのみリトライ

### デフォルト設定
```typescript
{
  maxRetries: 3,           // 最大3回リトライ
  initialDelay: 1000,      // 初回1秒待機
  maxDelay: 10000,         // 最大10秒待機
  backoffMultiplier: 2,    // 2倍ずつ増加
  retryableStatuses: [408, 429, 500, 502, 503, 504]
}
```

### 使用例
```typescript
import { fetchWithRetry } from '@/app/lib/retry';

const response = await fetchWithRetry('https://api.example.com', {
  method: 'POST',
  body: JSON.stringify(data),
}, {
  maxRetries: 5,
  onRetry: (attempt, error) => {
    console.log(`Retry attempt ${attempt}: ${error.message}`);
  }
});
```

## 2. サーキットブレーカー (`app/lib/circuit-breaker.ts`)

### 特徴
- **障害検知**: 連続失敗を検知して自動的に遮断
- **自動復旧**: 一定時間後に自動的に再試行
- **段階的復旧**: HALF_OPEN状態で徐々に復旧

### 状態遷移
```
CLOSED (正常) → OPEN (遮断) → HALF_OPEN (試行) → CLOSED
```

### デフォルト設定
```typescript
{
  failureThreshold: 5,     // 5回失敗でOPEN
  successThreshold: 2,     // 2回成功でCLOSED
  timeout: 10000,          // 10秒タイムアウト
  resetTimeout: 60000,     // 60秒後に再試行
}
```

### 使用例
```typescript
import { getCircuitBreaker } from '@/app/lib/circuit-breaker';

const breaker = getCircuitBreaker('my-api', {
  failureThreshold: 3,
  resetTimeout: 30000,
});

const result = await breaker.execute(() => 
  fetch('https://api.example.com')
);
```

## 3. フォールバック機能

### 使用例
```typescript
import { fetchWithFallback } from '@/app/lib/retry';

const data = await fetchWithFallback(
  // Primary: 高速だが不安定なAPI
  () => fetch('https://fast-api.example.com').then(r => r.json()),
  
  // Fallback: 低速だが安定したAPI
  () => fetch('https://stable-api.example.com').then(r => r.json()),
  
  { timeout: 5000 }
);
```

## 4. 構造化ログ (`app/lib/logger.ts`)

### 特徴
- タイムスタンプ付きログ
- コンテキスト情報の自動付与
- エラースタックトレース

### 使用例
```typescript
import { createLogger } from '@/app/lib/logger';

const logger = createLogger('/api/my-endpoint');
logger.info('Processing request', { userId: 123 });
logger.error('Request failed', error, { requestId: 'abc' });
```

## 実装済みエンドポイント

### `/api/chat`
- ✅ リトライ機能
- ✅ サーキットブレーカー
- ✅ 構造化ログ

### 今後の実装予定
- `/api/generate` - リトライ + サーキットブレーカー
- `/api/classify-place` - リトライ
- `/api/ogp` - フォールバック (oEmbed → HTMLスクレイピング)

## モニタリング

### サーキットブレーカーの状態確認
```typescript
import { getCircuitBreakerState } from '@/app/lib/circuit-breaker';

const state = getCircuitBreakerState('openai-chat');
console.log(state); // "CLOSED" | "OPEN" | "HALF_OPEN"
```

### 手動リセット
```typescript
import { resetCircuitBreaker } from '@/app/lib/circuit-breaker';

resetCircuitBreaker('openai-chat');
```

## ベストプラクティス

1. **外部API呼び出しには必ずリトライを使用**
2. **重要なサービスにはサーキットブレーカーを設定**
3. **可能な限りフォールバックを用意**
4. **すべてのエラーをログに記録**
5. **本番環境でサーキットブレーカーの状態を監視**

## 環境変数

```bash
# ログレベル
LOG_LEVEL=info

# デバッグログ有効化
ENABLE_DEBUG_LOGS=true
```
