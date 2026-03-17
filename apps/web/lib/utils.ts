import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert an ASCII number to Bengali (Eastern Arabic) numerals.
 * e.g. toBengaliNum(42) → "৪২"
 *      toBengaliNum("10") → "১০"
 */
export function toBengaliNum(n: number | string): string {
  const bengaliDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n)
    .split("")
    .map((ch) => {
      const d = parseInt(ch, 10);
      return isNaN(d) ? ch : bengaliDigits[d];
    })
    .join("");
}

/** Minimum student fare in taka (BRTA rule: no fare below ৳10 for students). */
export const MIN_STUDENT_FARE = 10;

/**
 * Calculate the student half-fare from a full regular fare.
 * Students pay 50% of the regular fare, subject to the minimum of ৳10.
 * Uses Math.ceil so students are never charged a fractional taka.
 *
 * e.g. calcStudentFare(35) → 18
 *      calcStudentFare(15) → 8 → clamped to 10
 */
export function calcStudentFare(fare: number): number {
  return Math.max(MIN_STUDENT_FARE, Math.ceil(fare / 2));
}

/**
 * Format a relative timestamp as a human-readable "time ago" string.
 * Supports both Bengali and English output.
 */
export function formatTimeAgo(timestamp: number, lang: "bn" | "en"): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

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
