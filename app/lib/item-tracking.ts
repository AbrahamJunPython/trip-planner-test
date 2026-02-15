export function normalizeTrackUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export function createItemIdFromUrl(rawUrl: string): string {
  const normalized = normalizeTrackUrl(rawUrl);
  // djb2 hash (stable, fast, non-cryptographic)
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return `itm_${Math.abs(hash).toString(36)}`;
}

export function createFlowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `flow_${crypto.randomUUID()}`;
  }
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
