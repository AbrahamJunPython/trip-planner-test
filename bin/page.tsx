"use client";

import { useState } from "react";

type Days = "2泊3日" | "3泊4日";
type Purpose = "観光" | "ゆるめ";

export default function Page() {
  const [days, setDays] = useState<Days>("2泊3日");
  const [people, setPeople] = useState<number>(1);
  const [purpose, setPurpose] = useState<Purpose>("観光");

  const [budget, setBudget] = useState(3);
  const [hotel, setHotel] = useState(3);
  const [food, setFood] = useState(3);
  const [move, setMove] = useState(3);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function generate() {
    setLoading(true);
    setResult("生成中...");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days,
          people,
          purpose,
          budget_style: { budget, hotel, food, move },
          depart: "東京"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "生成に失敗しました");
      setResult(data.text);
    } catch (e: any) {
      setResult(`エラー: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="bg-[#f6f7f9] min-h-screen p-4">
      <div className="max-w-[820px] mx-auto grid gap-3">
        <h1 className="m-0">旅行工程ジェネレーター（東京発・王道）</h1>
        <p className="m-0 text-gray-500 text-[13px]">
          幹事が「行き先まで言い切った」70%完成の叩き台を作る。飯は王道、時間ラフは外さない。
        </p>

        <section className="bg-white rounded-2xl p-4 border border-gray-200">
          <div className="grid gap-2.5">
            <label>
              日数：
              <select value={days} onChange={(e) => setDays(e.target.value as Days)} className="ml-2">
                <option value="2泊3日">2泊3日</option>
                <option value="3泊4日">3泊4日</option>
              </select>
            </label>

            <label>
              人数（1〜6）：
              <input
                type="number"
                min={1}
                max={6}
                value={people}
                onChange={(e) => setPeople(Number(e.target.value))}
                className="ml-2 w-20"
              />
            </label>

            <label>
              目的：
              <select value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)} className="ml-2">
                <option value="観光">観光</option>
                <option value="ゆるめ">ゆるめ</option>
              </select>
            </label>

            <Range label="旅行にお金をかけたい度（節約↔記念）" v={budget} setV={setBudget} />
            <Range label="宿の重視度（寝られればOK↔良い宿）" v={hotel} setV={setHotel} />
            <Range label="食の重視度（最低限↔ご飯こだわる）" v={food} setV={setFood} />
            <Range label="移動の快適さ（我慢OK↔快適重視）" v={move} setV={setMove} />

            <button
              onClick={generate}
              disabled={loading}
              className={`p-3 rounded-[14px] border border-gray-800 font-bold ${
                loading ? 'bg-gray-400' : 'bg-gray-800 text-white'
              }`}
            >
              {loading ? "生成中..." : "叩き台を作る（AI）"}
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 border border-gray-200">
          <h2 className="m-0 mb-2 text-base">出力（70%完成）</h2>
          <pre className="m-0 whitespace-pre-wrap leading-relaxed text-sm">
            {result || "ここにAIの旅行工程が表示されます。"}
          </pre>
        </section>
      </div>
    </main>
  );
}

function Range({ label, v, setV }: { label: string; v: number; setV: (n: number) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px]">{label}：{v}</span>
      <input type="range" min={1} max={5} value={v} onChange={(e) => setV(Number(e.target.value))} />
    </label>
  );
}