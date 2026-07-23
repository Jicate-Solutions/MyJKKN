'use client';

// Foundation — shared module header. The module's identity block: an examiner's
// eyebrow over a tight title, a hairline rule, and an optional right-aligned
// action/stat slot. Kept deliberately quiet so the MasteryMeter stays the one
// bold element in the module.

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Crumb {
  label: string;
  href?: string;
}

interface FoundationHeaderProps {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  /** Right-aligned slot for actions or a stat strip. */
  actions?: React.ReactNode;
  className?: string;
}

export function FoundationHeader({
  title,
  subtitle,
  crumbs,
  actions,
  className,
}: FoundationHeaderProps) {
  return (
    <header className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0b6d41]">
        <span
          aria-hidden
          className="inline-block h-3 w-3 rounded-[3px] bg-[#0b6d41]"
        />
        Foundation · Competitive-Exam
      </div>

      {crumbs && crumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
              {c.href ? (
                <Link
                  href={c.href}
                  className="transition-colors hover:text-[#0b6d41]"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
            {title}
          </h1>
          {subtitle && (
            <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

/** A single tabular-nums stat cell for header stat strips. */
export function HeaderStat({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-[72px]">
      <div className="font-mono text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
