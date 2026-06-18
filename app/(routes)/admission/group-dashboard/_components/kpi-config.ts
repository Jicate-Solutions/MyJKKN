// app/(routes)/admission/group-dashboard/_components/kpi-config.ts
//
// Shared KPI-card metadata + colour tones for the Group Dashboard.
// Used by the page-level combined strip AND the per-entity-type Overview
// sections (<LifecycleKpiCards>), so both render an identical card vocabulary.
//
// 2026-06-17: extracted from page.tsx when the Overview tab was split into
// separate Institution / School sections.

import {
  Users,
  HelpCircle,
  Send,
  Landmark,
  BookmarkCheck,
  GraduationCap,
  XCircle,
  LayoutGrid,
  Gauge,
  type LucideIcon,
} from 'lucide-react';
import type { DrilldownMetric } from '@/lib/policies/dashboard-drilldown-keys';

export type CardTone = {
  /** Tailwind classes for the icon disc background + foreground colour. */
  disc: string;
  /** Tailwind classes for the card's coloured left-border accent. */
  accent: string;
  /** Tailwind classes for the subtle gradient background overlay. */
  bg: string;
  /** Tailwind class for the value text colour. */
  value: string;
};

export const TONES: Record<string, CardTone> = {
  indigo:  { disc: 'bg-indigo-100  text-indigo-700',  accent: 'border-l-indigo-400',  bg: 'from-indigo-50/60 to-transparent',  value: 'text-indigo-900' },
  slate:   { disc: 'bg-slate-100   text-slate-700',   accent: 'border-l-slate-400',   bg: 'from-slate-50/60 to-transparent',   value: 'text-slate-900' },
  sky:     { disc: 'bg-sky-100     text-sky-700',     accent: 'border-l-sky-400',     bg: 'from-sky-50/60 to-transparent',     value: 'text-sky-900' },
  amber:   { disc: 'bg-amber-100   text-amber-800',   accent: 'border-l-amber-400',   bg: 'from-amber-50/60 to-transparent',   value: 'text-amber-900' },
  purple:  { disc: 'bg-purple-100  text-purple-700',  accent: 'border-l-purple-400',  bg: 'from-purple-50/60 to-transparent',  value: 'text-purple-900' },
  emerald: { disc: 'bg-emerald-100 text-emerald-700', accent: 'border-l-emerald-500', bg: 'from-emerald-50/60 to-transparent', value: 'text-emerald-900' },
  rose:    { disc: 'bg-rose-100    text-rose-700',    accent: 'border-l-rose-400',    bg: 'from-rose-50/60 to-transparent',    value: 'text-rose-900' },
  blue:    { disc: 'bg-blue-100    text-blue-700',    accent: 'border-l-blue-400',    bg: 'from-blue-50/60 to-transparent',    value: 'text-blue-900' },
  cyan:    { disc: 'bg-cyan-100    text-cyan-700',    accent: 'border-l-cyan-400',    bg: 'from-cyan-50/60 to-transparent',    value: 'text-cyan-900' },
};

export type LifecycleKpiCard = {
  label: string;
  metric: DrilldownMetric;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  tooltip?: string;
};

/**
 * The nine lifecycle KPI cards, in funnel order. Mirrors the lifecycle
 * workflow (enquiry → enquiry_submitted → account → reserved → admitted)
 * plus the three non-lifecycle metrics (Total Leads / Total Seats / Fill Rate).
 */
export const LIFECYCLE_KPI_CARDS: ReadonlyArray<LifecycleKpiCard> = [
  { label: 'Total Leads',       metric: 'total_leads',         icon: Users,          tone: 'indigo'  },
  { label: 'Enquiry',           metric: 'enquiry',             icon: HelpCircle,     tone: 'slate'   },
  { label: 'Enquiry Submitted', metric: 'enquiry_submitted',   icon: Send,           tone: 'sky'     },
  { label: 'Fees Pending',      metric: 'account',             icon: Landmark,       tone: 'amber'   },
  { label: 'Reserved',          metric: 'reserved',            icon: BookmarkCheck,  tone: 'purple'  },
  { label: 'Admitted',          metric: 'admitted_active',     icon: GraduationCap,  tone: 'emerald', tooltip: 'Includes Active learners (admitted → active is sequential)' },
  { label: 'Rejected',          metric: 'rejected_lifecycle',  icon: XCircle,        tone: 'rose'    },
  { label: 'Total Seats',       metric: 'total_seats',         icon: LayoutGrid,     tone: 'blue'    },
  { label: 'Fill Rate',         metric: 'fill_rate',           icon: Gauge,          tone: 'cyan'    },
];
