/**
 * HR Recruitment Need Signal — UI Helper Utilities
 *
 * Shared constants, color maps, and formatting helpers
 * for all recruitment-need dashboard components.
 */

import type { SignalStatus, OverallSignalStatus, SignalInputKey } from '@/types/hr-recruitment-need';

// ─── Traffic-Light Color Maps ───────────────────────────────────────────────────

export const STATUS_COLORS: Record<SignalStatus | 'insufficient_data', {
  bg: string;
  text: string;
  dot: string;
  border: string;
  label: string;
}> = {
  green: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    dot: 'bg-green-500',
    border: 'border-green-200',
    label: 'On Track',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    label: 'Attention',
  },
  red: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
    border: 'border-red-200',
    label: 'Critical',
  },
  insufficient_data: {
    bg: 'bg-gray-50',
    text: 'text-gray-500',
    dot: 'bg-gray-400',
    border: 'border-gray-200',
    label: 'No Data',
  },
};

export const OVERALL_STATUS_COLORS: Record<OverallSignalStatus, {
  bg: string;
  text: string;
  border: string;
  label: string;
}> = {
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300', label: 'Healthy' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', label: 'Needs Attention' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300', label: 'Critical' },
  blocked: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', label: 'Blocked' },
  insufficient_data: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', label: 'No Data' },
};

// ─── Input Key Labels ───────────────────────────────────────────────────────────

export const INPUT_KEY_LABELS: Record<SignalInputKey, { label: string; short: string }> = {
  sanctioned_gap: { label: 'Sanctioned Gap', short: 'Gap' },
  sfr: { label: 'Student-Faculty Ratio', short: 'SFR' },
  specialization_gap: { label: 'Specialization Coverage', short: 'Spec' },
  workload: { label: 'Workload Balance', short: 'Load' },
  projected_intake: { label: 'Projected Intake', short: 'Intake' },
  attrition_pipeline: { label: 'Attrition Pipeline', short: 'Attr' },
  peer_benchmark: { label: 'Peer Benchmark', short: 'Peer' },
};

export const SIGNAL_INPUT_KEYS: SignalInputKey[] = [
  'sanctioned_gap',
  'sfr',
  'specialization_gap',
  'workload',
  'projected_intake',
  'attrition_pipeline',
  'peer_benchmark',
];

// ─── Formatters ─────────────────────────────────────────────────────────────────

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '--';
  return Math.round(score).toString();
}

export function formatPercentage(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '--';
  return `${Math.round(pct)}%`;
}

export function formatGap(gap: number | null | undefined): string {
  if (gap === null || gap === undefined) return '--';
  const sign = gap > 0 ? '+' : '';
  return `${sign}${gap.toFixed(1)}`;
}

export function formatDateRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
