'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BlockSelector } from '@/components/campus-living/block-selector';
import { Loader2 } from 'lucide-react';
import {
  useCreateLaundryConfig,
  useUpdateLaundryConfig,
} from '@/hooks/campus-living/use-hostel-laundry';
import type {
  HostelLaundryConfig,
  LaundryServiceType,
} from '@/lib/services/campus-living/laundry-service';

// ISO weekday labels: 1 = Mon … 7 = Sun. Matches the prod default
// `{1,4}` (Mon/Thu) for collection_days and `{3,6}` (Wed/Sat) for
// delivery_days in hostel_laundry_configs.
const WEEKDAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 7, short: 'Sun', label: 'Sunday' },
];

interface ConfigEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  config?: HostelLaundryConfig | null;
}

interface FormState {
  block_id: string; // empty string = global (all blocks)
  service_type: LaundryServiceType;
  vendor_name: string;
  vendor_phone: string;
  vendor_contract_start: string;
  vendor_contract_end: string;
  collection_days: number[];
  delivery_days: number[];
  max_items_per_student: string;
  cost_per_item: string;
  is_included_in_fees: boolean;
  is_active: boolean;
}

function buildInitialForm(config?: HostelLaundryConfig | null): FormState {
  if (!config) {
    return {
      block_id: '',
      service_type: 'vendor',
      vendor_name: '',
      vendor_phone: '',
      vendor_contract_start: '',
      vendor_contract_end: '',
      collection_days: [1, 4],
      delivery_days: [3, 6],
      max_items_per_student: '15',
      cost_per_item: '',
      is_included_in_fees: true,
      is_active: true,
    };
  }
  return {
    block_id: config.block_id ?? '',
    service_type: config.service_type === 'in_house' ? 'in_house' : 'vendor',
    vendor_name: config.vendor_name ?? '',
    vendor_phone: config.vendor_phone ?? '',
    vendor_contract_start: config.vendor_contract_start ?? '',
    vendor_contract_end: config.vendor_contract_end ?? '',
    collection_days: config.collection_days ?? [],
    delivery_days: config.delivery_days ?? [],
    max_items_per_student:
      config.max_items_per_student != null
        ? String(config.max_items_per_student)
        : '15',
    cost_per_item:
      config.cost_per_item != null ? String(config.cost_per_item) : '',
    is_included_in_fees: config.is_included_in_fees ?? true,
    is_active: config.is_active ?? true,
  };
}

export function ConfigEditorDialog(props: ConfigEditorDialogProps) {
  // Remount the inner form whenever the dialog opens or the target config
  // changes — sidesteps the react-hooks/set-state-in-effect rule by deriving
  // initial state from props at mount-time rather than syncing via useEffect.
  const remountKey = `${props.open ? 'open' : 'closed'}-${props.config?.id ?? 'new'}`;
  if (!props.open) return null;
  return <ConfigEditorForm key={remountKey} {...props} />;
}

function ConfigEditorForm({
  onOpenChange,
  institutionId,
  config,
}: ConfigEditorDialogProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialForm(config));
  const createMutation = useCreateLaundryConfig();
  const updateMutation = useUpdateLaundryConfig();
  const isEdit = !!config;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const toggleDay = (
    field: 'collection_days' | 'delivery_days',
    day: number
  ) => {
    setForm((prev) => {
      const current = prev[field];
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      return { ...prev, [field]: next };
    });
  };

  const handleSubmit = async () => {
    const maxItems = form.max_items_per_student.trim()
      ? Number(form.max_items_per_student)
      : null;
    const cost = form.cost_per_item.trim()
      ? Number(form.cost_per_item)
      : null;

    const payload = {
      institution_id: institutionId,
      block_id: form.block_id || null,
      service_type: form.service_type,
      vendor_name: form.vendor_name.trim() || null,
      vendor_phone: form.vendor_phone.trim() || null,
      vendor_contract_start: form.vendor_contract_start || null,
      vendor_contract_end: form.vendor_contract_end || null,
      collection_days: form.collection_days,
      delivery_days: form.delivery_days,
      max_items_per_student: maxItems,
      cost_per_item: cost,
      is_included_in_fees: form.is_included_in_fees,
      is_active: form.is_active,
    };

    try {
      if (isEdit && config) {
        await updateMutation.mutateAsync({ id: config.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // toast surfaced by hook; keep dialog open so user can retry
    }
  };

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit laundry configuration' : 'New laundry configuration'}
          </DialogTitle>
          <DialogDescription>
            Bind a vendor contract and weekly cadence to a hostel block (or
            leave block empty for an institution-wide default).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="config-block">Block</Label>
              <BlockSelector
                institutionId={institutionId}
                value={form.block_id || 'all'}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, block_id: v === 'all' ? '' : v }))
                }
                className="w-full mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave as &quot;All Blocks&quot; for an institution-wide default.
              </p>
            </div>

            <div>
              <Label htmlFor="config-service-type">Service model</Label>
              <Select
                value={form.service_type}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    service_type: v as LaundryServiceType,
                  }))
                }
              >
                <SelectTrigger id="config-service-type" className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor">External vendor</SelectItem>
                  <SelectItem value="in_house">In-house</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="config-vendor-name">Vendor name</Label>
              <Input
                id="config-vendor-name"
                value={form.vendor_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vendor_name: e.target.value }))
                }
                placeholder="e.g. UCleaners Pvt Ltd"
              />
            </div>
            <div>
              <Label htmlFor="config-vendor-phone">Vendor phone</Label>
              <Input
                id="config-vendor-phone"
                value={form.vendor_phone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, vendor_phone: e.target.value }))
                }
                placeholder="e.g. +91 98765 43210"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="config-contract-start">Contract start</Label>
              <Input
                id="config-contract-start"
                type="date"
                value={form.vendor_contract_start}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    vendor_contract_start: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="config-contract-end">Contract end</Label>
              <Input
                id="config-contract-end"
                type="date"
                value={form.vendor_contract_end}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    vendor_contract_end: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div>
            <Label>Collection days</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {WEEKDAYS.map((d) => {
                const active = form.collection_days.includes(d.value);
                return (
                  <button
                    type="button"
                    key={`collect-${d.value}`}
                    onClick={() => toggleDay('collection_days', d.value)}
                    className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Delivery days</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {WEEKDAYS.map((d) => {
                const active = form.delivery_days.includes(d.value);
                return (
                  <button
                    type="button"
                    key={`deliver-${d.value}`}
                    onClick={() => toggleDay('delivery_days', d.value)}
                    className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="config-max-items">
                Max items per student / cycle
              </Label>
              <Input
                id="config-max-items"
                type="number"
                min={1}
                value={form.max_items_per_student}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    max_items_per_student: e.target.value,
                  }))
                }
                placeholder="15"
              />
            </div>
            <div>
              <Label htmlFor="config-cost">Cost per item (₹)</Label>
              <Input
                id="config-cost"
                type="number"
                min={0}
                step="0.01"
                value={form.cost_per_item}
                onChange={(e) =>
                  setForm((p) => ({ ...p, cost_per_item: e.target.value }))
                }
                placeholder="e.g. 12.50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-md">
            <div>
              <div className="font-medium text-sm">Included in hostel fees</div>
              <p className="text-xs text-muted-foreground">
                When on, residents are not charged per cycle.
              </p>
            </div>
            <Switch
              checked={form.is_included_in_fees}
              onCheckedChange={(v) =>
                setForm((p) => ({ ...p, is_included_in_fees: v }))
              }
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-md">
            <div>
              <div className="font-medium text-sm">Active</div>
              <p className="text-xs text-muted-foreground">
                Inactive configurations are hidden from residents and don&apos;t
                auto-generate orders.
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) =>
                setForm((p) => ({ ...p, is_active: v }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Create configuration'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
