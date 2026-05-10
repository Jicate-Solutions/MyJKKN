'use client';

// PreceptorForm — shared by /internships/preceptors/new and /preceptors/[id] edit.
// Maps to substrate v3 internship_preceptors columns. Recovered thin types
// (name/phone/max_trainees) drifted from live schema (full_name/mobile/max_students
// + institution_id + designation + scope_type). Reconciled 2026-05-10.

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSites } from '@/hooks/internships/useSites';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import type {
  InternshipPreceptor,
  CreatePreceptorInput,
  PreceptorScopeType,
} from '@/lib/services/internships/types';

const SCOPE_OPTIONS: { value: PreceptorScopeType; label: string; hint: string }[] = [
  { value: 'cycle', label: 'Cycle', hint: 'Sign-off authority limited to assigned cycle' },
  { value: 'site', label: 'Site', hint: 'Authority over all learners at this site' },
  { value: 'institution', label: 'Institution', hint: 'Authority across the whole institution' },
];

export type PreceptorFormValues = {
  institution_id: string;
  site_id: string;
  full_name: string;
  designation: string;
  qualification: string;
  specialization: string;
  mobile: string;
  email: string;
  max_students: string; // form-local; serialized to number on submit
  scope_type: PreceptorScopeType;
  is_active: boolean;
};

export const EMPTY_PRECEPTOR_FORM: PreceptorFormValues = {
  institution_id: '',
  site_id: '',
  full_name: '',
  designation: '',
  qualification: '',
  specialization: '',
  mobile: '',
  email: '',
  max_students: '6',
  scope_type: 'cycle',
  is_active: true,
};

export function preceptorToFormValues(p: InternshipPreceptor): PreceptorFormValues {
  return {
    institution_id: p.institution_id,
    site_id: p.site_id,
    full_name: p.full_name,
    designation: p.designation ?? '',
    qualification: p.qualification ?? '',
    specialization: p.specialization ?? '',
    mobile: p.mobile ?? '',
    email: p.email ?? '',
    max_students: (p.max_students ?? 6).toString(),
    scope_type: p.scope_type,
    is_active: p.is_active,
  };
}

export function formValuesToCreatePayload(v: PreceptorFormValues): CreatePreceptorInput {
  return {
    institution_id: v.institution_id,
    site_id: v.site_id,
    full_name: v.full_name.trim(),
    designation: v.designation.trim() || null,
    qualification: v.qualification.trim() || null,
    specialization: v.specialization.trim() || null,
    mobile: v.mobile.trim() || null,
    email: v.email.trim() || null,
    max_students: v.max_students ? Number(v.max_students) : 6,
    scope_type: v.scope_type,
    is_active: v.is_active,
  };
}

interface PreceptorFormProps {
  initialValues?: PreceptorFormValues;
  /** Optional pre-selection — used when launched from a site detail page. */
  defaultSiteId?: string;
  onSubmit: (values: PreceptorFormValues) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  /** When editing, the site_id select is locked. */
  lockSite?: boolean;
}

const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

export function PreceptorForm({
  initialValues,
  defaultSiteId,
  onSubmit,
  onCancel,
  submitLabel = 'Save preceptor',
  submitting = false,
  lockSite = false,
}: PreceptorFormProps) {
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const [values, setValues] = useState<PreceptorFormValues>(
    initialValues ?? { ...EMPTY_PRECEPTOR_FORM, site_id: defaultSiteId ?? '' }
  );

  // Sites filtered by selected institution to keep the site dropdown sane.
  const institutionScope = values.institution_id || undefined;
  const { data: sites = [], isLoading: sitesLoading } = useSites(institutionScope, true);

  const [errors, setErrors] = useState<Partial<Record<keyof PreceptorFormValues, string>>>({});

  // Default to the first accessible institution once loaded.
  useEffect(() => {
    if (!values.institution_id && institutions.length > 0) {
      setValues((v) => ({ ...v, institution_id: institutions[0].institution_id }));
    }
  }, [institutions, values.institution_id]);

  // Auto-pick first active site for the institution once sites load.
  useEffect(() => {
    if (!values.site_id && sites.length > 0) {
      setValues((v) => ({ ...v, site_id: sites[0].id }));
    }
  }, [sites, values.site_id]);

  // If institution changes and the currently-picked site doesn't belong to it,
  // clear the site choice. Avoids RLS write-rejections on submit.
  useEffect(() => {
    if (lockSite) return;
    if (!values.site_id) return;
    const ok = sites.some((s) => s.id === values.site_id);
    if (!sitesLoading && !ok) {
      setValues((v) => ({ ...v, site_id: '' }));
    }
  }, [sites, sitesLoading, values.site_id, lockSite]);

  const update = <K extends keyof PreceptorFormValues>(key: K, val: PreceptorFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof PreceptorFormValues, string>> = {};
    if (!values.institution_id) next.institution_id = 'Pick a college';
    if (!values.site_id) next.site_id = 'Pick a site';
    if (!values.full_name.trim()) next.full_name = 'Full name required';
    if (values.mobile && !PHONE_REGEX.test(values.mobile.trim())) {
      next.mobile = 'Phone format looks off — use digits, +, -, spaces, ()';
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = 'Email format looks off';
    }
    if (values.max_students) {
      const n = Number(values.max_students);
      if (Number.isNaN(n) || n < 0) next.max_students = 'Must be 0 or greater';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(values);
  };

  const isDisabled = submitting;
  const activeScope = SCOPE_OPTIONS.find((s) => s.value === values.scope_type);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preceptor details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="prec-institution">College <span className="text-red-600">*</span></Label>
            <Select
              value={values.institution_id}
              onValueChange={(v) => update('institution_id', v)}
              disabled={isDisabled || institutionsLoading || lockSite}
            >
              <SelectTrigger id="prec-institution">
                <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Select college'} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.institution_id} value={inst.institution_id}>
                    {inst.institution_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.institution_id && (
              <p className="text-xs text-red-600">{errors.institution_id}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-site">Primary site <span className="text-red-600">*</span></Label>
            <Select
              value={values.site_id}
              onValueChange={(v) => update('site_id', v)}
              disabled={isDisabled || sitesLoading || lockSite || !values.institution_id}
            >
              <SelectTrigger id="prec-site">
                <SelectValue placeholder={sitesLoading ? 'Loading sites…' : 'Select a site'} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.site_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.site_id && <p className="text-xs text-red-600">{errors.site_id}</p>}
            {lockSite && (
              <p className="text-xs text-muted-foreground">
                Site cannot be changed after creation. Create a new preceptor record to assign elsewhere.
              </p>
            )}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="prec-name">Full name <span className="text-red-600">*</span></Label>
            <Input
              id="prec-name"
              value={values.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              disabled={isDisabled}
              placeholder="Dr. Priya Ramanathan"
            />
            {errors.full_name && <p className="text-xs text-red-600">{errors.full_name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-designation">Designation</Label>
            <Input
              id="prec-designation"
              value={values.designation}
              onChange={(e) => update('designation', e.target.value)}
              disabled={isDisabled}
              placeholder="Senior Consultant"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-qualification">Qualification</Label>
            <Input
              id="prec-qualification"
              value={values.qualification}
              onChange={(e) => update('qualification', e.target.value)}
              disabled={isDisabled}
              placeholder="MBBS, MD"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="prec-specialization">Specialization</Label>
            <Input
              id="prec-specialization"
              value={values.specialization}
              onChange={(e) => update('specialization', e.target.value)}
              disabled={isDisabled}
              placeholder="Pediatrics"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-mobile">Mobile</Label>
            <Input
              id="prec-mobile"
              type="tel"
              value={values.mobile}
              onChange={(e) => update('mobile', e.target.value)}
              disabled={isDisabled}
              placeholder="+91 98765 43210"
            />
            <p className="text-xs text-muted-foreground">Used for OTP sign-in on the hospital portal.</p>
            {errors.mobile && <p className="text-xs text-red-600">{errors.mobile}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-email">Email</Label>
            <Input
              id="prec-email"
              type="email"
              value={values.email}
              onChange={(e) => update('email', e.target.value)}
              disabled={isDisabled}
              placeholder="preceptor@hospital.org"
            />
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-max">Max concurrent students</Label>
            <Input
              id="prec-max"
              type="number"
              min={0}
              value={values.max_students}
              onChange={(e) => update('max_students', e.target.value)}
              disabled={isDisabled}
              placeholder="6"
            />
            {errors.max_students && <p className="text-xs text-red-600">{errors.max_students}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-scope">Sign-off scope</Label>
            <Select
              value={values.scope_type}
              onValueChange={(v) => update('scope_type', v as PreceptorScopeType)}
              disabled={isDisabled}
            >
              <SelectTrigger id="prec-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeScope && (
              <p className="text-xs text-muted-foreground">{activeScope.hint}</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
            <div>
              <Label htmlFor="prec-active" className="text-sm">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive preceptors do not appear in cycle assignment selectors.
              </p>
            </div>
            <Switch
              id="prec-active"
              checked={values.is_active}
              onCheckedChange={(c) => update('is_active', c)}
              disabled={isDisabled}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isDisabled}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isDisabled}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
