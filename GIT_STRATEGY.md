# GitHubリポジトリ戦略

## 結論：1つのリポジトリ + ブランチ戦略（推奨）

本番と開発で**リポジトリを分けない**ことを推奨します。
代わりに**ブランチ戦略**で管理します。

## 理由

### ❌ リポジトリを分けるデメリット

1. **コード同期が困難**
   - 開発→本番への反映が手動
   - マージ漏れのリスク
   - 履歴の追跡が困難

2. **CI/CDの複雑化**
   - 2つのリポジトリで設定を管理
   - デプロイフローが複雑

3. **チーム協業の障害**
   - どちらが最新か不明
   - PRレビューが分散

4. **メンテナンスコスト増**
   - Issue管理が分散
   - ドキュメントの二重管理

### ✅ 1リポジトリ + ブランチ戦略のメリット

1. **シンプルな管理**
   - 1つのリポジトリで完結
   - 履歴が一元化

2. **自動デプロイ**
   - ブランチごとに環境を自動切り替え
   - Vercelが自動対応

3. **コードレビューが容易**
   - PRで変更を確認
   - 本番反映前にレビュー

4. **ロールバックが簡単**
   - Gitの履歴で管理
   - 即座に前バージョンに戻せる

## 推奨ブランチ戦略

### Git Flow（シンプル版）

```
main (本番)
  ↑
develop (開発)
  ↑
feature/* (機能開発)
fix/* (バグ修正)
```

### ブランチ運用

#### 1. main（本番環境）
- **用途**: 本番デプロイ
- **保護**: 直接pushは禁止
- **デプロイ**: Vercel Production
- **マージ**: developからPR経由のみ

#### 2. develop（開発環境）
- **用途**: 開発・テスト
- **デプロイ**: Vercel Preview
- **マージ**: feature/*からPR経由

#### 3. feature/*（機能開発）
- **用途**: 新機能開発
- **命名**: `feature/add-s3-storage`
- **マージ先**: develop

#### 4. fix/*（バグ修正）
- **用途**: バグ修正
- **命名**: `fix/ogp-timeout`
- **マージ先**: develop（緊急時はmain）

## Vercel連携設定

### 自動デプロイ設定

```yaml
# vercel.json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "develop": true
    }
  }
}
```

### 環境変数管理

**Production（main）**:
```
OPENAI_API_KEY=prod_key_xxx
VERCEL_ENV=production
```

**Preview（develop）**:
```
OPENAI_API_KEY=dev_key_xxx
VERCEL_ENV=preview
```

## ワークフロー例

### 新機能開発

```bash
# 1. developから機能ブランチ作成
git checkout develop
git pull
git checkout -b feature/add-prefetch

# 2. 開発・コミット
git add .
git commit -m "feat: add URL prefetch"

# 3. developにPR
git push origin feature/add-prefetch
# GitHub上でPR作成 → develop

# 4. マージ後、Vercel Previewで確認

# 5. 本番リリース
# developからmainにPR作成
# レビュー → マージ → 本番デプロイ
```

### 緊急バグ修正

```bash
# 1. mainから直接修正ブランチ
git checkout main
git pull
git checkout -b fix/critical-bug

# 2. 修正・コミット
git add .
git commit -m "fix: critical bug"

# 3. mainに直接PR
git push origin fix/critical-bug
# GitHub上でPR作成 → main

# 4. マージ後、即座に本番デプロイ

# 5. developにもマージ
git checkout develop
git merge main
```

## GitHub設定

### ブランチ保護ルール

**main（本番）**:
```yaml
Settings → Branches → Branch protection rules

✅ Require pull request reviews before merging
✅ Require status checks to pass before merging
  - CI/CD (type-check, lint, test)
✅ Require branches to be up to date before merging
✅ Include administrators
```

**develop（開発）**:
```yaml
✅ Require pull request reviews before merging
✅ Require status checks to pass before merging
  - CI/CD (type-check, lint)
```

### 自動化設定

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm test
      
      # mainブランチのみVercel本番デプロイ
      - if: github.ref == 'refs/heads/main'
        run: vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```

## 例外：リポジトリを分けるケース

以下の場合のみ、リポジトリ分離を検討：

### 1. 完全に異なるコードベース
- 本番: PHP
- 開発: Next.js（リプレイス中）

### 2. セキュリティ要件
- 本番コードへのアクセス制限が厳格
- 開発者に本番コードを見せられない

### 3. 大規模組織
- 本番チームと開発チームが完全分離
- 承認プロセスが複雑

## 実装手順

### 1. ブランチ作成

```bash
# 現在のmainをdevelopとして複製
git checkout -b develop
git push origin develop

# GitHub上でdevelopをデフォルトブランチに設定
# Settings → Branches → Default branch → develop
```

### 2. ブランチ保護設定

```
GitHub → Settings → Branches → Add rule

Branch name pattern: main
✅ Require pull request reviews
✅ Require status checks
✅ Include administrators

Branch name pattern: develop
✅ Require pull request reviews
✅ Require status checks
```

### 3. Vercel連携

```
Vercel Dashboard → Project Settings → Git

Production Branch: main
Preview Branches: develop, feature/*, fix/*
```

### 4. チームルール文書化

```markdown
# CONTRIBUTING.md

## ブランチ戦略

- main: 本番環境
- develop: 開発環境
- feature/*: 新機能
- fix/*: バグ修正

## 開発フロー

1. developから機能ブランチ作成
2. 開発・テスト
3. developにPR
4. レビュー・マージ
5. developからmainにPR（リリース時）
```

## まとめ

### 推奨構成

```
1つのリポジトリ
├── main（本番）
├── develop（開発）
├── feature/*（機能開発）
└── fix/*（バグ修正）
```

### メリット

- シンプルな管理
- 自動デプロイ
- 履歴の一元化
- チーム協業が容易

### 次のステップ

1. developブランチ作成
2. ブランチ保護設定
3. Vercel連携設定
4. チームルール文書化

**結論**: リポジトリは分けず、ブランチ戦略で管理することを強く推奨します。
