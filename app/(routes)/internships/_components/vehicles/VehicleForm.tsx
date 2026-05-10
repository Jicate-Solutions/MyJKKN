'use client';

// app/(routes)/internships/_components/vehicles/VehicleForm.tsx
// Shared form for creating + editing an InternshipVehicle.
//
// Fields are driven by the typed contract in lib/services/internships/types.ts.
// Default capacity sourced from policy `internship.policy.vehicle_default_capacity`
// (falls back to 10 if unseeded).

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CreateVehicleInput,
  InternshipVehicle,
  VehicleStatus,
} from '@/lib/services/internships/types';

const STATUSES: ReadonlyArray<{ value: VehicleStatus; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

const VEHICLE_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'bus', label: 'Bus' },
  { value: 'van', label: 'Van' },
  { value: 'car', label: 'Car' },
  { value: 'auto', label: 'Auto' },
  { value: 'two-wheeler', label: 'Two-wheeler' },
];

export interface InstitutionOption {
  id: string;
  name: string;
}

export interface VehicleFormValues {
  institution_id: string;
  vehicle_number: string;
  vehicle_type: string;
  capacity: string; // string for input control; coerced to int on submit
  driver_name: string;
  driver_phone: string;
  status: VehicleStatus;
  notes: string;
}

interface VehicleFormProps {
  mode: 'create' | 'edit';
  initial?: InternshipVehicle;
  institutions: ReadonlyArray<InstitutionOption>;
  defaultCapacity: number;
  submitLabel: string;
  cancelHref?: string;
  busy?: boolean;
  onSubmit: (
    values: CreateVehicleInput,
  ) => void | Promise<void>;
  onCancel?: () => void;
}

export function VehicleForm({
  mode,
  initial,
  institutions,
  defaultCapacity,
  submitLabel,
  cancelHref,
  busy,
  onSubmit,
  onCancel,
}: VehicleFormProps) {
  const [values, setValues] = useState<VehicleFormValues>(() => ({
    institution_id: initial?.institution_id ?? '',
    vehicle_number: initial?.vehicle_number ?? '',
    vehicle_type: initial?.vehicle_type ?? 'bus',
    capacity: String(initial?.capacity ?? defaultCapacity),
    driver_name: initial?.driver_name ?? '',
    driver_phone: initial?.driver_phone ?? '',
    status: initial?.status ?? 'available',
    notes: initial?.notes ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleFormValues, string>>>({});

  // Re-sync if `initial` arrives after first render (edit mode).
  useEffect(() => {
    if (initial) {
      setValues({
        institution_id: initial.institution_id,
        vehicle_number: initial.vehicle_number,
        vehicle_type: initial.vehicle_type ?? 'bus',
        capacity: String(initial.capacity ?? defaultCapacity),
        driver_name: initial.driver_name ?? '',
        driver_phone: initial.driver_phone ?? '',
        status: initial.status,
        notes: initial.notes ?? '',
      });
    }
  }, [initial, defaultCapacity]);

  const set = <K extends keyof VehicleFormValues>(
    key: K,
    next: VehicleFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof VehicleFormValues, string>> = {};
    if (!values.institution_id) next.institution_id = 'Pick a college';
    if (!values.vehicle_number.trim()) next.vehicle_number = 'Required';
    const cap = Number.parseInt(values.capacity, 10);
    if (!Number.isFinite(cap) || cap <= 0) next.capacity = 'Must be a positive integer';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: CreateVehicleInput = {
      institution_id: values.institution_id,
      vehicle_number: values.vehicle_number.trim(),
      vehicle_type: values.vehicle_type || null,
      capacity: Number.parseInt(values.capacity, 10),
      driver_name: values.driver_name.trim() || null,
      driver_phone: values.driver_phone.trim() || null,
      status: values.status,
      notes: values.notes.trim() || null,
    };
    void onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="institution_id">
            College <span className="text-destructive">*</span>
          </Label>
          <Select
            value={values.institution_id}
            onValueChange={(v) => set('institution_id', v)}
            disabled={mode === 'edit'}
          >
            <SelectTrigger id="institution_id" aria-invalid={!!errors.institution_id}>
              <SelectValue placeholder="Pick a college" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.institution_id && (
            <p className="text-xs text-destructive">{errors.institution_id}</p>
          )}
          {mode === 'edit' && (
            <p className="text-xs text-muted-foreground">
              College cannot be changed after creation.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vehicle_number">
            Vehicle number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="vehicle_number"
            placeholder="TN-33-AB-1234"
            value={values.vehicle_number}
            onChange={(e) => set('vehicle_number', e.target.value)}
            aria-invalid={!!errors.vehicle_number}
            required
          />
          {errors.vehicle_number && (
            <p className="text-xs text-destructive">{errors.vehicle_number}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vehicle_type">Vehicle type</Label>
          <Select
            value={values.vehicle_type}
            onValueChange={(v) => set('vehicle_type', v)}
          >
            <SelectTrigger id="vehicle_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="capacity">
            Capacity <span className="text-destructive">*</span>
          </Label>
          <Input
            id="capacity"
            type="number"
            min={1}
            value={values.capacity}
            onChange={(e) => set('capacity', e.target.value)}
            aria-invalid={!!errors.capacity}
            required
          />
          {errors.capacity ? (
            <p className="text-xs text-destructive">{errors.capacity}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Default {defaultCapacity} from policy.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="driver_name">Driver name</Label>
          <Input
            id="driver_name"
            placeholder="e.g. Ramesh K."
            value={values.driver_name}
            onChange={(e) => set('driver_name', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="driver_phone">Driver phone</Label>
          <Input
            id="driver_phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={values.driver_phone}
            onChange={(e) => set('driver_phone', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select
            value={values.status}
            onValueChange={(v) => set('status', v as VehicleStatus)}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Maintenance log, fuel preferences, route restrictions, …"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : cancelHref ? (
          <Button type="button" variant="outline" asChild disabled={busy}>
            <a href={cancelHref}>Cancel</a>
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
