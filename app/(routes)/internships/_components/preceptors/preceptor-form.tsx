'use client';

// PreceptorForm — shared by /internships/preceptors/new and /preceptors/[id] edit.
// Maps to InternshipPreceptor as shipped in lib/services/internships/types.ts.
//
// Spec line 247 mentions tying preceptors to a `custom_roles` row for OTP auth.
// The shipped useCreatePreceptor hook only writes to internship_preceptors today;
// the auth/role binding is wired in a follow-up substrate change. We expose all
// columns the row supports.

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
import type {
  InternshipPreceptor,
  CreatePreceptorInput,
} from '@/lib/services/internships/types';

export type PreceptorFormValues = {
  site_id: string;
  name: string;
  qualification: string;
  specialization: string;
  phone: string;
  email: string;
  max_trainees: string; // form-local; serialized to number on submit
  is_active: boolean;
};

export const EMPTY_PRECEPTOR_FORM: PreceptorFormValues = {
  site_id: '',
  name: '',
  qualification: '',
  specialization: '',
  phone: '',
  email: '',
  max_trainees: '',
  is_active: true,
};

export function preceptorToFormValues(p: InternshipPreceptor): PreceptorFormValues {
  return {
    site_id: p.site_id,
    name: p.name,
    qualification: p.qualification ?? '',
    specialization: p.specialization ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    max_trainees: p.max_trainees?.toString() ?? '',
    is_active: p.is_active,
  };
}

export function formValuesToCreatePayload(v: PreceptorFormValues): CreatePreceptorInput {
  return {
    site_id: v.site_id,
    name: v.name.trim(),
    qualification: v.qualification.trim() || null,
    specialization: v.specialization.trim() || null,
    phone: v.phone.trim() || null,
    email: v.email.trim() || null,
    max_trainees: v.max_trainees ? Number(v.max_trainees) : null,
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
  const { data: sites = [], isLoading: sitesLoading } = useSites(undefined, true);
  const [values, setValues] = useState<PreceptorFormValues>(
    initialValues ?? { ...EMPTY_PRECEPTOR_FORM, site_id: defaultSiteId ?? '' }
  );
  const [errors, setErrors] = useState<Partial<Record<keyof PreceptorFormValues, string>>>({});

  // Auto-pick first active site if none chosen and no defaultSiteId.
  useEffect(() => {
    if (!values.site_id && sites.length > 0) {
      setValues((v) => ({ ...v, site_id: sites[0].id }));
    }
  }, [sites, values.site_id]);

  const update = <K extends keyof PreceptorFormValues>(key: K, val: PreceptorFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof PreceptorFormValues, string>> = {};
    if (!values.site_id) next.site_id = 'Pick a site';
    if (!values.name.trim()) next.name = 'Name required';
    if (!values.phone.trim()) {
      next.phone = 'Phone required (preceptors log in by phone OTP)';
    } else if (!PHONE_REGEX.test(values.phone.trim())) {
      next.phone = 'Phone format looks off — use digits, +, -, spaces, ()';
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = 'Email format looks off';
    }
    if (values.max_trainees) {
      const n = Number(values.max_trainees);
      if (Number.isNaN(n) || n < 0) next.max_trainees = 'Must be 0 or greater';
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preceptor details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="prec-site">Primary site <span className="text-red-600">*</span></Label>
            <Select
              value={values.site_id}
              onValueChange={(v) => update('site_id', v)}
              disabled={isDisabled || sitesLoading || lockSite}
            >
              <SelectTrigger id="prec-site">
                <SelectValue placeholder={sitesLoading ? 'Loading sites…' : 'Select a site'} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
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
              value={values.name}
              onChange={(e) => update('name', e.target.value)}
              disabled={isDisabled}
              placeholder="Dr. Priya Ramanathan"
            />
            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
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

          <div className="space-y-1.5">
            <Label htmlFor="prec-specialization">Specialization / role</Label>
            <Input
              id="prec-specialization"
              value={values.specialization}
              onChange={(e) => update('specialization', e.target.value)}
              disabled={isDisabled}
              placeholder="Pediatrics consultant"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prec-phone">Phone <span className="text-red-600">*</span></Label>
            <Input
              id="prec-phone"
              type="tel"
              value={values.phone}
              onChange={(e) => update('phone', e.target.value)}
              disabled={isDisabled}
              placeholder="+91 98765 43210"
            />
            {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
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
            <Label htmlFor="prec-trainees">Max concurrent trainees</Label>
            <Input
              id="prec-trainees"
              type="number"
              min={0}
              value={values.max_trainees}
              onChange={(e) => update('max_trainees', e.target.value)}
              disabled={isDisabled}
              placeholder="e.g. 4"
            />
            {errors.max_trainees && <p className="text-xs text-red-600">{errors.max_trainees}</p>}
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
