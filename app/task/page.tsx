"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

  useEffect(() => {
    const taskList = JSON.parse(sessionStorage.getItem("task_list") || "[]");
    setTasks(taskList);
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
            ← 戻る
          </button>
          <img src="/cocoico-ai.png" alt="cocoico" className="h-16" />
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
                    <div className="font-bold text-base">{task.name}</div>
                    {task.address && (
                      <div className="text-xs text-gray-500 mt-1">{task.address}</div>
                    )}
                    {expandedIndex === idx && task.description && (
                      <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                        {task.description}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <a
                        href={task.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600"
                      >
                        元URL
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
