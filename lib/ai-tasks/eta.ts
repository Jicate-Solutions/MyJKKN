// ETA for the async AI task button. The sweep (collect + submit) runs every 15
// min (vercel.json). Worst case: a click lands just after a sweep → waits ~1
// cycle to submit, batch resolves in minutes, next cycle collects. We quote the
// CONSERVATIVE end (relative minutes, so timezone never confuses) — the button
// under-promises and over-delivers.
const SWEEP_MS = 15 * 60 * 1000;
const BATCH_LATENCY_MS = 5 * 60 * 1000;

export function nextRunEta(now: Date = new Date()): { etaIso: string; label: string; minutes: number } {
  const nextSweep = Math.ceil((now.getTime() + 1) / SWEEP_MS) * SWEEP_MS; // next :00/:15/:30/:45
  const readyMs = nextSweep + SWEEP_MS + BATCH_LATENCY_MS; // submit cycle + latency + collect cycle
  const minutes = Math.max(1, Math.round((readyMs - now.getTime()) / 60000));
  return { etaIso: new Date(readyMs).toISOString(), label: `ready in ~${minutes} min`, minutes };
}
