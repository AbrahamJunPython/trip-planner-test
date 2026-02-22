# Log Design Audit (2026-02-15) - Updated After Implementation

## Scope
- `app/page.tsx`
- `app/plan/page.tsx`
- `app/chat/page.tsx`
- `app/task/page.tsx`
- `app/result/page.tsx`
- `app/go/[offer_id]/route.ts`
- `app/api/client-log/route.ts`
- `app/api/chat/route.ts`
- `app/api/ogp/route.ts`
- `app/api/geocode/route.ts`
- `app/api/classify-place/route.ts`
- `app/lib/logger.ts`

---

## Summary
- 指示①: **適合 (Met)**  
- 指示②: **適合 (Met)**  
- 指示③: **一部適合 (Partial)**  

---

## 指示①
> 「ログは“後から1セッションを完全再現できる”形。最低限、全イベントに `session_id` と `event_type` を必ず付与し、`question_shown / answer / result_shown / click` を同一 `session_id` で接続可能に」

### 実装確認
- `event_type` の許可値に追加済み:
  - `question_shown`, `answer`, `result_shown`, `click`, `kpi_first_response`
  - `app/api/client-log/route.ts:15`
  - `app/api/client-log/route.ts:37`
- `/api/client-log` で `session_id` を必須化（不備は 400）:
  - `app/api/client-log/route.ts:67`
- `/api/client-log` は `event_type` のみ受理し、`eventType` は 400 で拒否:
  - `app/api/client-log/route.ts:58`
  - `app/api/client-log/route.ts:77`
- `session_id`/`user_id`/`device_id` は各ページ送信で付与:
  - `app/page.tsx:49`
  - `app/plan/page.tsx:221`
  - `app/chat/page.tsx:122`
  - `app/task/page.tsx:58`
  - `app/result/page.tsx:172`
- `question_shown` と `answer` は chat で送信:
  - `app/chat/page.tsx:276`
  - `app/chat/page.tsx:345`
- `result_shown` は result で送信:
  - `app/result/page.tsx:412`
- `click` は chat/task/result で送信:
  - `app/chat/page.tsx:591`
  - `app/task/page.tsx:207`
  - `app/result/page.tsx:610`

### 判定
- **Met**

---

## 指示②
> 「外部リンクは必ず自前の `/go/{offer_id}` 経由。遷移前に `click` 記録後、302リダイレクト。`offer_id` と `session_id` を保持」

### 実装確認
- `/go/{offer_id}` ルートを追加:
  - `app/go/[offer_id]/route.ts:1`
- `/go` で click 記録後に `302`:
  - `app/go/[offer_id]/route.ts:49`
  - `app/go/[offer_id]/route.ts:61`
- `offer_id`, `session_id`（他ID含む）を `/go` で受信・ログ化:
  - `app/go/[offer_id]/route.ts:25`
  - `app/go/[offer_id]/route.ts:51`
- chat/task/result の外部遷移を `/go/...` 経由へ置換:
  - `app/chat/page.tsx:162`
  - `app/task/page.tsx:98`
  - `app/result/page.tsx:208`
- `/go` の click ログを AWS 側 user_event として分類:
  - `app/lib/logger.ts:297`
  - `app/lib/logger.ts:320`

### 判定
- **Met**

---

## 指示③
> 「初回レスポンス2秒以内をKPI。重い処理（OGP取得・詳細生成など）はレスポンス後に回し、先にプレースホルダー返却」

### 実装確認
- slow判定ログ（`duration_ms`）は実装済み:
  - `app/api/chat/route.ts:271`
  - `app/api/ogp/route.ts:295`
  - `app/api/geocode/route.ts:116`
  - `app/api/classify-place/route.ts:97`
  - `app/api/client-log/route.ts:102`
- ただし `/api/chat` は OpenAI 応答待ちで同期レスポンス:
  - `app/api/chat/route.ts:225`
  - `app/api/chat/route.ts:244`
- UI側「考え中…」プレースホルダーはあるが、APIが先返し構造ではない:
  - `app/chat/page.tsx:671`
- 2秒KPIの明示イベント（`kpi_first_response`）は追加済み:
  - `app/chat/page.tsx:87`
  - `app/chat/page.tsx:358`
  - `app/chat/page.tsx:380`

### 判定
- **Partial**
- 理由:
  - 可観測性（slowログ）はある
  - 2秒KPI達成のための「先返し + 後更新」アーキテクチャには未移行

---

## Remaining Gap List (actionable)
1. 重処理API（特に `/api/chat`）を「先返し + 非同期更新」へ段階移行

---

## Notes
- 現在のAWS転送は、主要 user event + warn/error を中心に動作。
- `/go` 導入により、外部遷移の追跡可能性（offer単位）は大幅に改善済み。

---

## Execution Plan

### Strategy Shift
- [x] 目的を「単一旅程の品質向上」から「比較体験と収益導線の検証」へ移行する。
- [x] 開発優先は API精度よりも、計測可能性（クリック計測・ログ正規化）を最優先とする。

### Priority (P0-P2)

#### P0 外部遷移の一本化（`/go`）
- [x] `/chat`, `/task`, `/result` の外部遷移を `/go/{offer_id}` 経由へ統一
- [x] クリック記録後に `302` リダイレクト
- [x] 成功条件: `offer_id x session_id x item_id` で追跡可能

#### P1 Resultページのログ強化
- [x] `page_view` を追加
- [x] `ui_impression` を追加
- [x] `ui_click` を追加
- [x] `result_shown` を追加
- [x] `canonical_event_type` を廃止し、送信・受信・集計キーを `event_type` に統一
- [x] 成功条件: 主要UI要素の表示/クリックを時系列再現可能

#### P2 初回レスポンス体験の計測
- [x] `first_response_ms` を `/api/client-log` へ送信
- [x] `ttfb_ms` を `/api/client-log` へ送信
- [x] `kpi_target_ms` を `/api/client-log` へ送信
- [x] `result_render_ms` を `/api/client-log` へ送信
- [ ] 成功条件: 2秒KPIの達成率を日次で可視化可能（集計クエリは `DEPLOY.md` に整備済み、ダッシュボード未整備）

### Pivot Readiness
- [x] ピボット規模は `30-50%` を想定。
- [x] 次段で以下へ移行できる設計を維持:
- [ ] データ構造: 単一案から `candidates[]` へ
- [ ] UI: 縦導線から横比較テーブルへ
- [ ] KPI: 生成完了から比較完了（栞化）へ
