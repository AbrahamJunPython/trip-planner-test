# Log Design Audit (2026-02-15)

## Scope
- `app/page.tsx`
- `app/plan/page.tsx`
- `app/chat/page.tsx`
- `app/task/page.tsx`
- `app/result/page.tsx`
- `app/api/client-log/route.ts`
- `app/api/chat/route.ts`
- `app/api/ogp/route.ts`
- `app/api/geocode/route.ts`
- `app/api/classify-place/route.ts`
- `app/lib/logger.ts`

---

## Summary
- 指示①: **一部適合 (Partial)**
- 指示②: **未適合 (Not Met)**
- 指示③: **一部適合 (Partial)**

---

## 指示①
> 「ログは“後から1セッションを完全再現できる”形。最低限、全イベントに `session_id` と `event_type` を必ず付与し、`question_shown / answer / result_shown / click` を同一 `session_id` で接続可能に」

### 現状
- `eventType` は `/api/client-log` で必須検証される:
  - `app/api/client-log/route.ts:7`
  - `app/api/client-log/route.ts:59`
- `session_id`/`user_id`/`device_id` は各ページの client-log 送信時に付与:
  - `app/page.tsx:49`
  - `app/plan/page.tsx:221`
  - `app/chat/page.tsx:121`
  - `app/task/page.tsx:58`
- ただし `question_shown / answer / result_shown` のイベントタイプは未定義:
  - `app/api/client-log/route.ts:8`
- `result` ページでは `page_view` や `click` の client-log 送信実装がない:
  - `app/result/page.tsx:123` 以降に `sendClientLog` 相当なし

### 判定
- **Partial**
- 理由:
  - 一部ページでは `session_id + eventType` で追跡可能
  - ただし「全ページ」「指定イベントセット (`question_shown / answer / result_shown / click`)」は未達
  - 1セッション完全再現の最小要件としては不足

---

## 指示②
> 「外部リンクは必ず自前の `/go/{offer_id}` 経由。遷移前に `click` 記録後、302リダイレクト。`offer_id` と `session_id` を保持」

### 現状
- `/go/{offer_id}` ルートが存在しない:
  - `app/api` 配下に `go` ルートなし（調査時点）
- 外部遷移は直接リンク/`window.open`:
  - `app/task/page.tsx:158` (`href={task.url}`)
  - `app/chat/page.tsx:324` (`window.open(googleUrl, "_blank")`)
  - `app/result/page.tsx:500` (`href={it.url}`)
  - `app/result/page.tsx:517` (`window.open(...)`)
- `reservation_click` ログはあるが、`offer_id` 概念は未導入:
  - `app/chat/page.tsx:313`
  - `app/task/page.tsx:164`

### 判定
- **Not Met**
- 理由:
  - `/go/{offer_id}` 経由 + 302 の導線が未実装
  - `offer_id` と `session_id` を同時に保証するサーバーログ基盤が未整備

---

## 指示③
> 「初回レスポンス2秒以内をKPI。重い処理（OGP取得・詳細生成など）はレスポンス後に回し、先にプレースホルダー返却」

### 現状
- KPIとして「初回2秒以内」を計測・判定する専用イベント/メトリクスは未実装
- slow判定ログは追加済み（`duration_ms` + 閾値）:
  - `app/api/chat/route.ts:270`
  - `app/api/ogp/route.ts:295`
  - `app/api/geocode/route.ts:116`
  - `app/api/classify-place/route.ts:97`
  - `app/api/client-log/route.ts:93`
- `/api/chat` はOpenAI応答を待ってからレスポンスする同期構造:
  - `app/api/chat/route.ts:225` 以降
  - プレースホルダー先返しAPIにはなっていない
- 一方、`plan` の OGP/classify/geocode は UI 操作後に非同期で走るため、ページ初期描画を完全にはブロックしない:
  - `app/plan/page.tsx:447` 以降

### 判定
- **Partial**
- 理由:
  - slow観測はあるが、KPI運用（2秒SLO達成監視）としては未完成
  - 重処理を「レスポンス後に更新するジョブ型」に統一できていない

---

## Gap List (actionable)
1. `eventType` を追加:
   - `question_shown`, `answer`, `result_shown`, `click`
2. `app/result/page.tsx` に `page_view` と `click` ログ導線を追加
3. `/api/go/[offer_id]` を実装:
   - 受信時に `offer_id`, `session_id`, `target_url` を記録
   - 記録後 `302` リダイレクト
4. 外部リンクを `/go/{offer_id}` に置換:
   - `chat/task/result` 全て
5. 初回2秒KPIの明示計測:
   - `ttfb_ms` または `first_response_ms` をイベント化
6. 重処理の後段化:
   - `/api/chat` などを「先に placeholder、後で更新」の2段階フローへ

---

## Notes
- 現在のAWS転送は、`/api/client-log` の主要イベント + `warn/error` を中心に設計済み。
- ただし、上記3指示を完全準拠させるには、イベント語彙の拡張と `/go` 経由設計が必須。

