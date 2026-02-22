"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createItemIdFromUrl } from "../lib/item-tracking";

type Itinerary = {
  tripName: string;
  tripDays?: number;
  stayDays?: number;
  summary: string;
  budgetPerPerson?: number;
  days: Array<{
    dayIndex: number;
    date?: string | null;
    title?: string | null;
    budgetPerPerson?: number;
    items: Array<{
      kind: "move" | "visit" | "food" | "hotel" | "other";
      title: string;
      detail?: string | null;
      durationMin?: number | null;
      url?: string | null;
      time?: { start?: string | null; end?: string | null } | null;
      budgetPerPerson?: number;
    }>;
  }>;
  warnings?: string[];
  _meta?: any; // stageなどが来ても落ちないように
};

type FillKind = "visit" | "food" | "hotel" | "move";

type FillRequest = {
  dayIndex: number;
  kind: FillKind;
  areaTitle: string;
  departLabel: string;
  outlineTitle: string;
  prevTitle: string | null;
  nextTitle: string | null;
  destinationHint: string;
  optional: string;
  previousVisits?: string; // 過去の訪問地履歴
  tripDays?: number; // 旅行の総日数
};

function safeString(v: any): string {
  return typeof v === "string" ? v : "";
}

function safeNumber(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function loadPlanInputFromSession(): any | null {
  try {
    const raw = sessionStorage.getItem("trip_form_data"); // ★ plan側保存キー
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildHintsFromPlanInput(planInput: any | null) {
  const departMode = planInput?.departMode; // "postal" | "station" 等
  const departSelected = planInput?.departSelected;

  const departLabel =
    departMode === "station"
      ? `最寄駅:${departSelected ?? ""}`
      : departMode === "postal"
      ? `郵便番号:${departSelected ?? ""}`
      : `出発地:${departSelected ?? ""}`;

  const destinationText = typeof planInput?.destinationText === "string" ? planInput.destinationText : "";
  const ogpUrls = Array.isArray(planInput?.ogpUrls) ? planInput.ogpUrls : [];

  const destinationHint = [
    destinationText ? `TEXT:${destinationText}` : "",
    ogpUrls.length ? `URLS:\n${ogpUrls.slice(0, 8).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const optionalLines: string[] = [];
  if (planInput?.people) optionalLines.push(`people=${planInput.people}`);
  if (planInput?.companion) optionalLines.push(`companion=${planInput.companion}`);
  if (planInput?.budget) optionalLines.push(`budget=${planInput.budget}`);
  if (planInput?.gender) optionalLines.push(`gender=${planInput.gender}`);
  if (planInput?.age) optionalLines.push(`age=${planInput.age}`);

  return {
    departLabel: departLabel || "出発地",
    destinationHint: destinationHint || "",
    optional: optionalLines.length ? optionalLines.join("\n") : "none",
  };
}

async function callFill(req: FillRequest) {
  const r = await fetch("/api/fill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(j?.error || `fill failed: ${r.status}`);
  }
  return j?.item as Itinerary["days"][number]["items"][number];
}

function computeDayBudget(day: Itinerary["days"][number]) {
  return day.items.reduce((s, x) => s + (safeNumber(x.budgetPerPerson) ?? 0), 0);
}

function computeTripBudget(it: Itinerary) {
  return it.days.reduce((s, d) => s + (safeNumber(d.budgetPerPerson) ?? computeDayBudget(d)), 0);
}

export default function ResultPage() {
  const router = useRouter();

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isEditingTripName, setIsEditingTripName] = useState(false);
  const [editedTripName, setEditedTripName] = useState("");

  const [fillErrors, setFillErrors] = useState<string[]>([]);
  const hasLoggedPageViewRef = useRef(false);
  const hasLoggedImpressionRef = useRef(false);
  const renderStartMsRef = useRef<number | null>(null);

  const createId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const ensureId = (storage: Storage, key: string) => {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = createId();
    storage.setItem(key, created);
    return created;
  };

  const buildGoUrl = (offerId: string, targetUrl: string, itemId: string) => {
    let sessionId: string | null = null;
    let userId: string | null = null;
    let deviceId: string | null = null;
    let flowId: string | null = null;
    if (typeof window !== "undefined") {
      sessionId = ensureId(sessionStorage, "analytics_session_id");
      userId = ensureId(localStorage, "analytics_user_id");
      deviceId = ensureId(localStorage, "analytics_device_id");
      flowId = sessionStorage.getItem("plan_flow_id");
    }
    const q = new URLSearchParams();
    q.set("target", targetUrl);
    if (sessionId) q.set("session_id", sessionId);
    if (userId) q.set("user_id", userId);
    if (deviceId) q.set("device_id", deviceId);
    if (flowId) q.set("flow_id", flowId);
    q.set("item_id", itemId);
    q.set("page", "/result");
    return `/go/${encodeURIComponent(offerId)}?${q.toString()}`;
  };

  const sendClientLog = (payload: {
    event_type: "page_view" | "ui_impression" | "reservation_click";
    page: string;
    targetUrl?: string;
    metadata?: Record<string, unknown>;
  }) => {
    let sessionId: string | null = null;
    let userId: string | null = null;
    let deviceId: string | null = null;
    let flowId: string | null = null;
    if (typeof window !== "undefined") {
      sessionId = ensureId(sessionStorage, "analytics_session_id");
      userId = ensureId(localStorage, "analytics_user_id");
      deviceId = ensureId(localStorage, "analytics_device_id");
      flowId = sessionStorage.getItem("plan_flow_id");
    }

    const body = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      session_id: sessionId,
      user_id: userId,
      device_id: deviceId,
      flow_id: flowId,
    });

    try {
      void fetch("/api/client-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    } catch {
      // ignore logging errors on UI path
    }
  };

  const header = useMemo(() => {
    if (!itinerary) return null;
    const totalDays = itinerary.days?.length ?? 0;
    const start = itinerary.days?.[0]?.date ?? null;
    const end = itinerary.days?.[itinerary.days.length - 1]?.date ?? null;
    return { totalDays, start, end };
  }, [itinerary]);

  const normalizeFilledTitle = (
    kind: "move" | "visit" | "food" | "hotel",
    filledTitle: string | undefined,
    areaTitle: string,
    prevTitle: string | null,
    nextTitle: string | null
    ) => {
    const t = (filledTitle ?? "").trim();
      if (t) return t;
        // フォールバック（空だったら強制でそれっぽい表記にする）
        if (kind === "food") return `食事（${areaTitle}）`;
        if (kind === "hotel") return `宿泊（${areaTitle}）`;
        if (kind === "visit") return `観光（${areaTitle}）`;
        // move
        const a = (prevTitle ?? areaTitle).trim();
        const b = (nextTitle ?? areaTitle).trim();
        return `${a}→${b}（移動）`;
    };

  async function fillOneDaySequential(dayIndex: number, baseSnapshot: Itinerary) {
    const day = baseSnapshot.days.find((d) => d.dayIndex === dayIndex);
    if (!day) return;

    const planInput = loadPlanInputFromSession();
    const hints = buildHintsFromPlanInput(planInput);

    const visitTitle = day.items.find((x) => x.kind === "visit")?.title ?? "";
    const areaTitle = (visitTitle || safeString(day.title) || "周辺エリア").trim();

    // 過去の訪問地履歴を収集
    const previousVisits = baseSnapshot.days
      .filter(d => d.dayIndex < dayIndex)
      .flatMap(d => d.items.filter(it => it.kind === "visit" || it.kind === "food"))
      .map(it => it.title)
      .filter(Boolean)
      .join(", ");

    // ★ 予算確定が目的なら、まずはこの3つでOK（moveまで埋めたければ後で追加）
    const orderedKinds: FillKind[] = ["visit", "food", "hotel", "move"];

    for (const kind of orderedKinds) {
      const idx = day.items.findIndex((it) => it.kind === kind);
      if (idx < 0) continue;

      const prevTitle = idx > 0 ? day.items[idx - 1]?.title ?? null : null;
      const nextTitle = idx < day.items.length - 1 ? day.items[idx + 1]?.title ?? null : null;

      const req: FillRequest = {
        dayIndex,
        kind,
        areaTitle,
        departLabel: hints.departLabel,
        outlineTitle: day.items[idx]?.title ?? "",
        prevTitle,
        nextTitle,
        destinationHint: hints.destinationHint,
        optional: hints.optional,
        previousVisits: previousVisits || undefined,
        tripDays: baseSnapshot.days.length,
      };

      try {
        const filled = await callFill(req);

        // ★ 返ってきた都度、予算を再計算して保存
        setItinerary((prev) => {
          if (!prev) return prev;

          const copy: Itinerary = JSON.parse(JSON.stringify(prev));
          const d = copy.days.find((x) => x.dayIndex === dayIndex);
          if (!d) return prev;

          const cur = d.items[idx];
          if (!cur) return prev;

          const prevTitle2 = idx > 0 ? d.items[idx - 1]?.title ?? null : null;
          const nextTitle2 = idx < d.items.length - 1 ? d.items[idx + 1]?.title ?? null : null;

          d.items[idx] = {
            ...cur,
            ...filled,
            kind: cur.kind,
            title: normalizeFilledTitle(cur.kind as "move" | "visit" | "food" | "hotel", filled?.title, areaTitle, prevTitle2, nextTitle2),
          };

          // visit が埋まった瞬間に Dayタイトルもリッチ化
          if (cur.kind === "visit" && (!d.title || d.title.trim() === "")) {
            d.title = d.items[idx].title;
          }

          // 予算を更新
          d.budgetPerPerson = computeDayBudget(d);
          copy.budgetPerPerson = computeTripBudget(copy);

          return copy;
        });
      } catch (e: any) {
        setFillErrors((prev) => [...prev, `Day${dayIndex} ${kind}の詳細生成に失敗: ${e?.message ?? "unknown"}`]);
      }
    }
  }

  const [fillStage, setFillStage] = useState<{ running: boolean; currentDay: number | null }>({
    running: false,
    currentDay: null,
  });  

  async function fillAllDaysSequentially(initial: Itinerary) {
    if (!initial?.days?.length) return;

    setFillStage({ running: true, currentDay: 1 });

    // Day1 → Day2 → ... の順で順次
    for (let dayIndex = 1; dayIndex <= initial.days.length; dayIndex++) {
      setFillStage({ running: true, currentDay: dayIndex });

      // その時点の itinerary で次の day の areaTitle 等が変わるので、
      // “最新の state” を使いたいが、setStateは非同期なので簡易に snapshot を取り直す
      // → ここでは sessionStorage/URL の initial を基準にしつつ、最低限埋める
      await fillOneDaySequential(dayIndex, initial);
    }

    setFillStage({ running: false, currentDay: null });
  }

  /* =====================
   * Load itinerary (shared URL or sessionStorage)
   * then immediately start Day1 fill
   ===================== */
  useEffect(() => {
    if (renderStartMsRef.current === null && typeof performance !== "undefined") {
      renderStartMsRef.current = performance.now();
    }
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get("id");
    const sharedData = urlParams.get("data");

    // 1) ID経由で読み込み
    if (shareId) {
      fetch(`/api/share?id=${shareId}`)
        .then(r => r.json())
        .then(({ data }) => {
          if (data?.days && Array.isArray(data.days)) {
            setItinerary(data as Itinerary);
            queueMicrotask(() => fillAllDaysSequentially(data as Itinerary));
          }
        })
        .catch(() => {});
      return;
    }

    // 2) 旧形式（dataパラメータ）
    if (sharedData) {
      try {
        const decoded = decodeURIComponent(
          atob(sharedData)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const parsed = JSON.parse(decoded);
        if (parsed?.days && Array.isArray(parsed.days)) {
          setItinerary(parsed as Itinerary);
          queueMicrotask(() => fillAllDaysSequentially(parsed as Itinerary));
          return;
        }
      } catch {}
    }

    // 3) sessionStorage
    const raw = sessionStorage.getItem("trip_result_json");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.days || !Array.isArray(parsed.days)) return;
      setItinerary(parsed as Itinerary);
      queueMicrotask(() => fillAllDaysSequentially(parsed as Itinerary));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasLoggedPageViewRef.current) return;
    hasLoggedPageViewRef.current = true;
    sendClientLog({
      event_type: "page_view",
      page: "/result",
      metadata: {
        source: "result_page",
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!itinerary || hasLoggedImpressionRef.current) return;
    hasLoggedImpressionRef.current = true;

    const impressionId = "result_main";
    const kpiTargetMs = 2000;
    const totalItems = itinerary.days.reduce((sum, day) => sum + day.items.length, 0);

    const schedule =
      typeof window !== "undefined" && "requestAnimationFrame" in window
        ? window.requestAnimationFrame.bind(window)
        : (cb: FrameRequestCallback) => setTimeout(cb, 0);

    schedule(() => {
      const endMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const startMs = renderStartMsRef.current ?? endMs;
      const resultRenderMs = Math.max(0, Math.round(endMs - startMs));

      sendClientLog({
        event_type: "ui_impression",
        page: "/result",
        metadata: {
          impression_id: impressionId,
          result_render_ms: resultRenderMs,
          kpi_target_ms: kpiTargetMs,
          trip_days: itinerary.days.length,
          item_count: totalItems,
        },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary]);

  if (!itinerary) {
    return (
      <main className="min-h-screen bg-white px-4">
        <div className="max-w-[820px] mx-auto py-10">
          <div className="py-6 flex justify-center">
            <Image src="/cocoico-ai.png" alt="cocoico" width={200} height={200} priority />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-gray-600">結果がありません。先にプランを生成してください。</p>

            <button
              type="button"
              onClick={() => router.push("/plan")}
              className="mt-4 w-full rounded-2xl bg-emerald-500 text-white py-3 font-bold"
            >
              プラン入力に戻る
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4">
      <div className="max-w-[820px] mx-auto pb-14">
        {/* header */}
        <div className="flex items-start justify-between gap-3 pt-6">
          <div className="min-w-0">
            {isEditingTripName ? (
              <div className="flex items-center gap-2">
                <input
                  value={editedTripName}
                  onChange={(e) => setEditedTripName(e.target.value)}
                  className="text-xl font-extrabold bg-transparent border-b-2 border-emerald-500 outline-none"
                  autoFocus
                  onBlur={() => {
                    if (editedTripName.trim()) {
                      setItinerary(prev => prev ? {...prev, tripName: editedTripName.trim()} : prev);
                    }
                    setIsEditingTripName(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editedTripName.trim()) {
                        setItinerary(prev => prev ? {...prev, tripName: editedTripName.trim()} : prev);
                      }
                      setIsEditingTripName(false);
                    }
                  }}
                />
              </div>
            ) : (
              <h1 
                className="text-xl font-extrabold truncate cursor-pointer hover:text-emerald-600 transition-colors"
                onClick={() => {
                  setEditedTripName(itinerary?.tripName || "旅行プラン");
                  setIsEditingTripName(true);
                }}
                title="クリックして編集"
              >
                {itinerary.tripName || "旅行プラン"}
              </h1>
            )}

            {header?.totalDays ? (
              <div className="mt-1 text-xs text-gray-500">
                {itinerary.tripDays && itinerary.stayDays !== undefined
                  ? itinerary.tripDays === 1
                    ? "日帰り"
                    : `${itinerary.stayDays}泊${itinerary.tripDays}日`
                  : `${header.totalDays}日間`}
                {header.start ? ` / ${header.start}` : ""}
                {header.end && header.end !== header.start ? ` 〜 ${header.end}` : ""}
              </div>
            ) : null}

            {itinerary.budgetPerPerson ? (
              <div className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                予算：¥{itinerary.budgetPerPerson.toLocaleString()}/人
              </div>
            ) : null}
          </div>

          <button type="button" onClick={() => router.push("/plan")} className="shrink-0 hover:opacity-80 transition-opacity" aria-label="プラン入力に戻る">
            <Image src="/cocoico-ai_logo.png" alt="入力に戻る" width={60} height={60} priority />
          </button>
        </div>

        {itinerary.summary ? <p className="text-sm text-gray-600 mt-3 leading-relaxed">{itinerary.summary}</p> : null}

        {fillErrors.length ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="font-extrabold">一部の詳細生成に失敗しました</div>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {fillErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* warnings */}
        {itinerary.warnings?.length ? (
          <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-sm">
            <div className="font-extrabold text-yellow-800">注意</div>
            <ul className="list-disc pl-5 text-yellow-800 mt-1 space-y-0.5">
              {itinerary.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {fillStage.running ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            詳細を確定中…（Day{fillStage.currentDay} を更新しています）
          </div>
        ) : null}

        {/* days */}
        <div className="mt-6 space-y-4">
          {itinerary.days.map((d) => (
            <div key={d.dayIndex} className="rounded-2xl bg-white border-l-2 border-emerald-500 p-1">
              {/* Day Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {d.dayIndex}
                  </div>
                  {d.title ? <div className="text-sm font-bold text-gray-700">{d.title}</div> : null}
                  {d.date ? <div className="text-xs text-gray-500">{d.date}</div> : null}
                </div>
                {d.budgetPerPerson ? (
                  <div className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                    ¥{d.budgetPerPerson.toLocaleString()}/人
                  </div>
                ) : null}
              </div>

              {/* Items */}
              <div className="space-y-0.5">
                {d.items
                  .filter((it) => !(it.kind === "move" && it.durationMin && it.durationMin <= 60))
                  .map((it, idx) => (
                    <div key={idx} className="rounded-lg bg-gray-50 p-1.5">
                      <div className="flex items-start gap-3">
                        <div
                          className="shrink-0 mt-0.5 cursor-pointer hover:scale-110 transition-transform"
                          onClick={() => {
                            if (it.detail) {
                              const itemId = `${d.dayIndex}-${idx}`;
                              setExpandedItems((prev) => {
                                const newSet = new Set(prev);
                                if (newSet.has(itemId)) newSet.delete(itemId);
                                else newSet.add(itemId);
                                return newSet;
                              });
                            }
                          }}
                        >
                          <span className="text-lg">{iconFor(it.kind)}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-gray-900 break-words">{it.title}</div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              {it.budgetPerPerson ? (
                                <div className="text-sm font-bold text-emerald-600">
                                  ¥{it.budgetPerPerson.toLocaleString()}
                                </div>
                              ) : null}

                              <div className="flex gap-1">
                                {it.url ? (
                                  <a
                                    href={buildGoUrl(
                                      `result_item_${createItemIdFromUrl(it.url)}`,
                                      it.url,
                                      createItemIdFromUrl(it.url)
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => {
                                      const itemId = createItemIdFromUrl(it.url);
                                      const offerId = `result_item_${itemId}`;
                                      sendClientLog({
                                        event_type: "reservation_click",
                                        page: "/result",
                                        targetUrl: it.url,
                                        metadata: {
                                          offer_id: offerId,
                                          item_id: itemId,
                                          item_title: it.title,
                                          item_kind: it.kind,
                                          source: "result_item_link",
                                        },
                                      });
                                    }}
                                    className="w-6 h-6 flex items-center justify-center text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                    title="公式URLを開く"
                                    aria-label={`${it.title}の公式サイトを開く`}
                                  >
                                    🔗
                                  </a>
                                ) : null}

                                {((it.kind === "food" || it.kind === "hotel") ||
                                  (it.budgetPerPerson && it.budgetPerPerson >= 5000)) ? (
                                  <button
                                    onClick={() => {
                                      const query = encodeURIComponent(`${it.title} 予約`);
                                      const googleUrl = `https://www.google.com/search?q=${query}`;
                                      const itemId = createItemIdFromUrl(it.url || googleUrl);
                                      const offerId = `result_reserve_${itemId}`;
                                      sendClientLog({
                                        event_type: "reservation_click",
                                        page: "/result",
                                        targetUrl: googleUrl,
                                        metadata: {
                                          offer_id: offerId,
                                          item_id: itemId,
                                          item_title: it.title,
                                          item_kind: it.kind,
                                          source: "result_reserve_button",
                                        },
                                      });
                                      window.open(buildGoUrl(offerId, googleUrl, itemId), "_blank");
                                    }}
                                    className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded-md hover:bg-orange-200 font-medium"
                                    aria-label={`${it.title}を予約`}
                                  >
                                    予約
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {it.detail && expandedItems.has(`${d.dayIndex}-${idx}`) ? (
                            <div className="mt-2 text-xs text-gray-600 leading-relaxed">{it.detail}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* bottom actions */}
        <div className="mt-8">
          <button
            type="button"
            onClick={async () => {
              try {
                const lightData = {
                  ...itinerary,
                  days: itinerary.days.map(d => ({
                    ...d,
                    items: d.items.map(it => {
                      const { detail, ...rest } = it;
                      return rest;
                    })
                  }))
                };
                
                const res = await fetch("/api/share", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(lightData)
                });
                
                const { id } = await res.json();
                const shareUrl = `${window.location.origin}/result?id=${id}`;
                
                await navigator.clipboard.writeText(shareUrl);
                alert("共有用URLをコピーしました（24時間有効）");
              } catch (err) {
                console.error("Share failed:", err);
                alert("共有URLの生成に失敗しました。");
              }
            }}
            className="w-full rounded-2xl border border-gray-200 bg-white py-4 font-extrabold text-gray-800 hover:bg-gray-50"
          >
            共有用URLをコピー
          </button>

          <button
            type="button"
            onClick={() => router.push("/plan")}
            className="mt-3 w-full rounded-2xl bg-emerald-500 text-white py-4 font-extrabold hover:bg-emerald-600"
          >
            条件を変えて作り直す
          </button>
        </div>
      </div>
    </main>
  );
}

function iconFor(kind: Itinerary["days"][number]["items"][number]["kind"]) {
  switch (kind) {
    case "move":
      return "🚃";
    case "visit":
      return "📍";
    case "food":
      return "🍜";
    case "hotel":
      return "🛏️";
    default:
      return "🗂️";
  }
}
