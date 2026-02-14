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
  const [tripName, setTripName] = useState("新しい旅行");
  const [isEditingTripName, setIsEditingTripName] = useState(false);

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
        setTripName(data.tripName || "新しい旅行");
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

  const handleDelete = () => {
    if (currentIndex < places.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      saveAndReturn();
    }
  };

  const handleReserve = () => {
    const url = currentPlace.officialUrl || currentPlace.url;
    if (url) {
      window.open(url, "_blank");
    }
    addToTaskList();
    if (currentIndex < places.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      saveAndReturn();
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
      saveAndReturn();
    }
  };

  const addToTaskList = () => {
    const taskList = JSON.parse(sessionStorage.getItem("task_list") || "[]");
    taskList.push({
      name: currentPlace.name,
      category: currentPlace.category,
      address: currentPlace.address,
      url: currentPlace.url,
      officialUrl: currentPlace.officialUrl,
      description: currentPlace.description
    });
    sessionStorage.setItem("task_list", JSON.stringify(taskList));
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
          <div className="text-sm text-gray-500">
            {currentIndex + 1} / {places.length}
          </div>
          <button
            onClick={() => router.push("/task")}
            className="text-blue-500 font-bold"
          >
            タスク →
          </button>
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
                ? `${places.filter(p => p.category === 'hotel').length}泊${places.filter(p => p.category === 'hotel').length + 1}日`
                : "日帰り"}
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
              <a
                href={currentPlace.url}
                target="_blank"
                rel="noreferrer"
                className="block border-2 border-gray-300 rounded-2xl p-3 bg-white hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="text-lg">{iconMap[currentPlace.category] || "📍"}</div>
                  <div className="flex-1">
                    <div style={{fontSize: '13px'}} className="font-bold">{currentPlace.name}</div>
                    {currentPlace.address && (
                      <div style={{fontSize: '8px'}} className="text-gray-500">{currentPlace.address}</div>
                    )}
                  </div>
                </div>
              </a>

              {/* URL Buttons */}
              <div className="space-y-2">
                <a
                  href={currentPlace.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-3 px-4 bg-blue-500 text-white rounded-2xl text-sm font-bold hover:bg-blue-600 text-center"
                >
                  📋 貼り付けたURL
                </a>
                {currentPlace.officialUrl && currentPlace.officialUrl !== currentPlace.url && (
                  <a
                    href={currentPlace.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full py-3 px-4 bg-emerald-500 text-white rounded-2xl text-sm font-bold hover:bg-emerald-600 text-center"
                  >
                    ✓ 修正されたURL
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* AI Response */}
          {isLoading ? (
            <div className="bg-gray-100 rounded-2xl p-4">
              <div className="text-sm text-gray-500">考え中・・・</div>
            </div>
          ) : currentPlace.description ? (
            <div className="bg-gray-100 rounded-2xl p-4">
              <div className="text-sm whitespace-pre-wrap">{currentPlace.description}</div>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        {!isLoading && currentPlace.description && (
          <div className="border-t px-4 py-4">
            <div className="flex gap-4">
              <button
                onClick={handleDelete}
                className="w-1/4 py-4 bg-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-300"
              >
                削除
              </button>
              <button
                onClick={handleReserve}
                className="flex-1 py-4 bg-orange-400 text-white rounded-2xl font-bold hover:bg-orange-500"
              >
                今すぐ予約
              </button>
              <button
                onClick={handleAdd}
                className="w-1/4 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600"
              >
                次へ
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
