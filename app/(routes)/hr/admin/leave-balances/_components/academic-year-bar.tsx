'use client';

/**
 * The page's year selector.
 *
 * Owned by the page rather than by either tab, because both read it: the
 * Analytics tab reports coverage for this year and the Generate tab provisions
 * into it. When each tab kept its own selection you could act on one year while
 * reading another.
 *
 * Selection only — this bar does not create years. HR academic years are owned
 * by their own module at /hr/admin/academic-years, which is where they are
 * created and edited. A second creation entry point here meant the same record
 * could be authored from two screens with different surrounding context.
 */

import Link from 'next/link';

import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useHRAcademicYears } from '@/hooks/hr/use-hr-academic-years';

const CURRENT = '__current__';

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

interface Props {
  /** Null = "the year containing today", resolved server-side. */
  value: string | null;
  onChange: (v: string | null) => void;
}

export function AcademicYearBar({ value, onChange }: Props) {
  const { data: years = [], isLoading } = useHRAcademicYears({ isActive: true });

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = years.find((y) => y.start_date <= today && today <= y.end_date);
  const selected = value ? years.find((y) => y.id === value) : currentYear;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[240px]">
        <Label className="text-xs text-muted-foreground">HR academic year</Label>
        <Select
          value={value ?? CURRENT}
          onValueChange={(v) => onChange(v === CURRENT ? null : v)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={isLoading ? 'Loading…' : 'Select a year'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CURRENT}>
              Current year{currentYear ? ` — ${currentYear.year_name}` : ''}
            </SelectItem>
            {years.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.year_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <div className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <span>
            {fmtDate(selected.start_date)} → {fmtDate(selected.end_date)}
          </span>
          {selected.id === currentYear?.id && (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400"
            >
              Current
            </Badge>
          )}
        </div>
      )}

      {/* An empty calendar is a dead end for both tabs, so name the fix here
          rather than letting each tab render its own version of "no years".
          The link is the only route to creating one — this page selects, it
          does not author. */}
      {!isLoading && years.length === 0 && (
        <p className="w-full text-xs text-destructive">
          No HR academic years are configured. Create one in{' '}
          <Link href="/hr/admin/academic-years" className="underline underline-offset-2">
            HR Academic Years
          </Link>{' '}
          before generating balances.
        </p>
      )}
    </div>
  );
}
