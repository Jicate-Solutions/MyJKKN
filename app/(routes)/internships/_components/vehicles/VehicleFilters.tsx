'use client';

// app/(routes)/internships/_components/vehicles/VehicleFilters.tsx
// Filter chips + search box for the vehicles list.
// Pattern: simple controlled component (parent owns state).

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { VehicleStatus } from '@/lib/services/internships/types';

const STATUS_OPTIONS: ReadonlyArray<{ value: VehicleStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

const VEHICLE_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'All types' },
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

export interface VehicleFiltersValue {
  search: string;
  institutionId: string | 'all';
  status: VehicleStatus | 'all';
  vehicleType: string;
}

interface VehicleFiltersProps {
  value: VehicleFiltersValue;
  onChange: (next: VehicleFiltersValue) => void;
  institutions: ReadonlyArray<InstitutionOption>;
  institutionsLoading?: boolean;
}

export function VehicleFilters({
  value,
  onChange,
  institutions,
  institutionsLoading,
}: VehicleFiltersProps) {
  const set = <K extends keyof VehicleFiltersValue>(
    key: K,
    next: VehicleFiltersValue[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search by vehicle number or driver name"
          placeholder="Search by vehicle number or driver name"
          className="pl-8"
          value={value.search}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      <Select
        value={value.institutionId}
        onValueChange={(v) => set('institutionId', v as VehicleFiltersValue['institutionId'])}
      >
        <SelectTrigger className="w-full md:w-[200px]" aria-label="Filter by college">
          <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'College'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All colleges</SelectItem>
          {institutions.map((inst) => (
            <SelectItem key={inst.id} value={inst.id}>
              {inst.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.status}
        onValueChange={(v) => set('status', v as VehicleStatus | 'all')}
      >
        <SelectTrigger className="w-full md:w-[160px]" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.vehicleType}
        onValueChange={(v) => set('vehicleType', v)}
      >
        <SelectTrigger className="w-full md:w-[160px]" aria-label="Filter by vehicle type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VEHICLE_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
