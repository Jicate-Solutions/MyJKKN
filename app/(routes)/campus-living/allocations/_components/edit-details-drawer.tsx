'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateHostelAllocation } from '@/hooks/campus-living/use-hostel-allocations';
import { Loader2, PencilLine } from 'lucide-react';
import type {
  FoodPreference,
  HostelAllocation,
  UpdateHostelAllocationDTO,
} from '@/types/campus-living';

// Food preferences must mirror the `food_preference_enum` values on prod.
// Kept in sync with types/campus-living.ts FoodPreference.
const FOOD_PREFERENCES: { value: FoodPreference; label: string }[] = [
  { value: 'veg', label: 'Vegetarian' },
  { value: 'non_veg', label: 'Non-Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'jain', label: 'Jain' },
];

// 10-digit Indian phone pattern — same rule used by emergency-contact capture
// on the admission-side allocation create flow.
const PHONE_PATTERN = /^\d{10}$/;

interface EditDetailsDrawerProps {
  allocation: HostelAllocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful save. Defaults to router.refresh(). */
  onSuccess?: () => void;
}

interface FormState {
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  medical_conditions: string;
  food_preference: FoodPreference | '';
  expected_vacate_date: string;
}

interface FormErrors {
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
}

function toFormState(a: HostelAllocation): FormState {
  return {
    emergency_contact_name: a.emergency_contact_name ?? '',
    emergency_contact_phone: a.emergency_contact_phone ?? '',
    emergency_contact_relation: a.emergency_contact_relation ?? '',
    medical_conditions: a.medical_conditions ?? '',
    food_preference: (a.food_preference ?? '') as FoodPreference | '',
    expected_vacate_date: a.expected_vacate_date ?? '',
  };
}

export function EditDetailsDrawer({
  allocation,
  open,
  onOpenChange,
  onSuccess,
}: EditDetailsDrawerProps) {
  const router = useRouter();
  const updateMutation = useUpdateHostelAllocation();

  // Local form state — plain useState (the rest of allocations/_components
  // uses the same pattern; introducing react-hook-form for one drawer would
  // be a larger dep-surface change than this PR warrants).
  const [form, setForm] = useState<FormState>(() => toFormState(allocation));
  const [errors, setErrors] = useState<FormErrors>({});

  // Re-hydrate the form when the drawer reopens against a fresh allocation
  // snapshot (e.g. after a router.refresh() from the detail page).
  useEffect(() => {
    if (open) {
      setForm(toFormState(allocation));
      setErrors({});
    }
  }, [open, allocation]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.emergency_contact_name.trim()) {
      next.emergency_contact_name = 'Required';
    }
    if (!form.emergency_contact_phone.trim()) {
      next.emergency_contact_phone = 'Required';
    } else if (!PHONE_PATTERN.test(form.emergency_contact_phone.trim())) {
      next.emergency_contact_phone = 'Must be a 10-digit number';
    }
    if (!form.emergency_contact_relation.trim()) {
      next.emergency_contact_relation = 'Required';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Build a minimal DTO — only include fields that actually changed so we
    // don't overwrite values touched by another flow in the meantime.
    const payload: UpdateHostelAllocationDTO = {};
    if (form.emergency_contact_name.trim() !== (allocation.emergency_contact_name ?? '')) {
      payload.emergency_contact_name = form.emergency_contact_name.trim();
    }
    if (form.emergency_contact_phone.trim() !== (allocation.emergency_contact_phone ?? '')) {
      payload.emergency_contact_phone = form.emergency_contact_phone.trim();
    }
    if (
      form.emergency_contact_relation.trim() !==
      (allocation.emergency_contact_relation ?? '')
    ) {
      payload.emergency_contact_relation = form.emergency_contact_relation.trim();
    }
    const trimmedMedical = form.medical_conditions.trim();
    const currentMedical = allocation.medical_conditions ?? '';
    if (trimmedMedical !== currentMedical) {
      payload.medical_conditions = trimmedMedical === '' ? null : trimmedMedical;
    }
    const currentFood = (allocation.food_preference ?? '') as FoodPreference | '';
    if (form.food_preference !== currentFood) {
      payload.food_preference = form.food_preference === '' ? null : form.food_preference;
    }
    const currentVacate = allocation.expected_vacate_date ?? '';
    if (form.expected_vacate_date !== currentVacate) {
      payload.expected_vacate_date =
        form.expected_vacate_date === '' ? null : form.expected_vacate_date;
    }

    // Nothing changed — close silently.
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }

    await updateMutation.mutateAsync({ id: allocation.id, payload });
    onOpenChange(false);
    if (onSuccess) onSuccess();
    else router.refresh();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <PencilLine className="h-5 w-5 text-primary" />
              Edit Allocation Details
            </SheetTitle>
            <SheetDescription>
              Correct emergency contact, medical, food-preference or
              expected-vacate fields. Block / room / bed changes must use
              Transfer; status changes must use Vacate.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 py-5">
            {/* Emergency contact block */}
            <div className="space-y-4 rounded-md border p-4">
              <h3 className="text-sm font-medium">Emergency Contact</h3>

              <div className="space-y-2">
                <Label htmlFor="edd-ec-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edd-ec-name"
                  value={form.emergency_contact_name}
                  onChange={(e) => setField('emergency_contact_name', e.target.value)}
                  aria-invalid={!!errors.emergency_contact_name}
                />
                {errors.emergency_contact_name && (
                  <p className="text-xs text-destructive">
                    {errors.emergency_contact_name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edd-ec-phone">
                  Phone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edd-ec-phone"
                  inputMode="numeric"
                  pattern="\d{10}"
                  maxLength={10}
                  placeholder="10-digit number"
                  value={form.emergency_contact_phone}
                  onChange={(e) =>
                    setField(
                      'emergency_contact_phone',
                      e.target.value.replace(/\D/g, '').slice(0, 10)
                    )
                  }
                  aria-invalid={!!errors.emergency_contact_phone}
                />
                {errors.emergency_contact_phone && (
                  <p className="text-xs text-destructive">
                    {errors.emergency_contact_phone}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edd-ec-relation">
                  Relation <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edd-ec-relation"
                  placeholder="e.g. father, mother, guardian"
                  value={form.emergency_contact_relation}
                  onChange={(e) =>
                    setField('emergency_contact_relation', e.target.value)
                  }
                  aria-invalid={!!errors.emergency_contact_relation}
                />
                {errors.emergency_contact_relation && (
                  <p className="text-xs text-destructive">
                    {errors.emergency_contact_relation}
                  </p>
                )}
              </div>
            </div>

            {/* Medical + food */}
            <div className="space-y-4 rounded-md border p-4">
              <h3 className="text-sm font-medium">Health &amp; Diet</h3>

              <div className="space-y-2">
                <Label htmlFor="edd-medical">Medical conditions</Label>
                <Textarea
                  id="edd-medical"
                  rows={3}
                  placeholder="e.g. asthma, peanut allergy — leave blank if none"
                  value={form.medical_conditions}
                  onChange={(e) => setField('medical_conditions', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Visible to warden + mess in-charge for emergencies.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edd-food">Food preference</Label>
                <Select
                  value={form.food_preference}
                  onValueChange={(v) => setField('food_preference', v as FoodPreference)}
                >
                  <SelectTrigger id="edd-food">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOOD_PREFERENCES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Expected vacate */}
            <div className="space-y-4 rounded-md border p-4">
              <h3 className="text-sm font-medium">Schedule</h3>
              <div className="space-y-2">
                <Label htmlFor="edd-expected-vacate">Expected vacate date</Label>
                <Input
                  id="edd-expected-vacate"
                  type="date"
                  value={form.expected_vacate_date}
                  onChange={(e) => setField('expected_vacate_date', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Planned exit date. The actual vacate is stamped via the Vacate
                  flow.
                </p>
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
