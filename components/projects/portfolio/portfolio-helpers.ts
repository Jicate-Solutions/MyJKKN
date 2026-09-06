/**
 * Portfolio UI helpers — RAG color maps, formatters, initials.
 *
 * Kept separate from portfolio-service.ts (pure data) so the presentational
 * Tailwind class maps live with the components that consume them.
 */

import type { RagStatus } from '@/types/projects';
import type { StatusBucket } from '@/lib/services/projects/portfolio-service';

/** Left-border accent for project cards, keyed by RAG status. */
export const RAG_BORDER: Record<string, string> = {
  green: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
};

/** Dot / chip color for a RAG status. */
export const RAG_DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

export const RAG_LABEL: Record<string, string> = {
  green: 'On track',
  amber: 'At risk',
  red: 'Off track',
};

/** Column accent for the status board, keyed by coarse bucket. */
export const BUCKET_ACCENT: Record<StatusBucket, string> = {
  on_track: 'border-t-emerald-500',
  at_risk: 'border-t-amber-500',
  delayed: 'border-t-red-500',
  completed: 'border-t-slate-400',
};

export function ragBorder(rag: RagStatus | string): string {
  return RAG_BORDER[rag] ?? 'border-l-slate-300';
}

export function ragDot(rag: RagStatus | string): string {
  return RAG_DOT[rag] ?? 'bg-slate-400';
}

/** Two-letter initials from a display name (falls back to '?'). */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact INR formatter (₹1.2L / ₹3.4Cr / ₹5,000). */
export function formatInrCompact(amount: number): string {
  if (!amount) return '₹0';
  const abs = Math.abs(amount);
  if (abs >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** "3 days ago" / "just now" relative time. Inert (no client clock dep). */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}

/** "12 May" short date. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Heatmap cell background intensity by relative count (0 = empty). */
export function heatCellClass(count: number, max: number): string {
  if (count === 0) return 'bg-muted/30 text-muted-foreground';
  const ratio = max > 0 ? count / max : 0;
  if (ratio > 0.66) return 'bg-primary text-primary-foreground';
  if (ratio > 0.33) return 'bg-primary/60 text-primary-foreground';
  return 'bg-primary/25 text-foreground';
}
