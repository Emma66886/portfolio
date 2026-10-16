const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateTime = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Infinity],
];

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function timeAgo(epochMs: number, now = Date.now()) {
  let value = (epochMs - now) / 1000;
  if (Math.abs(value) < 45) return "just now";
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
    value /= size;
  }
  return relative.format(Math.round(value), "year");
}

/** "14 Oct, 9:32 PM", for a tooltip next to the relative time. */
export const fullDate = (epochMs: number) => dateTime.format(epochMs);

/** "48s", "3m 05s". */
export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Race timing: "32.553" under a minute, "1:38.204" over. */
export function formatLapTime(seconds: number) {
  if (seconds < 60) return seconds.toFixed(3);
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(3).padStart(6, "0")}`;
}
