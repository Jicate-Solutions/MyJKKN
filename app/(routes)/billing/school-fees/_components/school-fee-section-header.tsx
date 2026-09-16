'use client';

// school-fee-section-header.tsx
//
// Gradient banner + section nav chips shared by every School Fees screen.
// The banner carries the section colour (see section-theme.ts); the chips
// let a user hop between the five sections without going back to the
// sidebar, and the active chip repeats the section colour.

import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';

import {
  SECTION_ORDER,
  SECTION_THEMES,
  type SchoolFeeSection,
} from './section-theme';

// Chips honour the same permission each route is gated on in
// MENU_PERMISSIONS, so a collector never sees a chip that 403s.
const CHIP_PERMISSION: Record<SchoolFeeSection, string> = {
  plans: 'read',
  calendar: 'read',
  concessions: 'read',
  generate: 'generate',
  collect: 'collect',
};

interface SchoolFeeSectionHeaderProps {
  section: SchoolFeeSection;
  title: string;
  description: ReactNode;
  /** Right-hand slot in the banner — primary actions for the section. */
  actions?: ReactNode;
  /** Hide the nav chips (e.g. on plan create/edit sub-pages). */
  hideNav?: boolean;
}

export function SchoolFeeSectionHeader({
  section,
  title,
  description,
  actions,
  hideNav,
}: SchoolFeeSectionHeaderProps) {
  const theme = SECTION_THEMES[section];
  const Icon = theme.icon;
  const { canAccess, isSuperAdmin } = usePermissions();

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl px-5 py-5 shadow-sm sm:px-6',
          theme.headerGradient,
        )}
      >
        {/* Soft decorative glow — kept subtle so text stays legible. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                theme.iconTile,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                School Fees · {theme.label}
              </p>
              <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm text-white/85">{description}</p>
            </div>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 [&_a]:shadow-sm [&_button]:shadow-sm">
              {actions}
            </div>
          ) : null}
        </div>
      </div>

      {!hideNav ? (
        <nav aria-label="School fee sections" className="flex flex-wrap gap-2">
          {SECTION_ORDER.filter(
            (key) => isSuperAdmin || canAccess('school_fees', CHIP_PERMISSION[key]),
          ).map((key) => {
            const t = SECTION_THEMES[key];
            const ChipIcon = t.icon;
            const active = key === section;
            return (
              <Link
                key={key}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? t.chipActive
                    : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <ChipIcon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
