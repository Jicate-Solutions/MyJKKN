'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HostelYearService } from '@/lib/services/campus-living/hostel-year-service';
import type { HostelYear } from '@/types/hostel-years';

/**
 * Scope bar for the Bed Economics dashboard — institution picker (default
 * "All") + hostel-year picker (default is_current).
 *
 * Precedent: adapts admission/group-dashboard yoy-institution-picker (direct
 * institutions query, JKKN% pattern) but renders with the campus-living
 * module's standard shadcn Select rather than the YoY editorial styling, so it
 * sits naturally beside the rest of the analytics surfaces. Copied into this
 * module per the no-cross-module-import rule.
 *
 * Spec: specs/bed-economics-dashboard-spec-2026-06-07.md §8 (scope bar).
 */

type Institution = { id: string; name: string };

const ALL_VALUE = '__all__';

type Props = {
  institutionId: string | null;
  hostelYearId: string | null;
  onInstitutionChange: (id: string | null) => void;
  onHostelYearChange: (id: string | null) => void;
};

export function BedEconScopeBar({
  institutionId,
  hostelYearId,
  onInstitutionChange,
  onHostelYearChange,
}: Props) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [years, setYears] = useState<HostelYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load institutions (JKKN colleges only) + hostel years; default year to
  // is_current. Runs once; selection defaults are pushed up via callbacks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClientSupabaseClient();
      // Surface a failed institutions fetch instead of silently leaving an
      // empty picker — a Supabase/RLS error here would otherwise look like
      // "no institutions exist".
      const { data: instData, error: instErr } = await supabase
        .from('institutions')
        .select('id, name')
        .like('name', 'JKKN%')
        .order('name');
      const yearList = await HostelYearService.getYears({ limit: 100 })
        .then((r) => r.data)
        .catch(() => [] as HostelYear[]);
      if (cancelled) return;

      if (instErr) {
        setLoadError(`Could not load institutions: ${instErr.message}`);
      }

      // Exclude non-residential / non-academic entities by name pattern,
      // mirroring the admission picker's exclude-list.
      const filteredInst = (instData ?? []).filter((i) => {
        const n = i.name;
        return (
          !n.includes('Main Office') &&
          !n.includes('Testing') &&
          !n.includes('Nattraja') &&
          !n.includes('Matric') &&
          !n.includes('Jicate')
        );
      });
      setInstitutions(filteredInst);
      setYears(yearList);

      // Default the hostel year to the current one if nothing is selected yet.
      if (!hostelYearId && yearList.length > 0) {
        const current = yearList.find((y) => y.is_current) ?? yearList[0];
        onHostelYearChange(current.id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount — the defaulting logic guards on the
    // current hostelYearId value at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Bed Economics</h1>
        <p className="text-sm text-muted-foreground">
          Return on every bed in campus living — utilisation, revenue, and cost per bed.
        </p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Institution picker — default "All institutions" (network view). */}
          <Select
            value={institutionId ?? ALL_VALUE}
            onValueChange={(v) => onInstitutionChange(v === ALL_VALUE ? null : v)}
            disabled={loading}
          >
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="All institutions" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All institutions</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {shorten(i.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Hostel-year picker — defaults to is_current. */}
          <Select
            value={hostelYearId ?? ''}
            onValueChange={(v) => onHostelYearChange(v || null)}
            disabled={loading || years.length === 0}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Hostel year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                  {y.is_current ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {loadError && (
          <p className="text-xs text-destructive" role="alert">
            {loadError}
          </p>
        )}
      </div>
    </div>
  );
}

function shorten(name: string): string {
  return name
    .replace(/^JKKN College of /i, '')
    .replace(/^JKKN /i, '')
    .replace(/ and Technology$/, ' Tech')
    .replace(/ and Research$/, '')
    .replace(/ and Hospital$/, '')
    .trim();
}
