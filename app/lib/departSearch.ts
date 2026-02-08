import stations from "../../data/stations.json";
import postcodes from "../../data/postcodes.json";

export type DepartMode = "station" | "postal";

export function searchDepartCandidates(
  mode: DepartMode,
  keyword: string
): string[] {
  if (!keyword) return [];

  if (mode === "station") {
    const normalized = keyword.toLowerCase();
    return stations
      .filter((s) => 
        s.name.toLowerCase().includes(normalized) ||
        (s.kana && s.kana.toLowerCase().includes(normalized))
      )
      .slice(0, 10)
      .map((s) => s.name);
  }

  // postal
  return postcodes
    .filter((p) => p.zip.startsWith(keyword))
    .slice(0, 10)
    .map((p) => `${p.zip} ${p.pref}${p.city}`);
}
