'use client';

// SiteForm — shared by /internships/sites/new and /internships/sites/[id] (edit mode).
// Maps directly to the columns shipped in lib/services/internships/types.ts
// (InternshipExternalSite). The agent prompt mentioned geofence + operates_weekends fields,
// but those columns do NOT exist on the shipped substrate yet — we render only the
// fields that round-trip to the database, per the BASH-PROVES-TRUTH rule.

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import type {
  InternshipExternalSite,
  SiteType,
} from '@/lib/services/internships/types';
import { SITE_TYPE_OPTIONS } from './site-type-options';

export type SiteFormValues = {
  institution_id: string;
  name: string;
  site_type: SiteType;
  address: string;
  city: string;
  state: string;
  pincode: string;
  capacity: string; // string in form → number on submit
  mou_signed: boolean;
  mou_expiry_date: string;
  is_active: boolean;
  notes: string;
};

export const EMPTY_SITE_FORM: SiteFormValues = {
  institution_id: '',
  name: '',
  site_type: 'hospital',
  address: '',
  city: '',
  state: '',
  pincode: '',
  capacity: '',
  mou_signed: false,
  mou_expiry_date: '',
  is_active: true,
  notes: '',
};

export function siteToFormValues(site: InternshipExternalSite): SiteFormValues {
  return {
    institution_id: site.institution_id,
    name: site.name,
    site_type: site.site_type,
    address: site.address ?? '',
    city: site.city ?? '',
    state: site.state ?? '',
    pincode: site.pincode ?? '',
    capacity: site.capacity?.toString() ?? '',
    mou_signed: site.mou_signed,
    mou_expiry_date: site.mou_expiry_date ?? '',
    is_active: site.is_active,
    notes: site.notes ?? '',
  };
}

export function formValuesToCreatePayload(values: SiteFormValues) {
  return {
    institution_id: values.institution_id,
    name: values.name.trim(),
    site_type: values.site_type,
    address: values.address.trim() || null,
    city: values.city.trim() || null,
    state: values.state.trim() || null,
    pincode: values.pincode.trim() || null,
    capacity: values.capacity ? Number(values.capacity) : null,
    mou_signed: values.mou_signed,
    mou_expiry_date: values.mou_signed && values.mou_expiry_date ? values.mou_expiry_date : null,
    is_active: values.is_active,
    notes: values.notes.trim() || null,
  };
}

interface SiteFormProps {
  initialValues?: SiteFormValues;
  onSubmit: (values: SiteFormValues) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  disabled?: boolean;
}

export function SiteForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save site',
  submitting = false,
  disabled = false,
}: SiteFormProps) {
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const [values, setValues] = useState<SiteFormValues>(initialValues ?? EMPTY_SITE_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof SiteFormValues, string>>>({});

  // Default to the first accessible institution once loaded if none chosen yet.
  useEffect(() => {
    if (!values.institution_id && institutions.length > 0) {
      setValues((v) => ({ ...v, institution_id: institutions[0].institution_id }));
    }
  }, [institutions, values.institution_id]);

  const update = <K extends keyof SiteFormValues>(key: K, val: SiteFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof SiteFormValues, string>> = {};
    if (!values.institution_id) next.institution_id = 'Pick a college';
    if (!values.name.trim()) next.name = 'Name required';
    if (values.pincode && !/^\d{6}$/.test(values.pincode)) next.pincode = 'Pincode must be 6 digits';
    if (values.capacity && (Number.isNaN(Number(values.capacity)) || Number(values.capacity) < 0)) {
      next.capacity = 'Capacity must be 0 or greater';
    }
    if (values.mou_signed && values.mou_expiry_date) {
      const d = new Date(values.mou_expiry_date);
      if (Number.isNaN(d.getTime())) next.mou_expiry_date = 'Invalid date';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(values);
  };

  const isDisabled = disabled || submitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="site-institution">College <span className="text-red-600">*</span></Label>
            <Select
              value={values.institution_id}
              onValueChange={(v) => update('institution_id', v)}
              disabled={isDisabled || institutionsLoading}
            >
              <SelectTrigger id="site-institution">
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
            <Label htmlFor="site-type">Site type <span className="text-red-600">*</span></Label>
            <Select
              value={values.site_type}
              onValueChange={(v) => update('site_type', v as SiteType)}
              disabled={isDisabled}
            >
              <SelectTrigger id="site-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-name">Site name <span className="text-red-600">*</span></Label>
            <Input
              id="site-name"
              value={values.name}
              onChange={(e) => update('name', e.target.value)}
              disabled={isDisabled}
              placeholder="JKKN Multi-Specialty Hospital"
            />
            {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-address">Address</Label>
            <Textarea
              id="site-address"
              rows={2}
              value={values.address}
              onChange={(e) => update('address', e.target.value)}
              disabled={isDisabled}
              placeholder="Street, area, locality"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site-city">City</Label>
            <Input
              id="site-city"
              value={values.city}
              onChange={(e) => update('city', e.target.value)}
              disabled={isDisabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site-state">State</Label>
            <Input
              id="site-state"
              value={values.state}
              onChange={(e) => update('state', e.target.value)}
              disabled={isDisabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site-pincode">Pincode</Label>
            <Input
              id="site-pincode"
              value={values.pincode}
              onChange={(e) => update('pincode', e.target.value)}
              disabled={isDisabled}
              maxLength={6}
              placeholder="6 digits"
            />
            {errors.pincode && <p className="text-xs text-red-600">{errors.pincode}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site-capacity">Capacity</Label>
            <Input
              id="site-capacity"
              type="number"
              min={0}
              value={values.capacity}
              onChange={(e) => update('capacity', e.target.value)}
              disabled={isDisabled}
              placeholder="Concurrent learners"
            />
            {errors.capacity && <p className="text-xs text-red-600">{errors.capacity}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MoU &amp; status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="site-mou" className="text-sm">MoU signed</Label>
              <p className="text-xs text-muted-foreground">Mark when MoU is on file.</p>
            </div>
            <Switch
              id="site-mou"
              checked={values.mou_signed}
              onCheckedChange={(c) => update('mou_signed', c)}
              disabled={isDisabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site-mou-expiry">MoU expiry date</Label>
            <Input
              id="site-mou-expiry"
              type="date"
              value={values.mou_expiry_date}
              onChange={(e) => update('mou_expiry_date', e.target.value)}
              disabled={isDisabled || !values.mou_signed}
            />
            {errors.mou_expiry_date && (
              <p className="text-xs text-red-600">{errors.mou_expiry_date}</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
            <div>
              <Label htmlFor="site-active" className="text-sm">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive sites are hidden from cycle assignments.
              </p>
            </div>
            <Switch
              id="site-active"
              checked={values.is_active}
              onCheckedChange={(c) => update('is_active', c)}
              disabled={isDisabled}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-notes">Notes</Label>
            <Textarea
              id="site-notes"
              rows={3}
              value={values.notes}
              onChange={(e) => update('notes', e.target.value)}
              disabled={isDisabled}
              placeholder="Internal notes — visible to coordinators only."
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
