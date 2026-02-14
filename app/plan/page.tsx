"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import type { Ogp } from "../types";
import { DayPicker } from "react-day-picker";
import { differenceInCalendarDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useDebounce } from "../components/useDebounce";
import { searchDepartCandidates } from "../lib/departSearch";
import LoadingScreen from "../components/LoadingScreen";

/* =====================
 * types
 ===================== */
type Companion =
  | "一人旅"
  | "カップル"
  | "友達同士"
  | "子供連れ"
  | "大人だけの家族旅行"
  | "その他";

type Budget =
  | "出費を最低限に抑えた旅行"
  | "安く抑えつつ旅先を満喫"
  | "出し惜しみせずに旅先を堪能"
  | "ちょっぴり贅沢で特別な旅行"
  | "高級なラグジュアリー旅行";

type DepartMode = "station" | "postal";

type Range = DateRange;

type GeneratePayload = {
  tripName: string;
  depart: {
    type: string;
    value: string;
  };
  destination:
    | string
    | { title?: string; description?: string; url: string }[];
  startDate: string;
  endDate: string | null;
  people: number | null;
  companion: Companion | null;
  budget: Budget | null;
  gender: string | null;
  age: string | null;
};

// 生成APIの返却（例）
type ItineraryResponse = {
  tripName: string;
  summary: string; // 1〜2行
  days: Array<{
    dayIndex: number;        // 1,2,3...
    date?: string | null;    // "2026-02-07" など（任意）
    title?: string | null;   // "京都王道"みたいな
    items: Array<{
      kind: "move" | "visit" | "food" | "hotel" | "other";
      title: string;               // "伏見稲荷大社"
      detail?: string | null;      // "2〜3時間 / 混雑回避..." など
      durationMin?: number | null; // 120
      costYenPerPerson?: number | null;
      url?: string | null;
      place?: {
        name?: string | null;
        lat?: number | null;
        lng?: number | null;
      } | null;
      time?: { start?: string | null; end?: string | null } | null; // "09:30"
    }>;
  }>;
  warnings?: string[];
};

/* =====================
 * component
 ===================== */
export default function PlanPage() {
  const router = useRouter();
  const sp = useSearchParams();

  /* =====================
   * state
   ===================== */
  const [tripName, setTripName] = useState("新しい旅行");

  const [destinationText, setDestinationText] = useState("");
  const [ogpUrls, setOgpUrls] = useState<string[]>([]);
  const [ogpItems, setOgpItems] = useState<Ogp[]>([]);
  const [classifiedPlaces, setClassifiedPlaces] = useState<Array<{url: string; category: string; name: string; address: string}>>([]);
  const [departCoords, setDepartCoords] = useState<{lat: number; lon: number} | null>(null);
  
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [range, setRange] = useState<Range | undefined>(undefined);
  const tripDays = null;
  const startDate = format(new Date(), "yyyy-MM-dd");
  const endDate = "";

  const [people, setPeople] = useState<number | "">("");
  const [companion, setCompanion] = useState<Companion | "">("");
  const [budget, setBudget] = useState<Budget | "">("");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);
  
  const [departMode, setDepartMode] = useState<DepartMode>("postal");
  const [departInput, setDepartInput] = useState("");
  const [departSelected, setDepartSelected] = useState<string | null>(null);
  const [departCandidates, setDepartCandidates] = useState<string[]>([]);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"premise" | "rules" | "format" | "slow">("premise");

  const debouncedDepartInput = useDebounce(departInput, 300);
  const inputClass = "mt-1 w-full rounded-2xl border border-gray-200 p-3 bg-white";
  const selectedClass = "mt-1 w-full rounded-2xl border border-gray-200 p-3 bg-white font-bold text-emerald-500";

  /* =====================
   * 行き先URL管理
   ===================== */
  const [newUrl, setNewUrl] = useState("");

  /* =====================
   * プリフェッチ実装
   ===================== */
  const debouncedUrl = useDebounce(newUrl, 500);
  
  useEffect(() => {
    if (!debouncedUrl || !debouncedUrl.startsWith('http')) return;
    
    // バックグラウンドでOGP取得開始（結果は使わない）
    fetch('/api/ogp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [debouncedUrl] })
    }).catch(() => {});
  }, [debouncedUrl]);

  const addDestinationUrl = async () => {
    if (!newUrl.trim()) return;
    
    const url = newUrl.trim();
    if (ogpUrls.includes(url)) return;
    
    setOgpUrls(prev => [...prev, url]);
    setNewUrl("");
  };

  const removeDestinationUrl = (urlToRemove: string) => {
    setOgpUrls(prev => prev.filter(url => url !== urlToRemove));
    setOgpItems(prev => prev.filter(item => item.url !== urlToRemove));
  };

  /* =====================
   * Load saved form data
   ===================== */
  useEffect(() => {
    const savedData = sessionStorage.getItem("trip_form_data");
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        setTripName(data.tripName || "新しい旅行");
        setDestinationText(data.destinationText || "");
        setOgpUrls(data.ogpUrls || []);
        if (data.range) {
          setRange({
            from: data.range.from ? new Date(data.range.from) : undefined,
            to: data.range.to ? new Date(data.range.to) : undefined
          });
        }
        setPeople(data.people || "");
        setCompanion(data.companion || "");
        setBudget(data.budget || "");
        setGender(data.gender || "");
        setAge(data.age || "");
        setShowDetails(data.showDetails || false);
        setDepartMode(data.departMode || "postal");
        setDepartSelected(data.departSelected || null);
        setDepartCoords(data.departCoords || null);
      } catch {
        // ignore
      }
    }
  }, []);
  useEffect(() => {
    const incoming = sp.getAll("url");
    if (incoming.length === 0) return;
    setOgpUrls(Array.from(new Set(incoming)));
  }, [sp]);

  /* =====================
   * OGP fetch & classify (並列処理最適化)
   ===================== */
  useEffect(() => {
    if (ogpUrls.length === 0) return;

    (async () => {
      try {
        const res = await fetch("/api/ogp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: ogpUrls }),
        });
        if (!res.ok) throw new Error('OGP取得に失敗しました');
        const data = await res.json().catch(() => ({ results: [] }));
        setOgpItems(data.results ?? []);
        
        // ✅ 並列処理: 全URLを同時にclassify
        const classified = await Promise.all(
          (data.results ?? []).map(async (item: Ogp) => {
            try {
              const classRes = await fetch("/api/classify-place", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: item.title,
                  description: item.description,
                  url: item.url
                })
              });
              const classData = await classRes.json();
              return {
                url: item.url,
                category: classData.category || "visit",
                name: classData.name || item.title || "",
                address: classData.address || ""
              };
            } catch {
              return {
                url: item.url,
                category: "visit",
                name: item.title || "",
                address: ""
              };
            }
          })
        );
        setClassifiedPlaces(classified);
      } catch (error) {
        console.error('OGP fetch error:', error);
        setOgpItems([]);
      }
    })();
  }, [ogpUrls]);

  /* =====================
   * 出発地 候補検索
   ===================== */
  useEffect(() => {
    if (!debouncedDepartInput) {
      setDepartCandidates([]);
      return;
    }
    setDepartCandidates(
      searchDepartCandidates(departMode, debouncedDepartInput)
    );
  }, [debouncedDepartInput, departMode]);

  const handleCancel = () => {
    setIsGenerating(false);
  };

  /* =====================
   * 現在地取得
   ===================== */
  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      alert("お使いのブラウザは位置情報に対応していません");
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `/api/reverse-geocode?lat=${latitude}&lon=${longitude}`
          );
          
          if (res.ok) {
            const data = await res.json();
            if (data.address) {
              const addr = data.address;
              const postal = addr.postcode || "";
              const city = addr.city || addr.town || addr.village || "";
              const state = addr.state || "";
              
              if (postal) {
                const location = `${postal} ${state}${city}`;
                setDepartMode("postal");
                setDepartSelected(location);
                setDepartCoords({ lat: latitude, lon: longitude });
              } else {
                alert("郵便番号の取得に失敗しました");
              }
            } else {
              alert("住所情報の取得に失敗しました");
            }
          } else {
            console.warn("reverse-geocode failed", await res.text());
            alert("位置情報の取得に失敗しました");
          }
        } catch (err) {
          console.error("Location error:", err);
          alert("位置情報の取得に失敗しました");
        } finally {
          setIsGettingLocation(false);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        alert("位置情報の取得が拒否されました");
        setIsGettingLocation(false);
      }
    );
  };

  /* =====================
   * can generate
   ===================== */
  const canGenerate =
    departSelected &&
    (ogpItems.length > 0 || destinationText);

  /* =====================
   * generate
   ===================== */
  async function generate() {
    if (!canGenerate) return;

    setIsGenerating(true);
    setLoadingPhase("premise");

    // 旅行日数を計算
    let calculatedTripDays = 1;
    let calculatedStayDays = 0;
    
    console.log("[generate] Sending to calculate-trip-days:", { departCoords, classifiedPlaces });
    
    try {
      const calcRes = await fetch("/api/calculate-trip-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departCoords, classifiedPlaces })
      });
      const calcData = await calcRes.json();
      console.log("[generate] Received from calculate-trip-days:", calcData);
      calculatedTripDays = calcData.tripDays || 1;
      calculatedStayDays = calcData.stayDays || 0;
    } catch (err) {
      console.error("[generate] calculate-trip-days error:", err);
      calculatedTripDays = 1;
      calculatedStayDays = 0;
    }

    const payload = {
      tripName,
      depart: {
        type: departMode,
        value: departSelected,
        coords: departCoords
      },
      destination:
        ogpItems.length > 0
          ? ogpItems.map(({ title, description, url }) => ({
              title,
              description,
              url,
            }))
          : destinationText,
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: null,
      tripDays: calculatedTripDays,
      stayDays: calculatedStayDays,
      people: people || null,
      companion: companion || null,
      budget: budget || null,
      gender: gender || null,
      age: age || null,
      classifiedPlaces,
    };

    try {
      // Save form data before generating
      const formData = {
        tripName,
        destinationText,
        ogpUrls,
        range: range ? {
          from: range.from?.toISOString(),
          to: range.to?.toISOString()
        } : null,
        people,
        companion,
        budget,
        gender,
        age,
        showDetails,
        departMode,
        departSelected,
        departCoords
      };
      sessionStorage.setItem("trip_form_data", JSON.stringify(formData));

      console.log("[generate] departCoords:", departCoords);

      // Try fast preset API first
      const phaseTimer1 = setTimeout(() => setLoadingPhase("rules"), 1000);
      const phaseTimer2 = setTimeout(() => setLoadingPhase("format"), 2000);
      const phaseTimer3 = setTimeout(() => setLoadingPhase("slow"), 4000);

      let res = await fetch("/api/generate-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
      });

      // If preset fails, fallback to regular API
      if (!res.ok) {
        res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
      }

      clearTimeout(phaseTimer1);
      clearTimeout(phaseTimer2);
      clearTimeout(phaseTimer3);

      const data = await res.json().catch(() => null);

      if (!res.ok) {
          const msg = data?.error ? data.error : "プラン生成に失敗しました";
          throw new Error(msg);
      }

      if (!data?.itinerary) {
          throw new Error(data?.error || "生成結果が空でした");
      }

      sessionStorage.setItem("trip_result_json", JSON.stringify(data.itinerary));
      sessionStorage.removeItem("trip_result_text");
      router.push("/result");
    } catch (error) {
      console.error("Generate error:", error);
      alert(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setIsGenerating(false);
    }
  }

  /* =====================
   * UI
   ===================== */
  return (
    <>
      <LoadingScreen 
        open={isGenerating} 
        phase={loadingPhase} 
        onCancel={handleCancel} 
      />
      <main className="min-h-screen bg-white px-4">
      <div className="max-w-[820px] mx-auto">
        {/* logo */}
        <div className="pb-4 flex justify-center">
          <Image
            src="/cocoico-ai.png"
            alt="cocoico"
            width={140}
            height={140}
            priority
          />
        </div>

        <div className="space-y-8">
          {/* =====================
              出発地
             ===================== */}
          <div>
            <span className="text-sm font-bold">出発地</span>
            {/* 現在地取得ボタン */}
            <button
              type="button"
              onClick={getCurrentLocation}
              disabled={isGettingLocation}
              className="mt-2 w-full py-2 px-4 bg-emerald-500 text-white rounded-2xl text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2"
              aria-label="現在地から出発地を設定"
            >
              {isGettingLocation ? "取得中..." : "📍 現在地から設定"}
            </button>
            {/* タブ */}
            <div className="mt-2 flex rounded-2xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setDepartMode("postal");
                  setDepartInput("");
                  setDepartSelected(null);
                }}
                className={`flex-1 py-2 text-sm font-bold ${
                  departMode === "postal"
                    ? "bg-emerald-300 text-white"
                    : "bg-white text-gray-600"
                }`}
              >
                郵便番号
              </button>
              <button
                type="button"
                onClick={() => {
                  setDepartMode("station");
                  setDepartInput("");
                  setDepartSelected(null);
                }}
                className={`flex-1 py-2 text-sm font-bold ${
                  departMode === "station"
                    ? "bg-emerald-300 text-white"
                    : "bg-white text-gray-600"
                }`}
              >
                最寄駅
              </button>
            </div>

            {/* 入力 or 確定表示 */}
            {departSelected ? (
                <div className="mt-2 flex items-center gap-2">
                    <div className={selectedClass}>{departSelected}</div>
                    <button
                    type="button"
                    onClick={() => {
                        setDepartSelected(null);
                        setDepartInput("");
                        setDepartCoords(null);
                    }}
                    className="h-8 w-10 text-xs text-white bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center"
                    >
                    変更
                    </button>
                </div>
            ) : (
              <div className="relative">
                <input
                  value={departInput}
                  onChange={(e) => setDepartInput(e.target.value)}
                  placeholder={
                    departMode === "station"
                      ? "例：東京駅　*現在はJR山手線のみ対応"
                      : "例：1500001 *半角数字7桁"
                  }
                  className={`${inputClass} mt-2`}
                />

                {/* 候補 */}
                {departCandidates.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-xl border bg-white shadow">
                    {departCandidates.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setDepartSelected(c);
                          setDepartCandidates([]);
                        }}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* =====================
              行き先
             ===================== */}
          <div>
            <span className="text-sm font-bold">行き先</span>

            {/* URL追加入力 */}
            <div className="mt-2 flex gap-2">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="URLを追加（例：https://example.com）"
                className="flex-1 rounded-2xl border border-gray-200 p-3 bg-white text-sm"
              />
              <button
                type="button"
                onClick={addDestinationUrl}
                className="px-4 py-2 bg-emerald-500 text-white rounded-2xl text-sm font-bold hover:bg-emerald-600"
                aria-label="行き先URLを追加"
              >
                追加
              </button>
            </div>

            {ogpItems.length > 0 ? (
              <div className="mt-1 space-y-1">
                {classifiedPlaces.map((place) => (
                  <PlaceCard key={place.url} place={place} onRemove={() => removeDestinationUrl(place.url)} />
                ))}
              </div>
            ) : (
              <input
                value={destinationText}
                onChange={(e) => setDestinationText(e.target.value)}
                placeholder="行先 - 未定"
                className={destinationText ? selectedClass : inputClass}
              />
            )}
          </div>

          {/* =====================
              詳細情報トグル
             ===================== */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full h-10 rounded-2xl p-3 bg-emerald-500 hover:bg-gray-500 text-sm font-bold text-white flex items-center justify-between"
          >
            <span>カスタマイズ</span>
            <span className="text-xl">{showDetails ? "▲" : "▼"}</span>
          </button>

          {/* =====================
              詳細情報（折り畳み）
             ===================== */}
          {showDetails && (
            <div className="space-y-8">
              {/* 性別・年齢 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-bold">あなたの性別</span>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={gender ? selectedClass : inputClass}
                  >
                    <option value="">無回答</option>
                    <option value="男性">男性</option>
                    <option value="女性">女性</option>
                  </select>
                </div>
                <div>
                  <span className="text-sm font-bold">あなたの年齢</span>
                  <select
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className={age ? selectedClass : inputClass}
                  >
                    <option value="">無回答</option>
                    <option value="10代">10代</option>
                    <option value="20代">20代</option>
                    <option value="30代">30代</option>
                    <option value="40代">40代</option>
                    <option value="50代">50代</option>
                    <option value="60代">60代</option>
                    <option value="70代">70代</option>
                  </select>
                </div>
              </div>

              {/*人数*/}
              <div>
                <span className="text-sm font-bold">人数</span>
                <select
                  value={people}
                  onChange={(e) =>
                    setPeople(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className={people ? selectedClass : inputClass}
                >
                  <option value="">人数 - 未定</option>
                  {Array.from({ length: 9 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}人
                    </option>
                  ))}
                  <option value={10}>10人以上</option>
                </select>
              </div>

              {/* =====================
                  同行者
                 ===================== */}
              <div>
                <span className="text-sm font-bold">同行者</span>
                <select
                  value={companion}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "一人旅" || val === "カップル" || val === "友達同士" || val === "子供連れ" || val === "大人だけの家族旅行" || val === "その他") {
                      setCompanion(val === "" ? "" : val);
                    }
                  }}
                  className={companion ? selectedClass : inputClass}
                >
                  <option value="">同行者 - 未定</option>
                  <option value="一人旅">一人旅</option>
                  <option value="カップル">カップル</option>
                  <option value="友達同士">友達同士</option>
                  <option value="子供連れ">子供連れ</option>
                  <option value="大人だけの家族旅行">大人だけの家族旅行</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              {/* =====================
                  予算感
                 ===================== */}
              <div>
                <span className="text-sm font-bold">予算感</span>
                <select
                  value={budget}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "出費を最低限に抑えた旅行" || val === "安く抑えつつ旅先を満喫" || val === "出し惜しみせずに旅先を堪能" || val === "ちょっぴり贅沢で特別な旅行" || val === "高級なラグジュアリー旅行") {
                      setBudget(val === "" ? "" : val);
                    }
                  }}
                  className={budget ? selectedClass : inputClass}
                >
                  <option value="">予算 - 未定</option>
                  <option value="出費を最低限に抑えた旅行">
                    1 - 出費を最低限に抑えた旅行
                  </option>
                  <option value="安く抑えつつ旅先を満喫">
                    2 - 安く抑えつつ旅先を満喫
                  </option>
                  <option value="出し惜しみせずに旅先を堪能">
                    3 - 出し惜しみせずに旅先を堪能
                  </option>
                  <option value="ちょっぴり贅沢で特別な旅行">
                    4 - ちょっぴり贅沢で特別な旅行
                  </option>
                  <option value="高級なラグジュアリー旅行">
                    5 - 高級なラグジュアリー旅行
                  </option>
                </select>
              </div>
            </div>
          )}

          {/* =====================
              Chat & Generate
             ===================== */}
          <div className="space-y-2">
            <button
              onClick={() => {
                // Save context before navigating to chat
                const formData = {
                  tripName,
                  destinationText,
                  ogpUrls,
                  ogpItems,
                  classifiedPlaces,
                  departSelected,
                  departMode,
                  people,
                  companion,
                  budget,
                  gender,
                  age,
                  showDetails
                };
                sessionStorage.setItem("trip_form_data", JSON.stringify(formData));
                router.push("/chat");
              }}
              disabled={!departSelected || classifiedPlaces.length === 0}
              className="w-full rounded-2xl bg-blue-500 text-white py-4 font-bold disabled:opacity-40 hover:bg-blue-600"
            >
              💬 AIと相談する
            </button>
            <button
              onClick={generate}
              disabled={!canGenerate}
              className="w-full rounded-2xl bg-orange-400 text-white py-4 font-bold disabled:opacity-40"
              aria-label="旅行プランを生成"
            >
              ラフプラン生成
            </button>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

/* =====================
 * Place Card
 ===================== */
function PlaceCard({ place, onRemove }: { place: {url: string; category: string; name: string; address: string}; onRemove: () => void }) {
  const iconMap: Record<string, string> = {
    visit: "📍",
    food: "🍜",
    hotel: "🛌",
    move: "🚃"
  };
  
  return (
    <a
      href={place.url}
      target="_blank"
      rel="noreferrer"
      className="border border-gray-200 rounded-2xl p-3 flex items-center gap-3 bg-white hover:bg-gray-50 transition-colors relative"
    >
      <div className="text-xl">{iconMap[place.category] || "📍"}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{place.name}</div>
        {place.address && (
          <div className="text-xs text-gray-500 truncate">{place.address}</div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="text-xl text-red-500 hover:text-red-700 flex-shrink-0 p-1 z-10"
      >
        ×
      </button>
    </a>
  );
}

/* =====================
 * OGP Card
 ===================== */
function OgpCard({ item, onRemove }: { item: Ogp; onRemove: () => void }) {
  return (
    <div className="border border-gray-200 rounded-2xl p-3 flex gap-3 bg-white">
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="w-14 h-14 rounded-xl object-cover"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{item.title}</div>
        {item.description && (
          <div className="text-sm text-gray-600 line-clamp-2">
            {item.description}
          </div>
        )}
        <div className="text-xs text-gray-400 truncate">{item.url}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-xl text-red-500 hover:text-red-700 flex-shrink-0 p-1"
      >
        ×
      </button>
    </div>
  );
}

