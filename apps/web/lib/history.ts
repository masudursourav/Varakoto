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

  // Remove duplicate if exists
  const filtered = history.filter(
    (h) =>
      !(h.origin_en === item.origin_en && h.destination_en === item.destination_en)
  );

  filtered.unshift({ ...item, timestamp: Date.now() });

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(filtered.slice(0, MAX_ITEMS))
  );
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatTimeAgo(
  timestamp: number,
  lang: "bn" | "en"
): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === "bn") {
    if (minutes < 1) return "এইমাত্র";
    if (minutes < 60) return `${toBengaliNum(minutes)} মিনিট আগে`;
    if (hours < 24) return `${toBengaliNum(hours)} ঘণ্টা আগে`;
    return `${toBengaliNum(days)} দিন আগে`;
  }

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function toBengaliNum(n: number): string {
  const bengaliDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n)
    .split("")
    .map((d) => bengaliDigits[parseInt(d)] || d)
    .join("");
}
