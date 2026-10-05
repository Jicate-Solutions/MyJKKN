'use client';

// The "Reporter" section at the top of the report-an-issue and request-an-item
// forms — ported from the standalone app (components/filed-as.tsx and the
// Reporter card of app/(app)/issues/new/_components/issue-form.tsx).
//
// Who the report is filed as, from the person's MyJKKN record
// (instasolver_my_reporter_profile): a compact identity card, their own
// institution pre-filled read-only (with a link to report for another one),
// their mobile pre-filled read-only when MyJKKN has it, and an optional
// alternative number.

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstitutions, useReporterProfile } from '@/hooks/instasolver/use-instasolver';
import type { ReporterProfile } from '@/types/instasolver';

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? '').trim() || (email ?? '').split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

// JKKN terminology for the role-name fallback. The keys are MyJKKN's stored
// role names (data values), mapped to the words people should read.
const ROLE_NAME_TO_JKKN: Record<string, string> = {
  'student': 'Learner',
  'students': 'Learner',
  'faculty': 'Senior Learner',
  'teacher': 'Senior Learner',
  'teachers': 'Senior Learner',
  'staff': 'Team member'
};

function displayDesignation(d: string | null | undefined): string | null {
  if (!d) return null;
  return ROLE_NAME_TO_JKKN[d.trim().toLowerCase()] ?? d;
}

/** A numbered section heading, as on the standalone forms. */
export function FormStepTitle({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2 text-base">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </span>
      {children}
    </CardTitle>
  );
}

export function RequiredMark() {
  return (
    <span className="ml-0.5 text-red-600" aria-hidden>
      *
    </span>
  );
}

function FiledAs({ profile }: { profile: ReporterProfile }) {
  const designation = displayDesignation(profile.designation);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3 sm:col-span-2">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
          {initials(profile.full_name, profile.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{profile.full_name ?? 'Your account'}</p>
        <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
        {designation ? <p className="truncate text-xs font-medium text-primary sm:hidden">{designation}</p> : null}
      </div>
      {designation ? (
        <span className="hidden shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary sm:inline">
          {designation}
        </span>
      ) : null}
    </div>
  );
}

export interface ReporterValues {
  institution_id: string;
  contact_phone: string;
  alternate_phone: string;
}

export function ReporterSection({
  kind,
  values,
  onChange,
  errors
}: {
  kind: 'issue' | 'requirement';
  values: ReporterValues;
  onChange: (field: keyof ReporterValues, value: string) => void;
  errors?: Partial<Record<keyof ReporterValues, string | undefined>>;
}) {
  const { data: profile, isLoading } = useReporterProfile();
  const { data: institutions, isLoading: loadingInstitutions } = useInstitutions();
  const [pickInstitution, setPickInstitution] = useState(false);

  const ownInstitution = profile?.institution_id ?? null;
  const ownPhone = profile?.phone ?? null;

  // Pre-fill once the profile arrives — institution and mobile come from
  // MyJKKN, so the reporter only confirms them.
  useEffect(() => {
    if (!profile) return;
    if (ownInstitution && !values.institution_id) onChange('institution_id', ownInstitution);
    if (ownPhone && !values.contact_phone) onChange('contact_phone', ownPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const showPicker = pickInstitution || !ownInstitution;
  const noun = kind === 'issue' ? 'report' : 'request';

  return (
    <Card>
      <CardHeader className="pb-3">
        <FormStepTitle step={1}>{kind === 'issue' ? 'Reporter' : 'Requester'}</FormStepTitle>
        <CardDescription>From your MyJKKN profile. This is who the {noun} is filed as.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {isLoading || !profile ? (
          <Skeleton className="h-16 w-full sm:col-span-2" />
        ) : (
          <FiledAs profile={profile} />
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reporter-institution">
            Institution
            <RequiredMark />
          </Label>
          {!showPicker ? (
            <>
              <Input
                id="reporter-institution"
                value={profile?.institution_name ?? 'Your institution'}
                readOnly
                disabled
              />
              <button
                type="button"
                className="self-start text-xs text-primary underline underline-offset-2"
                onClick={() => setPickInstitution(true)}
              >
                {kind === 'issue' ? 'Report for a different institution?' : 'Request for a different institution?'}
              </button>
            </>
          ) : (
            <>
              <Select
                value={values.institution_id || undefined}
                onValueChange={(v) => onChange('institution_id', v)}
                disabled={loadingInstitutions}
              >
                <SelectTrigger id="reporter-institution" aria-invalid={!!errors?.institution_id}>
                  <SelectValue placeholder="Choose an institution" />
                </SelectTrigger>
                <SelectContent>
                  {(institutions ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ownInstitution ? (
                <button
                  type="button"
                  className="self-start text-xs text-muted-foreground underline underline-offset-2"
                  onClick={() => {
                    onChange('institution_id', ownInstitution);
                    setPickInstitution(false);
                  }}
                >
                  Use my own institution instead
                </button>
              ) : null}
            </>
          )}
          {errors?.institution_id ? <p className="text-xs text-destructive">{errors.institution_id}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reporter-phone">
            Mobile number
            <RequiredMark />
          </Label>
          <Input
            id="reporter-phone"
            type="tel"
            inputMode="tel"
            readOnly={Boolean(ownPhone)}
            placeholder="A mobile the team can reach you on"
            value={values.contact_phone}
            onChange={(e) => onChange('contact_phone', e.target.value)}
            aria-invalid={!!errors?.contact_phone}
          />
          {!isLoading && !ownPhone ? (
            <p className="text-xs text-muted-foreground">No mobile on your MyJKKN profile — please add one.</p>
          ) : null}
          {errors?.contact_phone ? <p className="text-xs text-destructive">{errors.contact_phone}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reporter-alt-phone">
            Alternative number <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="reporter-alt-phone"
            type="tel"
            inputMode="tel"
            placeholder="Another number the team can try"
            value={values.alternate_phone}
            onChange={(e) => onChange('alternate_phone', e.target.value)}
            aria-invalid={!!errors?.alternate_phone}
          />
          {errors?.alternate_phone ? <p className="text-xs text-destructive">{errors.alternate_phone}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
