'use client';

// SiteForm — shared by /internships/sites/new and /internships/sites/[id] (edit mode).
// Maps to the columns shipped in substrate v3 (internship_external_sites). Recovered
// thin types in PR #785 were a fictional placeholder; the live table is far richer.
// Reconciled 2026-05-10.

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
import { useSiteTypes } from '@/hooks/internships/useSites';
import type {
  InternshipExternalSite,
  CreateExternalSiteInput,
  SiteOwnershipType,
} from '@/lib/services/internships/types';

const OWNERSHIP_OPTIONS: { value: SiteOwnershipType; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'government', label: 'Government' },
  { value: 'university_affiliated', label: 'University-affiliated' },
  { value: 'trust', label: 'Trust' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'ngo', label: 'NGO' },
];

const NO_SITE_TYPE = '__none__';

export type SiteFormValues = {
  institution_id: string;
  site_type_id: string; // '' or '__none__' means leave NULL
  site_name: string;
  hospital_code: string;
  address_line1: string;
  address_line2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  latitude: string;        // string in form → number on submit
  longitude: string;
  geofence_radius_meters: string;
  max_learners_per_cycle: string;
  departments_available: string; // comma-separated → TEXT[]
  posting_fee_per_learner: string;
  contract_start_date: string;
  contract_end_date: string;
  operates_weekends: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_role: string;
  nearest_emergency_ward: string;
  ambulance_number: string;
  ownership_type: SiteOwnershipType;
  is_active: boolean;
  notes: string;
};

export const EMPTY_SITE_FORM: SiteFormValues = {
  institution_id: '',
  site_type_id: '',
  site_name: '',
  hospital_code: '',
  address_line1: '',
  address_line2: '',
  city: '',
  district: '',
  state: 'Tamil Nadu',
  pincode: '',
  latitude: '',
  longitude: '',
  geofence_radius_meters: '200',
  max_learners_per_cycle: '',
  departments_available: '',
  posting_fee_per_learner: '',
  contract_start_date: '',
  contract_end_date: '',
  operates_weekends: false,
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_role: '',
  nearest_emergency_ward: '',
  ambulance_number: '',
  ownership_type: 'private',
  is_active: true,
  notes: '',
};

export function siteToFormValues(site: InternshipExternalSite): SiteFormValues {
  return {
    institution_id: site.institution_id,
    site_type_id: site.site_type_id ?? '',
    site_name: site.site_name,
    hospital_code: site.hospital_code,
    address_line1: site.address_line1,
    address_line2: site.address_line2 ?? '',
    city: site.city,
    district: site.district,
    state: site.state,
    pincode: site.pincode,
    latitude: site.latitude?.toString() ?? '',
    longitude: site.longitude?.toString() ?? '',
    geofence_radius_meters: site.geofence_radius_meters?.toString() ?? '200',
    max_learners_per_cycle: site.max_learners_per_cycle?.toString() ?? '',
    departments_available: (site.departments_available ?? []).join(', '),
    posting_fee_per_learner: site.posting_fee_per_learner?.toString() ?? '',
    contract_start_date: site.contract_start_date ?? '',
    contract_end_date: site.contract_end_date ?? '',
    operates_weekends: site.operates_weekends,
    emergency_contact_name: site.emergency_contact_name ?? '',
    emergency_contact_phone: site.emergency_contact_phone ?? '',
    emergency_contact_role: site.emergency_contact_role ?? '',
    nearest_emergency_ward: site.nearest_emergency_ward ?? '',
    ambulance_number: site.ambulance_number ?? '',
    ownership_type: site.ownership_type,
    is_active: site.is_active,
    notes: site.notes ?? '',
  };
}

export function formValuesToCreatePayload(v: SiteFormValues): CreateExternalSiteInput {
  const departments = v.departments_available
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    institution_id: v.institution_id,
    site_type_id: v.site_type_id && v.site_type_id !== NO_SITE_TYPE ? v.site_type_id : null,
    site_name: v.site_name.trim(),
    hospital_code: v.hospital_code.trim(),
    address_line1: v.address_line1.trim(),
    address_line2: v.address_line2.trim() || null,
    city: v.city.trim(),
    district: v.district.trim(),
    state: v.state.trim() || 'Tamil Nadu',
    pincode: v.pincode.trim(),
    latitude: Number(v.latitude),
    longitude: Number(v.longitude),
    geofence_radius_meters: v.geofence_radius_meters ? Number(v.geofence_radius_meters) : 200,
    max_learners_per_cycle: v.max_learners_per_cycle ? Number(v.max_learners_per_cycle) : null,
    departments_available: departments,
    posting_fee_per_learner: v.posting_fee_per_learner ? Number(v.posting_fee_per_learner) : null,
    contract_start_date: v.contract_start_date || null,
    contract_end_date: v.contract_end_date || null,
    operates_weekends: v.operates_weekends,
    emergency_contact_name: v.emergency_contact_name.trim() || null,
    emergency_contact_phone: v.emergency_contact_phone.trim() || null,
    emergency_contact_role: v.emergency_contact_role.trim() || null,
    nearest_emergency_ward: v.nearest_emergency_ward.trim() || null,
    ambulance_number: v.ambulance_number.trim() || null,
    ownership_type: v.ownership_type,
    is_active: v.is_active,
    notes: v.notes.trim() || null,
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

const LAT_RE = /^-?\d{1,3}(\.\d{1,7})?$/;
const LNG_RE = /^-?\d{1,3}(\.\d{1,7})?$/;

export function SiteForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save site',
  submitting = false,
  disabled = false,
}: SiteFormProps) {
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const { data: siteTypes = [], isLoading: siteTypesLoading } = useSiteTypes();
  const [values, setValues] = useState<SiteFormValues>(initialValues ?? EMPTY_SITE_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof SiteFormValues, string>>>({});

  // Default to the first accessible institution once loaded if none chosen.
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
    if (!values.site_name.trim()) next.site_name = 'Site name required';
    if (!values.hospital_code.trim()) next.hospital_code = 'Hospital code required';
    if (!values.address_line1.trim()) next.address_line1 = 'Address line 1 required';
    if (!values.city.trim()) next.city = 'City required';
    if (!values.district.trim()) next.district = 'District required';
    if (!values.pincode.trim()) next.pincode = 'Pincode required';
    else if (!/^\d{6}$/.test(values.pincode)) next.pincode = 'Pincode must be 6 digits';

    if (!values.latitude.trim()) next.latitude = 'Latitude required (for geofence)';
    else if (!LAT_RE.test(values.latitude.trim()) || Math.abs(Number(values.latitude)) > 90) {
      next.latitude = 'Latitude must be a decimal between -90 and 90 (up to 7 places)';
    }
    if (!values.longitude.trim()) next.longitude = 'Longitude required (for geofence)';
    else if (!LNG_RE.test(values.longitude.trim()) || Math.abs(Number(values.longitude)) > 180) {
      next.longitude = 'Longitude must be a decimal between -180 and 180 (up to 7 places)';
    }

    if (values.geofence_radius_meters) {
      const n = Number(values.geofence_radius_meters);
      if (Number.isNaN(n) || n < 10 || n > 5000) {
        next.geofence_radius_meters = 'Radius must be between 10 and 5000 metres';
      }
    }
    if (values.max_learners_per_cycle) {
      const n = Number(values.max_learners_per_cycle);
      if (Number.isNaN(n) || n < 0) next.max_learners_per_cycle = 'Must be 0 or greater';
    }
    if (values.posting_fee_per_learner) {
      const n = Number(values.posting_fee_per_learner);
      if (Number.isNaN(n) || n < 0) next.posting_fee_per_learner = 'Must be 0 or greater';
    }
    if (values.contract_start_date && values.contract_end_date
        && values.contract_end_date < values.contract_start_date) {
      next.contract_end_date = 'Contract end must be on or after start';
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
            <Label htmlFor="site-type">Site type</Label>
            <Select
              value={values.site_type_id || NO_SITE_TYPE}
              onValueChange={(v) => update('site_type_id', v === NO_SITE_TYPE ? '' : v)}
              disabled={isDisabled || siteTypesLoading}
            >
              <SelectTrigger id="site-type">
                <SelectValue placeholder={siteTypesLoading ? 'Loading…' : 'Select a site type'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SITE_TYPE}>— Not classified —</SelectItem>
                {siteTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-name">Site name <span className="text-red-600">*</span></Label>
            <Input
              id="site-name"
              value={values.site_name}
              onChange={(e) => update('site_name', e.target.value)}
              disabled={isDisabled}
              placeholder="JKKN Multi-Specialty Hospital"
            />
            {errors.site_name && <p className="text-xs text-red-600">{errors.site_name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site-code">Hospital code <span className="text-red-600">*</span></Label>
            <Input
              id="site-code"
              value={values.hospital_code}
              onChange={(e) => update('hospital_code', e.target.value)}
              disabled={isDisabled}
              placeholder="JKKN-MSH-01"
            />
            <p className="text-xs text-muted-foreground">Unique short code per college.</p>
            {errors.hospital_code && <p className="text-xs text-red-600">{errors.hospital_code}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="site-ownership">Ownership type</Label>
            <Select
              value={values.ownership_type}
              onValueChange={(v) => update('ownership_type', v as SiteOwnershipType)}
              disabled={isDisabled}
            >
              <SelectTrigger id="site-ownership">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OWNERSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-addr1">Address line 1 <span className="text-red-600">*</span></Label>
            <Input
              id="site-addr1"
              value={values.address_line1}
              onChange={(e) => update('address_line1', e.target.value)}
              disabled={isDisabled}
            />
            {errors.address_line1 && <p className="text-xs text-red-600">{errors.address_line1}</p>}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-addr2">Address line 2</Label>
            <Input
              id="site-addr2"
              value={values.address_line2}
              onChange={(e) => update('address_line2', e.target.value)}
              disabled={isDisabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-city">City <span className="text-red-600">*</span></Label>
            <Input
              id="site-city"
              value={values.city}
              onChange={(e) => update('city', e.target.value)}
              disabled={isDisabled}
            />
            {errors.city && <p className="text-xs text-red-600">{errors.city}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-district">District <span className="text-red-600">*</span></Label>
            <Input
              id="site-district"
              value={values.district}
              onChange={(e) => update('district', e.target.value)}
              disabled={isDisabled}
            />
            {errors.district && <p className="text-xs text-red-600">{errors.district}</p>}
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
            <Label htmlFor="site-pincode">Pincode <span className="text-red-600">*</span></Label>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geofence & capacity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="site-lat">Latitude <span className="text-red-600">*</span></Label>
            <Input
              id="site-lat"
              value={values.latitude}
              onChange={(e) => update('latitude', e.target.value)}
              disabled={isDisabled}
              placeholder="11.4012345"
              inputMode="decimal"
            />
            {errors.latitude && <p className="text-xs text-red-600">{errors.latitude}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-lng">Longitude <span className="text-red-600">*</span></Label>
            <Input
              id="site-lng"
              value={values.longitude}
              onChange={(e) => update('longitude', e.target.value)}
              disabled={isDisabled}
              placeholder="77.7234567"
              inputMode="decimal"
            />
            {errors.longitude && <p className="text-xs text-red-600">{errors.longitude}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-radius">Geofence radius (metres)</Label>
            <Input
              id="site-radius"
              type="number"
              min={10}
              max={5000}
              value={values.geofence_radius_meters}
              onChange={(e) => update('geofence_radius_meters', e.target.value)}
              disabled={isDisabled}
              placeholder="200"
            />
            <p className="text-xs text-muted-foreground">Used for learner check-in proximity.</p>
            {errors.geofence_radius_meters && (
              <p className="text-xs text-red-600">{errors.geofence_radius_meters}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-cap">Max learners per cycle</Label>
            <Input
              id="site-cap"
              type="number"
              min={0}
              value={values.max_learners_per_cycle}
              onChange={(e) => update('max_learners_per_cycle', e.target.value)}
              disabled={isDisabled}
              placeholder="Concurrent learners cap"
            />
            {errors.max_learners_per_cycle && (
              <p className="text-xs text-red-600">{errors.max_learners_per_cycle}</p>
            )}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-depts">Departments available</Label>
            <Input
              id="site-depts"
              value={values.departments_available}
              onChange={(e) => update('departments_available', e.target.value)}
              disabled={isDisabled}
              placeholder="Pediatrics, OBG, Surgery, Medicine"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list.</p>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
            <div>
              <Label htmlFor="site-weekends" className="text-sm">Operates weekends</Label>
              <p className="text-xs text-muted-foreground">Used by scheduler to spread rotations.</p>
            </div>
            <Switch
              id="site-weekends"
              checked={values.operates_weekends}
              onCheckedChange={(c) => update('operates_weekends', c)}
              disabled={isDisabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contract & fees</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="site-fee">Posting fee per learner</Label>
            <Input
              id="site-fee"
              type="number"
              min={0}
              step="0.01"
              value={values.posting_fee_per_learner}
              onChange={(e) => update('posting_fee_per_learner', e.target.value)}
              disabled={isDisabled}
              placeholder="0.00"
            />
            {errors.posting_fee_per_learner && (
              <p className="text-xs text-red-600">{errors.posting_fee_per_learner}</p>
            )}
          </div>
          <div className="md:col-span-1" />
          <div className="space-y-1.5">
            <Label htmlFor="site-contract-start">Contract start</Label>
            <Input
              id="site-contract-start"
              type="date"
              value={values.contract_start_date}
              onChange={(e) => update('contract_start_date', e.target.value)}
              disabled={isDisabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-contract-end">Contract end</Label>
            <Input
              id="site-contract-end"
              type="date"
              value={values.contract_end_date}
              onChange={(e) => update('contract_end_date', e.target.value)}
              disabled={isDisabled}
            />
            {errors.contract_end_date && (
              <p className="text-xs text-red-600">{errors.contract_end_date}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Emergency contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="site-em-name">Contact name</Label>
            <Input
              id="site-em-name"
              value={values.emergency_contact_name}
              onChange={(e) => update('emergency_contact_name', e.target.value)}
              disabled={isDisabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-em-phone">Contact phone</Label>
            <Input
              id="site-em-phone"
              type="tel"
              value={values.emergency_contact_phone}
              onChange={(e) => update('emergency_contact_phone', e.target.value)}
              disabled={isDisabled}
              placeholder="+91 98765 43210"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-em-role">Role / designation</Label>
            <Input
              id="site-em-role"
              value={values.emergency_contact_role}
              onChange={(e) => update('emergency_contact_role', e.target.value)}
              disabled={isDisabled}
              placeholder="Casualty Officer"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site-amb">Ambulance number</Label>
            <Input
              id="site-amb"
              type="tel"
              value={values.ambulance_number}
              onChange={(e) => update('ambulance_number', e.target.value)}
              disabled={isDisabled}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="site-em-ward">Nearest emergency ward</Label>
            <Input
              id="site-em-ward"
              value={values.nearest_emergency_ward}
              onChange={(e) => update('nearest_emergency_ward', e.target.value)}
              disabled={isDisabled}
              placeholder="Casualty block, ground floor"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status & notes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
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
