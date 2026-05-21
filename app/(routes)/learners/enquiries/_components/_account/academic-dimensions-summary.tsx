'use client';

// ============================================================================
// AcademicDimensionsSummary
// ----------------------------------------------------------------------------
// Renders an 8-row read-only summary of a learner's academic dimensions:
//   Institution, Degree, Department, Programme,
//   Admission Year, Quota, Community, Accommodation
//
// When `requireVerification` is true, each row carries a checkbox; the parent
// receives an `allVerified` boolean via `onVerificationChange` callback. This
// is the gate that an admin must pass before account-transition confirms.
//
// Design rationale:
//   - Resolution is done via direct supabase queries scoped to the IDs on
//     the learner — same pattern as finance-details.tsx so we don't have to
//     introduce a new hooks layer for one component.
//   - FK columns are preferred (institution_id, quota_id, ...). Falls back
//     to the legacy text columns (quota, community, accommodation_type)
//     when the FK is null but the text is populated.
//   - Missing values render "—" instead of being skipped; the admin should
//     see a visual gap and know to fix the source data before confirming.
// 2026-05-21 — Created as part of Phase 1 of the pre-account verification
//              flow (account-verification-dialog rollout).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LookupService } from '@/lib/services/admission/lookup-service';
import type { LearnerProfile } from '@/types/learner-profile';

interface Props {
  learner: LearnerProfile;
  /** When true, each row renders a "Verified" checkbox and parent receives
   *  allVerified via onVerificationChange. */
  requireVerification?: boolean;
  onVerificationChange?: (allVerified: boolean) => void;
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

const ROW_ORDER: Array<{ key: LabelKey; label: string }> = [
  { key: 'institution',    label: 'Institution' },
  { key: 'degree',         label: 'Degree' },
  { key: 'department',     label: 'Department' },
  { key: 'programme',      label: 'Programme' },
  { key: 'admission_year', label: 'Admission Year' },
  { key: 'quota',          label: 'Quota' },
  { key: 'community',      label: 'Community' },
  { key: 'accommodation',  label: 'Accommodation' },
];

export function AcademicDimensionsSummary({
  learner,
  requireVerification = false,
  onVerificationChange,
}: Props) {
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
  const [checked, setChecked] = useState<Record<LabelKey, boolean>>({
    institution: false,
    degree: false,
    department: false,
    programme: false,
    admission_year: false,
    quota: false,
    community: false,
    accommodation: false,
  });

  // Resolve all 8 dim labels in parallel. Empty / null IDs render "—".
  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();

    (async () => {
      const next: Record<LabelKey, string> = {
        institution: '',
        degree: '',
        department: '',
        programme: '',
        admission_year: '',
        quota: '',
        community: '',
        accommodation: '',
      };

      const tasks: Array<Promise<unknown>> = [];

      // Org-side FK lookups
      if (learner.institution_id) {
        tasks.push(
          (supabase as any)
            .from('institutions')
            .select('name')
            .eq('id', learner.institution_id)
            .maybeSingle()
            .then(({ data }: any) => {
              if (data?.name) next.institution = data.name;
            }),
        );
      }
      if (learner.degree_id) {
        tasks.push(
          (supabase as any)
            .from('degrees')
            .select('degree_name')
            .eq('id', learner.degree_id)
            .maybeSingle()
            .then(({ data }: any) => {
              if (data?.degree_name) next.degree = data.degree_name;
            }),
        );
      }
      if (learner.department_id) {
        tasks.push(
          (supabase as any)
            .from('departments')
            .select('department_name')
            .eq('id', learner.department_id)
            .maybeSingle()
            .then(({ data }: any) => {
              if (data?.department_name) next.department = data.department_name;
            }),
        );
      }
      if (learner.program_id) {
        tasks.push(
          (supabase as any)
            .from('programs')
            .select('program_name')
            .eq('id', learner.program_id)
            .maybeSingle()
            .then(({ data }: any) => {
              if (data?.program_name) next.programme = data.program_name;
            }),
        );
      }
      if (learner.admission_year_id) {
        tasks.push(
          (supabase as any)
            .from('admission_years')
            .select('admission_year_name')
            .eq('id', learner.admission_year_id)
            .maybeSingle()
            .then(({ data }: any) => {
              if (data?.admission_year_name) next.admission_year = data.admission_year_name;
            }),
        );
      }

      // Demographic FK/text lookups — prefer FK id, fall back to legacy text
      // column when the FK is null but the text is populated.
      tasks.push(
        LookupService.listQuotas(true).then((rows) => {
          const fk = (learner as { quota_id?: string }).quota_id;
          const text = (learner as { quota?: string }).quota;
          const match =
            (fk && rows.find((r) => r.id === fk)) ??
            (text && rows.find((r) => r.code.toLowerCase() === text.trim().toLowerCase() || r.name.toLowerCase() === text.trim().toLowerCase()));
          if (match) next.quota = match.name;
          else if (text) next.quota = text; // raw text fallback
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
      if (learner.institution_id) {
        tasks.push(
          LookupService.listAccommodationTypes(learner.institution_id, true).then((rows) => {
            const fk = (learner as { accommodation_type_id?: string }).accommodation_type_id;
            const text = (learner as { accommodation_type?: string }).accommodation_type;
            const match =
              (fk && rows.find((r) => r.id === fk)) ??
              (text && rows.find((r) => r.code.toLowerCase() === text.trim().toLowerCase() || r.name.toLowerCase() === text.trim().toLowerCase()));
            if (match) next.accommodation = match.name;
            else if (text) next.accommodation = text;
          }),
        );
      }

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
    // Defensive: refetch when any text or FK fields change.
    JSON.stringify({
      q: (learner as { quota?: string }).quota,
      qf: (learner as { quota_id?: string }).quota_id,
      c: (learner as { community?: string }).community,
      cf: (learner as { community_category_id?: string }).community_category_id,
      a: (learner as { accommodation_type?: string }).accommodation_type,
      af: (learner as { accommodation_type_id?: string }).accommodation_type_id,
    }),
  ]);

  // Bubble up allVerified whenever the checked map changes.
  const allVerified = useMemo(
    () => ROW_ORDER.every(({ key }) => checked[key]),
    [checked],
  );

  useEffect(() => {
    if (requireVerification) {
      onVerificationChange?.(allVerified);
    }
  }, [allVerified, requireVerification, onVerificationChange]);

  return (
    <div className="rounded-md border bg-card divide-y">
      {ROW_ORDER.map(({ key, label }) => {
        const value = labels[key] || '—';
        const isMissing = !labels[key];

        return (
          <div
            key={key}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            {requireVerification && (
              <Checkbox
                id={`verify-${key}`}
                checked={checked[key]}
                disabled={isMissing}
                onCheckedChange={(v) =>
                  setChecked((prev) => ({ ...prev, [key]: v === true }))
                }
                aria-label={`Verified — ${label}`}
              />
            )}
            <label
              htmlFor={requireVerification ? `verify-${key}` : undefined}
              className="flex flex-1 items-center justify-between gap-3"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span
                className={
                  isMissing
                    ? 'text-sm text-amber-700 dark:text-amber-400 italic'
                    : 'text-sm font-medium text-foreground'
                }
              >
                {value}
              </span>
            </label>
          </div>
        );
      })}
      {requireVerification && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30">
          Tick every row above to confirm each dimension is correct. The
          Confirm button enables only when all eight are verified.
        </div>
      )}
    </div>
  );
}
