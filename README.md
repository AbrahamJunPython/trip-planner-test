# 旅行工程ジェネレーター（MVP）

東京発・王道・複数人向けの旅行工程をAIが70%完成度で言い切るWebツール。

## 概要

幹事が「行き先まで言い切った」70%完成の叩き台を作成するNext.jsアプリケーション。
飯は王道、時間ラフは外さない、複数人でも無理のない旅行プランを生成します。

### 特徴
- **行き先**: 1つに言い切り（候補は出さない）
- **予算**: 円で1つの明確な金額
- **工程**: 移動時間・滞在目安つき
- **飯**: 1日1軒、具体的な店名（王道・老舗・定番のみ）
- **完成度**: 70%（後で人が直せる余白を残す）

## 技術スタック

- **フレームワーク**: Next.js 16.1.6
- **言語**: TypeScript 5.4.5
- **ランタイム**: React 18.3.1
- **AI**: OpenAI API (GPT-4o-mini)
- **スタイリング**: Tailwind CSS
- **日付処理**: date-fns, react-day-picker
- **OGP取得**: cheerio

## プロジェクト構造

```
trip-planner-mvp/
├── app/
│   ├── api/
│   │   ├── generate/
│   │   │   └── route.ts          # OpenAI API呼び出し
│   │   └── ogp/
│   │       ├── route.ts          # OGP取得API
│   │       ├── oembed.ts         # SNS oEmbed処理
│   │       └── provider.ts       # プロバイダー判定
│   ├── plan/
│   │   └── page.tsx              # プラン入力ページ
│   ├── result/
│   │   └── page.tsx              # 結果表示ページ
│   ├── layout.tsx                # ルートレイアウト
│   ├── page.tsx                  # ホームページ
│   └── types.ts                  # 型定義
├── public/
│   └── cocoico-ai.png            # ロゴ画像
├── .env.local.template           # 環境変数テンプレート
├── .gitignore                    # Git除外設定
├── next.config.js                # Next.js設定
├── package.json                  # 依存関係
├── tailwind.config.js            # Tailwind設定
├── tsconfig.json                 # TypeScript設定
├── vercel.json                   # Vercelデプロイ設定
├── DEPLOY.md                     # デプロイ手順
└── README.md
```

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local`ファイルを作成し、OpenAI APIキーを設定：
```bash
cp .env.local.template .env.local
```

`.env.local`を編集：
```
OPENAI_API_KEY=your_openai_api_key_here
```

⚠️ **重要**: `.env.local`ファイルは絶対にGitにコミットしないでください

### 3. 開発サーバーの起動
```bash
npm run dev
```

http://localhost:3000 でアプリケーションにアクセスできます。

## 使用方法

1. **旅行名入力**
   - 旅行の名前を入力（デフォルト: 新しい旅行）

2. **行き先設定**
   - テキスト入力、またはURLから行き先情報を取得

3. **日程選択**
   - カレンダーから出発日と帰着日を選択
   - 日帰りも可能

4. **人数・同行者・予算感**
   - 人数: 1〜10人以上
   - 同行者: 一人旅、カップル、友達同士、子供連れ、家族旅行、その他
   - 予算感: 5段階から選択

5. **生成実行**
   - 「ラフプラン生成」ボタンをクリック
   - AIが行き先・予算・詳細工程を生成

## 出力フォーマット

- **行き先**: 具体的なエリア名で言い切り
- **推奨予算**: 1人あたりの総額（円）
- **選定理由**: 短文3点
- **旅行工程**: 日別の詳細スケジュール（時間ラフ付き）
- **注意書き**: 飲食店変更時の対応方針

## 開発・デプロイ

### ビルド
```bash
npm run build
```

### 本番起動
```bash
npm start
```

### Vercelデプロイ
詳細は [DEPLOY.md](./DEPLOY.md) を参照してください。

簡易手順：
1. Vercelアカウントでプロジェクトをインポート
2. Environment Variablesに`OPENAI_API_KEY`を設定
3. デプロイ実行

## セキュリティ

- APIキーは環境変数で管理
- SSRF対策実装済み（OGP取得時）
- プライベートネットワークへのアクセス制限
- HTTPS通信のみ許可
- セキュリティヘッダー設定済み

## 今後の改善予定

- 実使用ベースでの機能改善
- 行き先選択肢の拡充
- 予算精度の向上
- ユーザーフィードバック機能
- レスポンシブデザインの最適化
