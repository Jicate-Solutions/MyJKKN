// app/(routes)/internships/_components/vehicles/VehicleStatusBadge.tsx
// Status pill for InternshipVehicle rows. Pure render — no hooks.

import { Badge } from '@/components/ui/badge';
import type { VehicleStatus } from '@/lib/services/internships/types';

const STATUS_LABELS: Record<VehicleStatus, string> = {
  available: 'Available',
  in_use: 'In use',
  maintenance: 'Maintenance',
  retired: 'Retired',
};

const STATUS_VARIANT: Record<VehicleStatus, string> = {
  available: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  in_use: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  maintenance: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  retired: 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200',
};

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <Badge
      variant="secondary"
      className={`text-xs font-medium ${STATUS_VARIANT[status] ?? STATUS_VARIANT.retired}`}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const TYPE_VARIANT: Record<string, string> = {
  bus: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  van: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  car: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  auto: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  'two-wheeler': 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
};

export function VehicleTypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = TYPE_VARIANT[type] ?? 'bg-muted text-muted-foreground ring-1 ring-border';
  return (
    <Badge variant="secondary" className={`text-xs font-medium capitalize ${cls}`}>
      {type.replace('-', ' ')}
    </Badge>
  );
}
