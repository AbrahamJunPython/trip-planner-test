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

  const clearTasks = () => {
    sessionStorage.removeItem("task_list");
    setTasks([]);
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
          <h1 className="text-xl font-bold">タスクリスト</h1>
          <button
            onClick={clearTasks}
            className="text-red-500 font-bold"
          >
            クリア
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            タスクがありません
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task, idx) => (
              <div
                key={idx}
                className="border-2 border-gray-300 rounded-2xl p-4 bg-white"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{iconMap[task.category] || "📍"}</div>
                  <div className="flex-1">
                    <div className="font-bold text-base">{task.name}</div>
                    {task.address && (
                      <div className="text-xs text-gray-500 mt-1">{task.address}</div>
                    )}
                    {task.description && (
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
