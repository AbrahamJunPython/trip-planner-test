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
