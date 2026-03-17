import { formatTimeAgo } from "@/lib/utils";

export type {} from "@/lib/utils";

const STORAGE_KEY = "varakoto-history";
const MAX_ITEMS = 20;

export interface SearchHistoryItem {
  origin_en: string;
  origin_bn: string;
  destination_en: string;
  destination_bn: string;
  timestamp: number;
}

export function getHistory(): SearchHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToHistory(item: Omit<SearchHistoryItem, "timestamp">): void {
  const history = getHistory();

  // Remove duplicate if the exact same origin→destination already exists
  const filtered = history.filter(
    (h) =>
      !(
        h.origin_en === item.origin_en &&
        h.destination_en === item.destination_en
      ),
  );

  filtered.unshift({ ...item, timestamp: Date.now() });

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(filtered.slice(0, MAX_ITEMS)),
  );
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Re-export formatTimeAgo from the single shared source in lib/utils so
// existing callers of `import { formatTimeAgo } from "@/lib/history"` keep
// working without any changes.
export { formatTimeAgo };
