"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createItemIdFromUrl } from "../lib/item-tracking";

type TaskItem = {
  name: string;
  category: string;
  address: string;
  url: string;
  officialUrl?: string;
  description?: string;
};

export default function TaskPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const hasLoggedPageViewRef = useRef(false);

  const sendClientLog = (payload: {
    event_type: "page_view" | "reservation_click";
    page: string;
    targetUrl?: string;
    metadata?: Record<string, unknown>;
  }) => {
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
    q.set("page", "/task");
    return `/go/${encodeURIComponent(offerId)}?${q.toString()}`;
  };

  useEffect(() => {
    const taskList = JSON.parse(sessionStorage.getItem("task_list") || "[]");
    setTasks(taskList);
  }, []);

  useEffect(() => {
    if (hasLoggedPageViewRef.current) return;
    hasLoggedPageViewRef.current = true;
    sendClientLog({
      event_type: "page_view",
      page: "/task",
      metadata: {
        source: "task_page",
      },
    });
  }, []);

  const iconMap: Record<string, string> = {
    visit: "📍",
    food: "🍜",
    hotel: "🛌",
    move: "🚃"
  };

  const removeTask = (index: number) => {
    const updated = tasks.filter((_, idx) => idx !== index);
    setTasks(updated);
    sessionStorage.setItem("task_list", JSON.stringify(updated));
    if (expandedIndex === index) setExpandedIndex(null);
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-[820px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="text-emerald-500 font-bold"
          >
            戻る
          </button>
          <img src="/cocoico-ai.png" alt="cocoico" className="h-10" />
          <div className="w-16"></div>
        </div>

        <h2 className="text-lg font-bold mb-4">やることリスト</h2>

        {tasks.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            タスクがありません
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task, idx) => (
              <div
                key={idx}
                className="border-2 border-gray-300 rounded-2xl p-4 bg-white relative"
              >
                <button
                  onClick={() => removeTask(idx)}
                  className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xl font-bold"
                >
                  ×
                </button>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                    className="text-2xl cursor-pointer hover:opacity-70"
                  >
                    {iconMap[task.category] || "📍"}
                  </button>
                  <div className="flex-1">
                    <div style={{fontSize: '13px'}} className="font-bold text-base">{task.name}</div>
                    {task.address && (
                      <div style={{fontSize: '8px'}} className="text-xs text-gray-500 mt-1">{task.address}</div>
                    )}
                    {expandedIndex === idx && task.description && (
                      <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                        {task.description}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <a
                        href={buildGoUrl(
                          `task_reserve_${createItemIdFromUrl(task.url)}`,
                          task.url,
                          createItemIdFromUrl(task.url)
                        )}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          sendClientLog({
                            event_type: "reservation_click",
                            page: "/task",
                            targetUrl: task.url,
                            metadata: {
                              item_id: createItemIdFromUrl(task.url),
                              offer_id: `task_reserve_${createItemIdFromUrl(task.url)}`,
                              task_name: task.name,
                              category: task.category,
                              address: task.address,
                              official_url: task.officialUrl || null,
                            },
                          });
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600"
                      >
                        予約
                      </a>
                      {task.officialUrl && task.officialUrl !== task.url && (
                        <a
                          href={task.officialUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600"
                        >
                          公式URL
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
