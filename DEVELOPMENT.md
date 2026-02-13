# 開発ワークフロー

## セットアップ

```bash
npm install
npm run prepare  # Husky git hooks setup
```

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# 型チェック
npm run type-check

# Lint実行
npm run lint
npm run lint:fix  # 自動修正

# コードフォーマット
npm run format
npm run format:check

# テスト実行
npm test
npm run test:ui
npm run test:coverage

# ビルド
npm run build
npm start
```

## Git Workflow

### Pre-commit Hook
コミット前に自動実行：
- TypeScript型チェック
- ESLint

### CI/CD Pipeline
プッシュ・PR時に自動実行：
- 型チェック
- Lint
- テスト

## コード品質基準

- TypeScriptエラー0
- ESLintエラー0
- テストカバレッジ80%以上（目標）
- Prettierフォーマット準拠

## ブランチ戦略

- `main`: 本番環境
- `develop`: 開発環境
- `feature/*`: 機能開発
- `fix/*`: バグ修正
