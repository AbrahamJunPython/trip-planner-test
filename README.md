# Trip Planner Test

旅行プラン作成アプリ（Next.js / TypeScript）です。  
`/plan` で条件入力・URL貼り付け、`/chat` でAI相談、`/task` で予約導線、`/result` で旅程表示と共有ができます。

## 主な機能
- OGP取得: URLからタイトル・説明・画像などを抽出（`/api/ogp`）
- 施設分類: OGPをもとにカテゴリ/住所などを分類（`/api/classify-place`）
- Geocode: 住所から緯度経度を補完（`/api/geocode`）
- チャット補助: 施設ごとに説明文を生成（`/api/chat`）
- 旅程生成: 旅程JSONの生成と補完（`/api/generate`, `/api/fill`, `/api/generate-stream`）
- 共有URL: 旅程の保存・取得（`/api/share`）
- クライアントイベントログ: `page_view`, `start_button_click`, `ai_consult_click`, `item_stage`, `ai_consult_snapshot`, `reservation_click`（`/api/client-log`）

## 画面構成
- `/` ホーム
- `/plan` 条件入力・URL管理
- `/chat` AI相談
- `/task` タスク/予約導線
- `/result` 生成結果表示・共有

## APIエンドポイント（主要）
- `POST /api/ogp`
- `POST /api/classify-place`
- `POST /api/geocode`
- `POST /api/reverse-geocode`
- `POST /api/chat`
- `POST /api/generate`
- `POST /api/generate-stream`
- `POST /api/fill`
- `GET|POST /api/share`
- `POST /api/client-log`
- `GET /api/health`
- `POST /api/calculate-trip-days`

## ログ設計（現状）
- クライアントイベントは `/api/client-log` に集約
- `session_id`, `user_id`, `device_id`, `event_type` を送信
- URL単位追跡用に `item_id`、フロー追跡用に `flow_id` を利用
- サーバーログは `app/lib/logger.ts` からAWS Lambdaへ転送可能
- AWS転送は以下を中心に送信:
  - `/api/client-log` の主要イベント（info）
  - 各APIの warn/error
- AWS転送時に `aws_meta`（分類メタ）を付与

## 必要な環境変数

### 必須
- `OPENAI_API_KEY`

### 生成系Lambda連携（任意）
- `AWS_LAMBDA_GENERATE_URL`
- `AWS_S3_ACCESS_KEY`
- `AWS_S3_SECRET`

### ログ転送Lambda連携（任意）
- `AWS_LOG_LAMBDA_URL`
- `AWS_S3_ACCESS_KEY`
- `AWS_S3_SECRET`
- `AWS_LOG_LAMBDA_TIMEOUT_MS`（default: `15000`）
- `AWS_LOG_LAMBDA_RETRIES`（default: `2`）
- `AWS_LOG_LAMBDA_COOLDOWN_MS`（default: `60000`）
- `AWS_LOG_LAMBDA_INFO_DEDUPE_WINDOW_MS`（default: `5000`）
- `AWS_LOG_SLOW_THRESHOLD_MS`（default: `3000`）

### OGP（Instagram oEmbed, 任意）
- `META_APP_ID`
- `META_APP_SECRET`

### 共有ストレージ（任意）
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## セットアップ
```bash
npm install
```

`.env.local` を作成して必要な環境変数を設定してください。

## 開発
```bash
npm run dev
```

- App: `http://localhost:3000`

## 品質チェック
```bash
npm run type-check
npm run lint
npm test -- --run
```

## ビルド/起動
```bash
npm run build
npm start
```

## 主要スクリプト
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run format`

## デプロイ
- Vercel前提。詳細は `DEPLOY.md` を参照してください。

## 補足ドキュメント
- `DEPLOY.md` デプロイ手順
- `LOG_DESIGN_AUDIT_2026-02-15.md` ログ設計監査結果

