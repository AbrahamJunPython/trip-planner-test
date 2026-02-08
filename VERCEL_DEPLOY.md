# Vercelデプロイ手順

## 1. 環境変数の設定

Vercelダッシュボードで以下の環境変数を設定してください：

### 必須環境変数
- `OPENAI_API_KEY`: OpenAI APIキー（sk-proj-で始まる文字列）

### 設定手順
1. Vercelダッシュボードでプロジェクトを選択
2. Settings → Environment Variables
3. 以下を追加：
   - Name: `OPENAI_API_KEY`
   - Value: あなたのOpenAI APIキー
   - Environment: Production, Preview, Development すべてにチェック

## 2. デプロイ

```bash
# GitHubにプッシュするだけで自動デプロイされます
git add .
git commit -m "Deploy to Vercel"
git push origin main
```

## 3. 確認事項

- ✅ APIキーが環境変数で設定されている
- ✅ vercel.jsonの設定が正しい
- ✅ package.jsonのbuildスクリプトが動作する
- ✅ 全てのAPIエンドポイントが環境変数を使用している

## 4. トラブルシューティング

### デプロイエラーの場合
- Vercelのログを確認
- 環境変数が正しく設定されているか確認
- package.jsonの依存関係を確認

### APIエラーの場合
- OpenAI APIキーが有効か確認
- APIキーに十分なクレジットがあるか確認
- レート制限に引っかかっていないか確認