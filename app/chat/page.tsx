"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createItemIdFromUrl, normalizeTrackUrl } from "../lib/item-tracking";

type ClassifiedPlace = {
  url: string;
  category: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
};

type PlaceWithInfo = ClassifiedPlace & {
  confirmed: boolean;
  isDisabled?: boolean;
  facilityName?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  officialUrl?: string;
  sourceUrl?: string;
  ogp?: any;
};

type IntegratedItem = {
  item_id: string;
  normalized_url: string;
  ogp: {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
    favicon: string | null;
    provider: string | null;
  };
  classify_place: {
    category: string | null;
    name: string | null;
    address: string | null;
  } | null;
  geocode: {
    latitude: number | null;
    longitude: number | null;
  } | null;
};

type ChatIntegratedContext = {
  schemaVersion: string;
  flowId: string | null;
  depart: {
    selected: string | null;
    mode: string | null;
    coords: { lat: number; lon: number } | null;
    locationInfo: {
      latitude: number | null;
      longitude: number | null;
      postcode: string | null;
      city: string | null;
      prefecture: string | null;
    } | null;
  };
  items: IntegratedItem[];
};

export default function ChatPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<PlaceWithInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<{
    depart: string | null;
    ogpItems: any[];
    integratedContext: ChatIntegratedContext | null;
  }>({ depart: null, ogpItems: [], integratedContext: null });
  const [tripName, setTripName] = useState("æ–°ã—ã„æ—…è¡Œ");
  const [isEditingTripName, setIsEditingTripName] = useState(false);
  const hasSentIntegratedContextRef = useRef(false);
  const hasLoggedPageViewRef = useRef(false);
  const lastQuestionItemIdRef = useRef<string | null>(null);
  const hasLoggedFirstResponseKpiRef = useRef(false);

  const sendClientLog = (payload: {
    event_type:
      | "page_view"
      | "reservation_click"
      | "question_shown"
      | "answer"
      | "click"
      | "kpi_first_response";
    page: string;
    targetUrl?: string;
    metadata?: Record<string, unknown>;
  }): { sessionId: string | null; userId: string | null; deviceId: string | null; flowId: string | null } => {
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
    return {
      sessionId,
      userId,
      deviceId,
      flowId,
    };
  };

  const buildGoUrl = (offerId: string, targetUrl: string, itemId: string) => {
    const sessionId =
      typeof window !== "undefined" ? sessionStorage.getItem("analytics_session_id") : null;
    const userId =
      typeof window !== "undefined" ? localStorage.getItem("analytics_user_id") : null;
    const deviceId =
      typeof window !== "undefined" ? localStorage.getItem("analytics_device_id") : null;
    const flowId = typeof window !== "undefined" ? sessionStorage.getItem("plan_flow_id") : null;
    const q = new URLSearchParams();
    q.set("target", targetUrl);
    if (sessionId) q.set("session_id", sessionId);
    if (userId) q.set("user_id", userId);
    if (deviceId) q.set("device_id", deviceId);
    if (flowId) q.set("flow_id", flowId);
    q.set("item_id", itemId);
    q.set("page", "/chat");
    return `/go/${encodeURIComponent(offerId)}?${q.toString()}`;
  };

  useEffect(() => {
    const savedData = sessionStorage.getItem("trip_form_data");
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        const classifiedPlaces: ClassifiedPlace[] = data.classifiedPlaces || [];
        const ogpItems = data.ogpItems || [];
        const integratedItems: IntegratedItem[] = ogpItems.map((ogp: any) => {
          const normalizedUrl = normalizeTrackUrl(ogp.url);
          const classified = classifiedPlaces.find((p) => normalizeTrackUrl(p.url) === normalizedUrl);
          return {
            item_id: createItemIdFromUrl(ogp.url),
            normalized_url: normalizedUrl,
            ogp: {
              url: ogp.url,
              title: ogp.title ?? null,
              description: ogp.description ?? null,
              image: ogp.image ?? null,
              siteName: ogp.siteName ?? null,
              favicon: ogp.favicon ?? null,
              provider: typeof ogp.provider === "string" ? ogp.provider : null,
            },
            classify_place: classified
              ? {
                  category: classified.category ?? null,
                  name: classified.name ?? null,
                  address: classified.address ?? null,
                }
              : null,
            geocode: classified
              ? {
                  latitude: classified.latitude ?? null,
                  longitude: classified.longitude ?? null,
                }
              : null,
          };
        });
        
        // Sort: hotel -> move -> visit
        const sorted = classifiedPlaces.sort((a, b) => {
          const order = { hotel: 0, move: 1, visit: 2, food: 3 };
          return (order[a.category as keyof typeof order] || 9) - (order[b.category as keyof typeof order] || 9);
        });
        
        setPlaces(sorted.map(p => ({ ...p, confirmed: false })));
        setContext({
          depart: data.departSelected || null,
          ogpItems,
          integratedContext: {
            schemaVersion: "1.0.0",
            flowId: sessionStorage.getItem("plan_flow_id"),
            depart: {
              selected: data.departSelected || null,
              mode: data.departMode || null,
              coords: data.departCoords || null,
              locationInfo: data.departLocationInfo || null,
            },
            items: integratedItems,
          },
        });
        setTripName(data.tripName || "æ–°ã—ã„æ—…è¡Œ");
      } catch {
        router.push("/plan");
      }
    } else {
      router.push("/plan");
    }
  }, [router]);

  useEffect(() => {
    if (
      places.length > 0 &&
      currentIndex < places.length &&
      !places[currentIndex].description &&
      !places[currentIndex].isDisabled
    ) {
      fetchPlaceInfo();
    }
  }, [currentIndex, places]);

  useEffect(() => {
    if (places.length === 0 || currentIndex >= places.length) return;
    if (!places[currentIndex].isDisabled) return;

    if (currentIndex < places.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      saveAndReturn();
    }
  }, [currentIndex, places]);

  useEffect(() => {
    if (hasLoggedPageViewRef.current) return;
    hasLoggedPageViewRef.current = true;
    sendClientLog({
      event_type: "page_view",
      page: "/chat",
      metadata: {
        source: "chat_page",
      },
    });
  }, []);

  useEffect(() => {
    if (places.length === 0 || currentIndex >= places.length) return;
    const currentPlace = places[currentIndex];
    if (currentPlace.isDisabled) return;
    const itemId = createItemIdFromUrl(currentPlace.url);
    if (lastQuestionItemIdRef.current === itemId) return;
    lastQuestionItemIdRef.current = itemId;
    sendClientLog({
      event_type: "question_shown",
      page: "/chat",
      metadata: {
        item_id: itemId,
        category: currentPlace.category,
      },
    });
  }, [currentIndex, places]);

  const fetchPlaceInfo = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    const requestStart = performance.now();
    try {
      const currentPlace = places[currentIndex];
      const ogpData = context.ogpItems.find((item: any) => item.url === currentPlace.url);
      
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place: currentPlace,
          context: { depart: context.depart },
          ogpData,
          integratedContext: hasSentIntegratedContextRef.current ? undefined : context.integratedContext,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const ttfbMs = Math.round(performance.now() - requestStart);
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : `chat_api_failed_${res.status}`
        );
      }
      if (res.ok && !hasSentIntegratedContextRef.current && context.integratedContext) {
        hasSentIntegratedContextRef.current = true;
      }
      
      setPlaces(prev => {
        const updated = [...prev];
        updated[currentIndex] = {
          ...updated[currentIndex],
          facilityName:
            typeof data?.facilityName === "string" && data.facilityName
              ? data.facilityName
              : updated[currentIndex].name,
          description:
            typeof data?.description === "string" && data.description
              ? data.description
              : "æƒ…å ±ã®å–å¾—ã«å¤±æ•—ã—ã¾ã—ãŸã€‚å‰Šé™¤ã™ã‚‹ã‹æ¬¡ã¸é€²ã‚“ã§ãã ã•ã„ã€‚",
          address:
            typeof data?.address === "string" && data.address
              ? data.address
              : updated[currentIndex].address,
          latitude: typeof data?.latitude === "number" ? data.latitude : null,
          longitude: typeof data?.longitude === "number" ? data.longitude : null,
          officialUrl:
            typeof data?.officialUrl === "string" && data.officialUrl
              ? data.officialUrl
              : updated[currentIndex].url,
          sourceUrl:
            typeof data?.sourceUrl === "string" && data.sourceUrl
              ? data.sourceUrl
              : updated[currentIndex].url,
          ogp: data?.ogp ?? null,
        };
        return updated;
      });
      sendClientLog({
        event_type: "answer",
        page: "/chat",
        metadata: {
          item_id: createItemIdFromUrl(currentPlace.url),
          success: true,
        },
      });
      if (!hasLoggedFirstResponseKpiRef.current) {
        hasLoggedFirstResponseKpiRef.current = true;
        sendClientLog({
          event_type: "kpi_first_response",
          page: "/chat",
          metadata: {
            item_id: createItemIdFromUrl(currentPlace.url),
            ttfb_ms: ttfbMs,
            first_response_ms: Math.round(performance.now() - requestStart),
            kpi_target_ms: 2000,
            achieved: Math.round(performance.now() - requestStart) <= 2000,
          },
        });
      }
    } catch (error) {
      console.error("Fetch place info error:", error);
      setPlaces(prev => {
        const updated = [...prev];
        updated[currentIndex] = {
          ...updated[currentIndex],
          description: "æƒ…å ±ã®å–å¾—ã«å¤±æ•—ã—ã¾ã—ãŸã€‚å‰Šé™¤ã™ã‚‹ã‹æ¬¡ã¸é€²ã‚“ã§ãã ã•ã„ã€‚",
          officialUrl: updated[currentIndex].officialUrl || updated[currentIndex].url,
          sourceUrl: updated[currentIndex].sourceUrl || updated[currentIndex].url,
        };
        return updated;
      });
      sendClientLog({
        event_type: "answer",
        page: "/chat",
        metadata: {
          item_id: createItemIdFromUrl(currentPlace.url),
          success: false,
        },
      });
      if (!hasLoggedFirstResponseKpiRef.current) {
        hasLoggedFirstResponseKpiRef.current = true;
        const elapsedMs = Math.round(performance.now() - requestStart);
        sendClientLog({
          event_type: "kpi_first_response",
          page: "/chat",
          metadata: {
            item_id: createItemIdFromUrl(currentPlace.url),
            ttfb_ms: elapsedMs,
            first_response_ms: elapsedMs,
            kpi_target_ms: 2000,
            achieved: elapsedMs <= 2000,
            success: false,
          },
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheck = () => {
    if (places.length === 0) return;

    setPlaces(prev => {
      if (prev.length <= 1) {
        return [{ ...prev[0], isDisabled: true, confirmed: false }];
      }

      const updated = [...prev];
      const [target] = updated.splice(currentIndex, 1);
      updated.push({ ...target, isDisabled: true, confirmed: false });
      return updated;
    });

    if (places.length > 1) {
      setCurrentIndex(currentIndex >= places.length - 1 ? 0 : currentIndex);
    }
  };

  const handleReserve = () => {
    const query = `${currentPlace.name} ${currentPlace.address} äºˆç´„`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const itemId = createItemIdFromUrl(currentPlace.url);
    const offerId = `reserve_${itemId}`;
    const goUrl = buildGoUrl(offerId, googleUrl, itemId);
    sendClientLog({
      event_type: "reservation_click",
      page: "/chat",
      targetUrl: googleUrl,
      metadata: {
        item_id: itemId,
        offer_id: offerId,
        place_name: currentPlace.name,
        category: currentPlace.category,
        source_url: currentPlace.url,
        official_url: currentPlace.officialUrl || null,
      },
    });
    window.open(goUrl, "_blank");
    addToTaskList();
    if (currentIndex < places.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      router.push("/task");
    }
  };

  const handleAdd = () => {
    setPlaces(prev => {
      const updated = [...prev];
      updated[currentIndex] = { ...updated[currentIndex], confirmed: true };
      return updated;
    });
    addToTaskList();
    if (currentIndex < places.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      router.push("/task");
    }
  };

  const addToTaskList = () => {
    const taskList = JSON.parse(sessionStorage.getItem("task_list") || "[]");
    const exists = taskList.some((task: any) => task.name === currentPlace.name);
    if (!exists) {
      taskList.push({
        name: currentPlace.name,
        category: currentPlace.category,
        address: currentPlace.address,
        url: currentPlace.url,
        officialUrl: currentPlace.officialUrl,
        description: currentPlace.description
      });
      sessionStorage.setItem("task_list", JSON.stringify(taskList));
    }
  };

  const saveAndReturn = () => {
    const savedData = sessionStorage.getItem("trip_form_data");
    if (savedData) {
      const data = JSON.parse(savedData);
      data.classifiedPlaces = places.filter(p => p.confirmed).map(({ url, category, name, address }) => ({
        url, category, name, address
      }));
      data.tripName = tripName;
      sessionStorage.setItem("trip_form_data", JSON.stringify(data));
    }
    router.push("/plan");
  };

  if (places.length === 0) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">ç¢ºèªã™ã‚‹æ–½è¨­ãŒã‚ã‚Šã¾ã›ã‚“</p>
          <button
            onClick={() => router.push("/plan")}
            className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold"
          >
            ãƒ—ãƒ©ãƒ³ãƒšãƒ¼ã‚¸ã«æˆ»ã‚‹
          </button>
        </div>
      </main>
    );
  }

  const currentPlace = places[currentIndex];
  const canReserve = currentPlace.category === "hotel" || currentPlace.category === "move";
  const iconMap: Record<string, string> = {
    visit: "ðŸ“",
    food: "ðŸœ",
    hotel: "ðŸ›Œ",
    move: "ðŸšƒ"
  };
  
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <div className="max-w-[820px] mx-auto w-full flex flex-col h-screen">
        {/* Header */}
        <div className="py-4 px-4 flex items-center justify-between border-b">
          <button
            onClick={saveAndReturn}
            className="text-emerald-500 font-bold"
          >
            æˆ»ã‚‹
          </button>
          <button
            onClick={() => router.push("/task")}
            className="text-blue-500 font-bold"
          >
            ã‚¿ã‚¹ã‚¯
          </button>
        </div>
        {/* Progress */}
        <div className="px-4 py-2">
          <div className="flex gap-1">
            {places.map((_, idx) => (
              <div
                key={idx}
                className={`flex-1 h-2 rounded-full ${
                  idx < currentIndex ? "bg-emerald-500" :
                  idx === currentIndex ? "bg-blue-500" :
                  "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {/* Trip Name */}
          <div>
            {isEditingTripName ? (
              <input
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                onBlur={() => setIsEditingTripName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingTripName(false)}
                className="text-lg font-bold bg-transparent border-b-2 border-emerald-500 outline-none w-full"
                autoFocus
              />
            ) : (
              <h2
                onClick={() => setIsEditingTripName(true)}
                className="text-lg font-bold cursor-pointer hover:text-emerald-600"
              >
                {tripName}
              </h2>
            )}
            <div className="mt-1 text-xs text-gray-500">
              {places.filter(p => p.category === 'hotel').length > 0
                ? `${places.filter(p => p.category === 'hotel').length}æ³Š${places.filter(p => p.category === 'hotel').length + 1}æ—¥`
                : "æ—¥å¸°ã‚Š"}
            </div>
          </div>
          {/* Left-Right Split */}
          <div className="flex gap-4">
            {/* Left Half - AI Image */}
            <div className="w-1/3 flex justify-center items-center">
              <Image
                src={isLoading ? "/consider.png" : "/comeup.png"}
                alt="AI"
                width={200}
                height={200}
                className="rounded-full"
              />
            </div>

            {/* Right Half */}
            <div className="w-2/3 space-y-4">
              {/* Place Card */}
              {currentPlace.isDisabled ? (
                <div className="block border-2 border-gray-200 rounded-2xl p-3 bg-gray-100 opacity-60">
                  <div className="flex items-center gap-2">
                    <div className="text-lg">{iconMap[currentPlace.category] || "ðŸ“"}</div>
                    <div className="flex-1">
                      <div style={{fontSize: '13px'}} className="font-bold">{currentPlace.name}</div>
                      {currentPlace.address && (
                        <div style={{fontSize: '8px'}} className="text-gray-500">{currentPlace.address}</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  href={buildGoUrl(
                    `card_${createItemIdFromUrl(currentPlace.url)}`,
                    currentPlace.url,
                    createItemIdFromUrl(currentPlace.url)
                  )}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    sendClientLog({
                      event_type: "click",
                      page: "/chat",
                      targetUrl: currentPlace.url,
                      metadata: {
                        offer_id: `card_${createItemIdFromUrl(currentPlace.url)}`,
                        item_id: createItemIdFromUrl(currentPlace.url),
                      },
                    })
                  }
                  className="block border-2 border-gray-300 rounded-2xl p-3 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-lg">{iconMap[currentPlace.category] || "ðŸ“"}</div>
                    <div className="flex-1">
                      <div style={{fontSize: '13px'}} className="font-bold">{currentPlace.name}</div>
                      {currentPlace.address && (
                        <div style={{fontSize: '8px'}} className="text-gray-500">{currentPlace.address}</div>
                      )}
                    </div>
                  </div>
                </a>
              )}

              {/* URL Buttons */}
              <div className="space-y-2">
                {!currentPlace.isDisabled && (
                  <a
                    href={buildGoUrl(
                      `pasted_${createItemIdFromUrl(currentPlace.url)}`,
                      currentPlace.url,
                      createItemIdFromUrl(currentPlace.url)
                    )}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      sendClientLog({
                        event_type: "click",
                        page: "/chat",
                        targetUrl: currentPlace.url,
                        metadata: {
                          offer_id: `pasted_${createItemIdFromUrl(currentPlace.url)}`,
                          item_id: createItemIdFromUrl(currentPlace.url),
                        },
                      })
                    }
                    className="block w-full py-3 px-4 bg-blue-500 text-white rounded-2xl text-sm font-bold hover:bg-blue-600 text-center"
                  >
                    ðŸ“‹ è²¼ã‚Šä»˜ã‘ãŸURL
                  </a>
                )}
                {!currentPlace.isDisabled && currentPlace.officialUrl && currentPlace.officialUrl !== currentPlace.url && (
                  <a
                    href={buildGoUrl(
                      `official_${createItemIdFromUrl(currentPlace.url)}`,
                      currentPlace.officialUrl,
                      createItemIdFromUrl(currentPlace.url)
                    )}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      sendClientLog({
                        event_type: "click",
                        page: "/chat",
                        targetUrl: currentPlace.officialUrl,
                        metadata: {
                          offer_id: `official_${createItemIdFromUrl(currentPlace.url)}`,
                          item_id: createItemIdFromUrl(currentPlace.url),
                        },
                      })
                    }
                    className="block w-full py-3 px-4 bg-emerald-500 text-white rounded-2xl text-sm font-bold hover:bg-emerald-600 text-center"
                  >
                    âœ“ ä¿®æ­£ã•ã‚ŒãŸURL
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* AI Response */}
          {isLoading ? (
            <div className="bg-gray-100 rounded-2xl p-4">
              <div className="text-sm text-gray-500">è€ƒãˆä¸­ãƒ»ãƒ»ãƒ»</div>
            </div>
          ) : currentPlace.isDisabled ? (
            <div className="bg-gray-100 rounded-2xl p-4">
              <div style={{fontSize: '11px'}} className="text-gray-500">ã“ã®PlaceCardã¯ãƒã‚§ãƒƒã‚¯æ¸ˆã¿ã®ãŸã‚æ©Ÿèƒ½ãŒã‚ªãƒ•ã§ã™</div>
            </div>
          ) : currentPlace.description ? (
            <div className="bg-gray-100 rounded-2xl p-4">
              <div style={{fontSize: '11px'}} className="whitespace-pre-wrap">{currentPlace.description}</div>
            </div>
          ) : null}
          {/* Actions */}
          {!isLoading && currentPlace.description && !currentPlace.isDisabled && (
            <div className="px-3 py-3">
              <div className="flex gap-4">
                <button
                  onClick={handleCheck}
                  className="w-1/4 py-3 bg-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-300"
                >
                  å‰Šé™¤
                </button>
                <button
                  onClick={handleReserve}
                  disabled={!canReserve}
                  className={`flex-1 py-3 rounded-2xl font-bold ${
                    canReserve 
                      ? "bg-orange-400 text-white hover:bg-orange-500 cursor-pointer" 
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  ä»Šã™ãäºˆç´„
                </button>
                <button
                  onClick={handleAdd}
                  className="w-1/4 py-3 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600"
                >
                  æ¬¡ã¸
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

