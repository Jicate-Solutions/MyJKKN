'use client';

// ============================================================================
// AcademicDimensionsSummary
// ----------------------------------------------------------------------------
// Read-only colour-coded preview of a learner's 8 academic dimensions:
//   Institution, Degree, Department, Programme,
//   Admission Year, Quota, Community, Accommodation
//
// Used by AccountVerificationDialog as a "look before you leap" surface so
// the admin can spot wrong dims (wrong programme, wrong admission year, etc)
// before triggering the atomic bill-generation RPC.
//
// 2026-05-21 v2 — Removed per-row verified checkboxes. The dialog is purely
// a preview; if something's wrong the admin cancels and edits the enquiry.
// Layout is now an icon-grid: each card has a tinted icon disc, a label,
// and the resolved name. Responsive: 1 col mobile → 2 col sm → 4 col lg.
//
// Resolution is done via direct Supabase queries + LookupService (FK-first,
// text fallback). Missing values render '—' in italic amber so the operator
// notices the gap and goes back to fix the source.
// ============================================================================

import { useEffect, useState } from 'react';
import {
  Building2,
  GraduationCap,
  Boxes,
  BookOpenCheck,
  CalendarRange,
  Award,
  Users,
  Home,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LookupService } from '@/lib/services/admission/lookup-service';
import type { LearnerProfile } from '@/types/learner-profile';

interface Props {
  learner: LearnerProfile;
}

type LabelKey =
  | 'institution'
  | 'degree'
  | 'department'
  | 'programme'
  | 'admission_year'
  | 'quota'
  | 'community'
  | 'accommodation';

interface RowDef {
  key: LabelKey;
  label: string;
  Icon: typeof Building2;
  /** Tailwind classes for the icon disc background + foreground colour. */
  tint: string;
  /** Tailwind classes for the card's left-edge accent border. */
  accent: string;
}

const ROWS: RowDef[] = [
  { key: 'institution',    label: 'Institution',    Icon: Building2,     tint: 'bg-blue-100 text-blue-700',      accent: 'border-l-blue-400' },
  { key: 'degree',         label: 'Degree',         Icon: GraduationCap, tint: 'bg-indigo-100 text-indigo-700',  accent: 'border-l-indigo-400' },
  { key: 'department',     label: 'Department',     Icon: Boxes,         tint: 'bg-sky-100 text-sky-700',        accent: 'border-l-sky-400' },
  { key: 'programme',      label: 'Programme',      Icon: BookOpenCheck, tint: 'bg-cyan-100 text-cyan-700',      accent: 'border-l-cyan-400' },
  { key: 'admission_year', label: 'Admission Year', Icon: CalendarRange, tint: 'bg-purple-100 text-purple-700',  accent: 'border-l-purple-400' },
  { key: 'quota',          label: 'Quota',          Icon: Award,         tint: 'bg-amber-100 text-amber-800',    accent: 'border-l-amber-400' },
  { key: 'community',      label: 'Community',      Icon: Users,         tint: 'bg-emerald-100 text-emerald-700', accent: 'border-l-emerald-400' },
  { key: 'accommodation',  label: 'Accommodation',  Icon: Home,          tint: 'bg-pink-100 text-pink-700',      accent: 'border-l-pink-400' },
];

export function AcademicDimensionsSummary({ learner }: Props) {
  const [labels, setLabels] = useState<Record<LabelKey, string>>({
    institution: '',
    degree: '',
    department: '',
    programme: '',
    admission_year: '',
    quota: '',
    community: '',
    accommodation: '',
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();

    (async () => {
      const next: Record<LabelKey, string> = {
        institution: '', degree: '', department: '', programme: '',
        admission_year: '', quota: '', community: '', accommodation: '',
      };

      const tasks: Array<Promise<unknown>> = [];

      if (learner.institution_id) {
        tasks.push(
          (supabase as any).from('institutions').select('name').eq('id', learner.institution_id).maybeSingle()
            .then(({ data }: any) => { if (data?.name) next.institution = data.name; }),
        );
      }
      if (learner.degree_id) {
        tasks.push(
          (supabase as any).from('degrees').select('degree_name').eq('id', learner.degree_id).maybeSingle()
            .then(({ data }: any) => { if (data?.degree_name) next.degree = data.degree_name; }),
        );
      }
      if (learner.department_id) {
        tasks.push(
          (supabase as any).from('departments').select('department_name').eq('id', learner.department_id).maybeSingle()
            .then(({ data }: any) => { if (data?.department_name) next.department = data.department_name; }),
        );
      }
      if (learner.program_id) {
        tasks.push(
          (supabase as any).from('programs').select('program_name').eq('id', learner.program_id).maybeSingle()
            .then(({ data }: any) => { if (data?.program_name) next.programme = data.program_name; }),
        );
      }
      if (learner.admission_year_id) {
        tasks.push(
          (supabase as any).from('admission_years').select('admission_year_name').eq('id', learner.admission_year_id).maybeSingle()
            .then(({ data }: any) => { if (data?.admission_year_name) next.admission_year = data.admission_year_name; }),
        );
      }

      tasks.push(
        LookupService.listQuotas(true).then((rows) => {
          const fk = (learner as { quota_id?: string }).quota_id;
          const text = (learner as { quota?: string }).quota;
          const match =
            (fk && rows.find((r) => r.id === fk)) ??
            (text && rows.find((r) => r.code.toLowerCase() === text.trim().toLowerCase() || r.name.toLowerCase() === text.trim().toLowerCase()));
          if (match) next.quota = match.name;
          else if (text) next.quota = text;
        }),
      );
      tasks.push(
        LookupService.listCommunityCategories(true).then((rows) => {
          const fk = (learner as { community_category_id?: string }).community_category_id;
          const text = (learner as { community?: string }).community;
          const match =
            (fk && rows.find((r) => r.id === fk)) ??
            (text && rows.find((r) => r.code.toLowerCase() === text.trim().toLowerCase() || r.name.toLowerCase() === text.trim().toLowerCase()));
          if (match) next.community = match.name;
          else if (text) next.community = text;
        }),
      );
      tasks.push(
        LookupService.listAccommodationTypes(true).then((rows) => {
          const fk = (learner as { accommodation_type_id?: string }).accommodation_type_id;
          const text = (learner as { accommodation_type?: string }).accommodation_type;
          const match =
            (fk && rows.find((r) => r.id === fk)) ??
            (text && rows.find((r) => r.code.toLowerCase() === text.trim().toLowerCase() || r.name.toLowerCase() === text.trim().toLowerCase()));
          if (match) next.accommodation = match.name;
          else if (text) next.accommodation = text;
        }),
      );

      await Promise.allSettled(tasks);
      if (!cancelled) setLabels(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    learner.institution_id,
    learner.degree_id,
    learner.department_id,
    learner.program_id,
    learner.admission_year_id,
    JSON.stringify({
      q: (learner as { quota?: string }).quota,
      qf: (learner as { quota_id?: string }).quota_id,
      c: (learner as { community?: string }).community,
      cf: (learner as { community_category_id?: string }).community_category_id,
      a: (learner as { accommodation_type?: string }).accommodation_type,
      af: (learner as { accommodation_type_id?: string }).accommodation_type_id,
    }),
  ]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ROWS.map(({ key, label, Icon, tint, accent }) => {
        const value = labels[key];
        const isMissing = !value;
        return (
          <div
            key={key}
            className={[
              'flex items-start gap-3 rounded-lg border-l-4 bg-card p-3 shadow-sm transition-shadow hover:shadow-md',
              accent,
            ].join(' ')}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tint}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p
                className={
                  isMissing
                    ? 'mt-0.5 text-sm italic text-amber-700 dark:text-amber-400'
                    : 'mt-0.5 truncate text-sm font-semibold text-foreground'
                }
                title={value || 'Not set'}
              >
                {value || 'Not set — please edit enquiry'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
