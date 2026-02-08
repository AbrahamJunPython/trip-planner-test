import type { OgpProvider } from "../../types";

export function detectProvider(url: string): OgpProvider {
  const u = url.toLowerCase();

  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("twitter.com") || u.includes("x.com")) return "x";

  return "website";
}
