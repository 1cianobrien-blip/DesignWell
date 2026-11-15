import { ENTRY_TYPE_LABELS, type EntryType } from "@/pipeline/taxonomy";

export function typeLabel(t: string) {
  return ENTRY_TYPE_LABELS[t as EntryType] ?? t;
}

export function shortDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function monthYear(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Tile colours from the existing site's company cards, used when a company has no brand colour.
const TILE_COLORS = ["#E0482A", "#1F63E8", "#D6FB52", "#236CFF", "#0B1A33", "#635BFF", "#FDECEE", "#D9D3FB"];

export function tileColor(name: string, brand?: string | null) {
  if (brand && /^#[0-9a-f]{6}$/i.test(brand)) return brand;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/** Black or white text/pill tint for a background colour. */
export function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

export function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}
