"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type ClassifiedPlace = {
  url: string;
  category: string;
  name: string;
  address: string;
};

type PlaceWithInfo = ClassifiedPlace & {
  confirmed: boolean;
  facilityName?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  officialUrl?: string;
  sourceUrl?: string;
  ogp?: any;
};

export default function ChatPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<PlaceWithInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<{ depart: string | null; ogpItems: any[] }>({ depart: null, ogpItems: [] });

  useEffect(() => {
    const savedData = sessionStorage.getItem("trip_form_data");
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        const classifiedPlaces: ClassifiedPlace[] = data.classifiedPlaces || [];
        
        // Sort: hotel -> move -> visit
        const sorted = classifiedPlaces.sort((a, b) => {
          const order = { hotel: 0, move: 1, visit: 2, food: 3 };
          return (order[a.category as keyof typeof order] || 9) - (order[b.category as keyof typeof order] || 9);
        });
        
        setPlaces(sorted.map(p => ({ ...p, confirmed: false })));
        setContext({ depart: data.departSelected || null, ogpItems: data.ogpItems || [] });
      } catch {
        router.push("/plan");
      }
    } else {
      router.push("/plan");
    }
  }, [router]);

  useEffect(() => {
    if (places.length > 0 && currentIndex < places.length && !places[currentIndex].description) {
      fetchPlaceInfo();
    }
  }, [currentIndex, places]);

  const fetchPlaceInfo = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
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
        }),
      });

      const data = await res.json();
      
      if (data.facilityName && data.description) {
        setPlaces(prev => {
          const updated = [...prev];
          updated[currentIndex] = {
            ...updated[currentIndex],
            facilityName: data.facilityName,
            description: data.description,
            address: data.address,
            latitude: data.latitude,
            longitude: data.longitude,
            officialUrl: data.officialUrl,
            sourceUrl: data.sourceUrl,
            ogp: data.ogp
          };
          return updated;
        });
      }
    } catch (error) {
      console.error("Fetch place info error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleYes = () => {
    setPlaces(prev => {
      const updated = [...prev];
      updated[currentIndex] = { ...updated[currentIndex], confirmed: true };
      return updated;
    });
    
    if (currentIndex < places.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      saveAndReturn();
    }
  };

  const handleNo = () => {
    setPlaces(prev => prev.filter((_, idx) => idx !== currentIndex));
    
    if (currentIndex >= places.length - 1 && places.length > 1) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const saveAndReturn = () => {
    const savedData = sessionStorage.getItem("trip_form_data");
    if (savedData) {
      const data = JSON.parse(savedData);
      data.classifiedPlaces = places.filter(p => p.confirmed).map(({ url, category, name, address }) => ({
        url, category, name, address
      }));
      sessionStorage.setItem("trip_form_data", JSON.stringify(data));
    }
    router.push("/plan");
  };

  if (places.length === 0) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">確認する施設がありません</p>
          <button
            onClick={() => router.push("/plan")}
            className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-bold"
          >
            プランページに戻る
          </button>
        </div>
      </main>
    );
  }

  const currentPlace = places[currentIndex];
  const iconMap: Record<string, string> = {
    visit: "📍",
    food: "🍜",
    hotel: "🛌",
    move: "🚃"
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
            ← 保存して戻る
          </button>
          <Image
            src="/cocoico-ai.png"
            alt="cocoico"
            width={80}
            height={80}
            priority
          />
          <div className="text-sm text-gray-500">
            {currentIndex + 1} / {places.length}
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 py-2 bg-gray-50 border-b">
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
          {/* Place Card */}
          <a
            href={currentPlace.url}
            target="_blank"
            rel="noreferrer"
            className="block border-2 border-emerald-500 rounded-2xl p-4 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="text-3xl">{iconMap[currentPlace.category] || "📍"}</div>
              <div className="flex-1">
                <div className="font-bold text-base">{currentPlace.name}</div>
                {currentPlace.address && (
                  <div className="text-xs text-gray-600">{currentPlace.address}</div>
                )}
              </div>
            </div>
          </a>

          {/* AI Response */}
          {isLoading ? (
            <div className="bg-gray-100 rounded-2xl p-4 flex gap-4">
              <div className="flex-shrink-0">
                <Image
                  src="/consider.png"
                  alt="考え中"
                  width={60}
                  height={60}
                  className="rounded-full"
                />
              </div>
              <div className="flex-1 flex items-center">
                <div className="text-sm text-gray-500">情報を取得中...</div>
              </div>
            </div>
          ) : currentPlace.description ? (
            <div className="bg-gray-100 rounded-2xl p-4 flex gap-4">
              <div className="flex-shrink-0">
                <Image
                  src="/comeup.png"
                  alt="AI"
                  width={60}
                  height={60}
                  className="rounded-full"
                />
              </div>
              <div className="flex-1">
                <div className="text-xs whitespace-pre-wrap">{currentPlace.description}</div>
              </div>
            </div>
          ) : null}

          {/* Question */}
          {!isLoading && currentPlace.description && (
            <div className="text-center py-4">
              <p className="text-lg font-bold mb-4">この施設を旅行に含めますか？</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isLoading && currentPlace.description && (
          <div className="border-t px-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleNo}
                className="py-4 bg-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-300"
              >
                ✕ いいえ
              </button>
              <button
                onClick={handleYes}
                className="py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600"
              >
                ✓ はい
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
