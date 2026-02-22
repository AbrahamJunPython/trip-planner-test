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
