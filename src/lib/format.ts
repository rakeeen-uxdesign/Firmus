/** Generic value formatting — no Firmus domain rules here. */

/** Seconds → `MM:SS` (minutes grow past 99, no leading zero once ≥ 100). */
export function formatTime(sec: number): string {
  const totalMins = Math.floor(sec / 60);
  const m = totalMins >= 100 ? String(totalMins) : String(totalMins).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Minute count → human duration: 45 → "45m", 90 → "1h 30m", 120 → "2h", 0 → "0m". */
export function formatDurationText(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
