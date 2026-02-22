# Vercelデプロイ手順

## 前提条件
- Vercelアカウント
- OpenAI APIキー

## デプロイ手順

### 1. Vercelプロジェクトの作成
```bash
# Vercel CLIをインストール（初回のみ）
npm i -g vercel

# プロジェクトをVercelにリンク
vercel
```

### 2. 環境変数の設定
Vercel Dashboard > Settings > Environment Variables で以下を設定：

| 変数名 | 値 | 環境 |
|--------|-----|------|
| `OPENAI_API_KEY` | あなたのOpenAI APIキー | Production, Preview, Development |

### 3. デプロイ実行
```bash
# プロダクションデプロイ
vercel --prod
```

## 環境変数について

### 必須
- `OPENAI_API_KEY`: OpenAI APIキー（GPT-4o-mini使用）

### オプション（Instagram oEmbed用）
- `META_APP_ID`: Meta App ID
- `META_APP_SECRET`: Meta App Secret

### オプション（AWS Lambda連携）
- `AWS_LAMBDA_GENERATE_URL`: 生成処理を委譲するLambdaエンドポイントURL
- `AWS_LOG_LAMBDA_URL`: アプリログを転送するLambdaエンドポイントURL
- `AWS_S3_ACCESS_KEY`: Lambda認証用アクセスキー（サーバー側でのみ利用）
- `AWS_S3_SECRET`: Lambda認証用シークレット（サーバー側でのみ利用）
- `AWS_LOG_LAMBDA_TIMEOUT_MS`: ログ転送タイムアウト（ms、既定 15000）
- `AWS_LOG_LAMBDA_RETRIES`: ログ転送リトライ回数（既定 2）
- `AWS_LOG_LAMBDA_COOLDOWN_MS`: 連続失敗時の一時停止時間（ms、既定 60000）
- `AWS_LOG_LAMBDA_INFO_DEDUPE_WINDOW_MS`: infoログの重複抑制時間窓（ms、既定 5000）

## トラブルシューティング

### ビルドエラー
```bash
# ローカルでビルドテスト
npm run build
```

### 環境変数が反映されない
- Vercel Dashboardで環境変数を再確認
- デプロイを再実行

### APIエラー
- OpenAI APIキーの有効性を確認
- APIクォータを確認

## セキュリティ注意事項

⚠️ **重要**: 以下のファイルは絶対にGitにコミットしないでください
- `.env.local`
- APIキーを含むファイル

`.gitignore`で除外されていることを確認してください。

## CloudWatch 集計クエリ例

`aws_meta.log_class` と `data.event_type` を軸に日次確認する想定です。

### 1. 日次イベント件数（event_type）
```sql
fields @timestamp, data.event_type, data.page
| filter data.event_type != null
| stats count(*) as events by bin(1d), data.event_type, data.page
| sort bin(1d) desc
```

### 2. 予約導線クリック件数（offer_id別）
```sql
fields @timestamp, data.event_type, data.metadata.offer_id, data.sessionId
| filter data.event_type in ["click", "ui_click", "reservation_click"]
| filter ispresent(data.metadata.offer_id)
| stats count(*) as clicks, count_distinct(data.sessionId) as sessions by bin(1d), data.metadata.offer_id
| sort bin(1d) desc, clicks desc
```

### 3. KPI（初回応答/描画）達成率
```sql
fields @timestamp, data.event_type, data.metadata.first_response_ms, data.metadata.result_render_ms, data.metadata.kpi_target_ms
| filter data.event_type = "kpi_first_response"
| stats
    avg(data.metadata.first_response_ms) as avg_first_response_ms,
    avg(data.metadata.result_render_ms) as avg_result_render_ms,
    sum(if(data.metadata.achieved = true, 1, 0)) as achieved_count,
    count(*) as total_count
  by bin(1d)
| display avg_first_response_ms, avg_result_render_ms, achieved_count, total_count, (achieved_count*100.0/total_count) as achieved_rate_pct
| sort bin(1d) desc
```

### 4. エラー分類件数（aws_meta）
```sql
fields @timestamp, aws_meta.log_class, context.endpoint, level
| filter level in ["warn", "error"] or aws_meta.log_class = "user_event"
| stats count(*) as logs by bin(1d), aws_meta.log_class, context.endpoint
| sort bin(1d) desc
```

## `/go` トラッキング必須ポリシー
- 必須クエリ: `session_id`, `item_id`
- 欠損時: `400 Bad Request` を返し、`error_code: "missing_tracking_fields"` をログ出力
- 目的: `offer_id x session_id x item_id` の結合キーを常に保証し、予約導線分析の欠損を防ぐ
