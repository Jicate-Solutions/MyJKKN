// app/(routes)/audit/_components/redesign/kit.tsx
// Shared visual language for the redesigned auditor experience — used by the
// dashboard, cycle workspace, parameter sheet, findings, attestations, and the
// CARRE culture audit so every surface reads as one system.
//
// Design: an "instrument of record" — verdigris/emerald as the certified colour,
// claret/amber/sky for finding severity, mono for codes, disciplined spacing.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ParamStatus } from './param-status';

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------
export function ownerInitials(role: string): string {
  return role
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  hod: 'HoD',
  coe: 'CoE',
  coo: 'CoO',
  ceo: 'CEO',
  lead_auditor: 'Lead Auditor',
  event_coordinator: 'Event Coord.',
};

export function prettyRole(role: string | null | undefined): string {
  if (!role) return 'Unassigned';
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function OwnerChip({ role }: { role: string | null | undefined }) {
  if (!role) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
        {ownerInitials(role)}
      </span>
      {prettyRole(role)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------
export const STATUS_META: Record<ParamStatus, { label: string; className: string; dot: string }> = {
  cleared: {
    label: 'Cleared',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  p1: {
    label: 'Finding · High',
    className: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
    dot: 'bg-red-500',
  },
  p2: {
    label: 'Finding · Medium',
    className: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  observation: {
    label: 'Observation',
    className: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200',
    dot: 'bg-sky-500',
  },
  todo: {
    label: 'Not started',
    className: 'border-border bg-muted/40 text-muted-foreground',
    dot: 'bg-muted-foreground/50',
  },
};

export function StatusPill({ status, label }: { status: ParamStatus; label?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        m.className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {label ?? m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Coverage meter — proportional segments from a status tally
// ---------------------------------------------------------------------------
export interface StatusTally {
  cleared: number;
  p1: number;
  p2: number;
  observation: number;
  todo: number;
}

export function tally(statuses: ParamStatus[]): StatusTally {
  const t: StatusTally = { cleared: 0, p1: 0, p2: 0, observation: 0, todo: 0 };
  for (const s of statuses) t[s]++;
  return t;
}

export function CoverageMeter({ t, className }: { t: StatusTally; className?: string }) {
  const total = t.cleared + t.p1 + t.p2 + t.observation + t.todo || 1;
  const seg = (v: number, cls: string) =>
    v > 0 ? <span key={cls} className={cls} style={{ width: `${(v / total) * 100}%` }} /> : null;
  return (
    <div className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      {seg(t.cleared, 'block h-full bg-emerald-500')}
      {seg(t.p1, 'block h-full bg-red-500')}
      {seg(t.p2, 'block h-full bg-amber-500')}
      {seg(t.observation, 'block h-full bg-sky-500')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section eyebrow — the small uppercase kicker above a heading
// ---------------------------------------------------------------------------
export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// KPI tile — a stat with a severity accent stripe
// ---------------------------------------------------------------------------
type KpiTone = 'default' | 'warn' | 'crit' | 'neutral';
const KPI_STRIPE: Record<KpiTone, string> = {
  default: 'before:bg-emerald-500',
  warn: 'before:bg-amber-500',
  crit: 'before:bg-red-500',
  neutral: 'before:bg-muted-foreground/40',
};

export function KpiTile({
  label,
  value,
  suffix,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  sub?: string;
  tone?: KpiTone;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-4',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
        KPI_STRIPE[tone],
      )}
    >
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums leading-none">
        {value}
        {suffix ? <span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span> : null}
      </div>
      {sub ? <div className="mt-1.5 text-[11.5px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase stepper — the ordered cycle pipeline (the app lacked one)
// ---------------------------------------------------------------------------
const PHASE_STEPS: { key: string; label: string; phases: string[] }[] = [
  { key: 'draft', label: 'Draft', phases: ['draft'] },
  { key: 'in-progress', label: 'In progress', phases: ['in-progress'] },
  { key: 'review', label: 'Review & sign-off', phases: ['rectification', 'peer-visit', 'review'] },
  { key: 'sealed', label: 'Sealed', phases: ['closed'] },
];

function phaseIndex(phase: string): number {
  const i = PHASE_STEPS.findIndex((s) => s.phases.includes(phase));
  return i === -1 ? 0 : i;
}

export function PhaseStepper({ phase, className }: { phase: string; className?: string }) {
  const active = phaseIndex(phase);
  return (
    <div className={cn('flex flex-wrap items-center gap-y-2', className)}>
      {PHASE_STEPS.map((step, i) => {
        const done = i < active;
        const now = i === active;
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={cn(
                'flex items-center gap-2 text-xs font-semibold',
                done && 'text-foreground/80',
                now && 'text-emerald-700 dark:text-emerald-400',
                !done && !now && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[11px] font-mono',
                  done && 'border-emerald-500 bg-emerald-500 text-white',
                  now && 'border-emerald-500 bg-background text-emerald-600 ring-2 ring-emerald-500/20',
                  !done && !now && 'border-border bg-background text-muted-foreground',
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </div>
            {i < PHASE_STEPS.length - 1 && (
              <span className={cn('mx-2 h-px w-8', done ? 'bg-emerald-500' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
