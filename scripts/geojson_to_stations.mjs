// scripts/geojson_to_stations.mjs
import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";

/**
 * 国土数値情報 N02-24 Station GeoJSON を想定
 * feature.properties のキーはデータ版で多少違うことがあるので、
 * よくある候補を複数見て拾うようにしている。
 */

const INPUT = process.argv[2] || "data/jr-east-yamanote.geojson";
const OUT_DIR = "data";
const OUTPUT = path.join(OUT_DIR, "stations.json");

// 文字を検索用に正規化（全角/半角まではやらず、まずは最低限）
function normalizeText(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

// properties から「駅名っぽい項目」を拾う
function pickStationName(props) {
  // よくあるキー候補（N02系・駅データで出がち）
  const candidates = [
    "N02_004", // 駅名 であることが多い
    "station",
    "station_name",
    "name",
    "名称",
    "駅名",
  ];
  for (const k of candidates) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  // まれに「駅名（カナ）」しか無い等のケースがあるので fallback
  const kanaCandidates = ["N02_004K", "kana", "station_kana", "カナ"];
  for (const k of kanaCandidates) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickKana(props) {
  const kanaCandidates = ["N02_004K", "kana", "station_kana", "カナ"];
  for (const k of kanaCandidates) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickLine(props) {
  const candidates = [
    "N02_003", // 路線名であることが多い
    "line",
    "line_name",
    "路線",
    "路線名",
  ];
  for (const k of candidates) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickOperator(props) {
  const candidates = [
    "N02_002", // 事業者名であることが多い
    "operator",
    "company",
    "事業者",
    "運営",
    "会社",
  ];
  for (const k of candidates) {
    const v = props?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

// GeoJSON geometry から座標取り出し（Point前提）
function pickLonLat(geom) {
  if (!geom) return null;

  // N02駅データは Point が多い想定
  if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
    const [lon, lat] = geom.coordinates;
    if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
  }

  // 万一 MultiPoint の場合は先頭を使う
  if (geom.type === "MultiPoint" && Array.isArray(geom.coordinates) && geom.coordinates[0]) {
    const [lon, lat] = geom.coordinates[0];
    if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
  }

  return null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

(async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`❌ 入力ファイルが見つかりません: ${INPUT}`);
    console.error(`   例: data/N02-24_Station.geojson に置いてから実行してください`);
    process.exit(1);
  }

  // Shift_JISで読み込む
  const buf = fs.readFileSync(INPUT);
  const raw = iconv.decode(buf, "shift_jis");
  const geo = JSON.parse(raw);

  if (!geo?.features || !Array.isArray(geo.features)) {
    console.error("❌ GeoJSONの形式が想定と違います（featuresがありません）");
    process.exit(1);
  }

  // 重複を潰して、駅ごとに lines をまとめる
  // key: name + lonlat (丸め) を採用（同名駅が複数あるので座標で分ける）
  const map = new Map();

  for (const f of geo.features) {
    const props = f?.properties || {};
    const geom = f?.geometry;

    const name = pickStationName(props);
    if (!name) continue;

    const pos = pickLonLat(geom);
    if (!pos) continue;

    const lon = round6(pos.lon);
    const lat = round6(pos.lat);

    const kana = pickKana(props);
    const line = pickLine(props);
    const operator = pickOperator(props);

    const key = `${name}|${lon}|${lat}`;

    if (!map.has(key)) {
      map.set(key, {
        id: `st_${map.size + 1}`,
        name,
        kana,
        lon,
        lat,
        lines: [],
        operator, // 代表で1個（必要なら lines側に持たせてもOK）
        searchKey: normalizeText(name),
        kanaKey: kana ? normalizeText(kana) : undefined,
      });
    }

    const rec = map.get(key);

    // line を lines に蓄積（重複排除）
    if (line) {
      if (!rec.lines.includes(line)) rec.lines.push(line);
    }

    // operator が無かった場合に補完
    if (!rec.operator && operator) rec.operator = operator;
  }

  const stations = Array.from(map.values())
    // lines を見やすくソート
    .map((s) => ({ ...s, lines: (s.lines || []).slice().sort() }))
    // 名前順に並べる（任意）
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  ensureDir(OUT_DIR);
  fs.writeFileSync(OUTPUT, JSON.stringify(stations, null, 2), "utf-8");

  console.log(`✅ 出力完了: ${OUTPUT}`);
  console.log(`   駅数: ${stations.length.toLocaleString()}`);
})();
