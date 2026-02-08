// scripts/kenall_to_postcodes.mjs
import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";

/**
 * KEN_ALL.csv の列（代表的な並び）
 * 0: 全国地方公共団体コード
 * 1: 旧郵便番号
 * 2: 郵便番号(7桁)
 * 3: 都道府県カナ
 * 4: 市区町村カナ
 * 5: 町域カナ
 * 6: 都道府県
 * 7: 市区町村
 * 8: 町域
 * 9..: フラグ類
 */

// ====== 設定 ======
const INPUT = process.argv[2] || "data/KEN_ALL.csv"; // ここに置くの推奨
const OUT_DIR = "data";
const OUTPUT = path.join(OUT_DIR, "postcodes.json");

// ====== CSVパーサ（簡易・引用符対応） ======
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // "" は " として扱う
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeZip(zip) {
  // "1000001" のような7桁のみ残す
  return (zip || "").replace(/[^0-9]/g, "").padStart(7, "0").slice(0, 7);
}

function makeKey(pref, city, town) {
  return `${pref}|${city}|${town}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ====== メイン ======
(async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`❌ 入力ファイルが見つかりません: ${INPUT}`);
    console.error(`   例: data/KEN_ALL.csv に置いてから実行してください`);
    process.exit(1);
  }

  const buf = fs.readFileSync(INPUT);
  const text = iconv.decode(buf, "shift_jis");

  const lines = text.split(/\r?\n/).filter(Boolean);

  // zip -> { pref, city, towns[] } 形式にまとめる
  // towns は同一郵便番号に複数町域が紐づくことがあるため配列にする
  const map = new Map();

  for (const line of lines) {
    const cols = parseCsvLine(line);

    // 念のため長さチェック
    if (cols.length < 9) continue;

    const zip = normalizeZip(cols[2]);
    const pref = (cols[6] || "").trim();
    const city = (cols[7] || "").trim();
    const town = (cols[8] || "").trim();

    if (!zip || !pref || !city) continue;

    const rec = map.get(zip) || { zip, pref, city, towns: [] };

    // town が空や「以下に掲載がない場合」などの場合もあるので、そのまま入れるか除外するか選べる
    // MVPでは空は入れない方が検索UXが良いことが多いので空は除外
    if (town && town !== "以下に掲載がない場合") {
      // 重複town除去
      if (!rec.towns.includes(town)) rec.towns.push(town);
    }

    map.set(zip, rec);
  }

  // JSON出力（フロント検索しやすいよう配列で）
  const arr = Array.from(map.values());

  ensureDir(OUT_DIR);
  fs.writeFileSync(OUTPUT, JSON.stringify(arr, null, 2), "utf-8");

  console.log(`✅ 出力完了: ${OUTPUT}`);
  console.log(`   件数: ${arr.length.toLocaleString()} (郵便番号ユニーク数)`);
})();
