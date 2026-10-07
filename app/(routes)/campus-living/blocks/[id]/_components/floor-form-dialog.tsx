'use client';

// Add / Edit dialog for a hostel floor (Floors & Rooms tab).
//   - create: floor number + optional name
//   - edit:   name + active only. The floor NUMBER is read-only — rooms, room
//             eligibility rules and attendance all key on it, and a DB trigger
//             refuses a change even if the UI were bypassed.
// The mutation hooks own the success/error toasts and cache invalidation, so
// this dialog stays quiet and only closes on success.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useCreateFloor, useUpdateFloor } from '@/hooks/campus-living/use-hostel-floors';
import { floorLabel } from '@/lib/utils/floor-label';

export interface FloorFormTarget {
  id: string;
  floor_number: number;
  name: string | null;
  is_active: boolean;
}

const formSchema = z.object({
  // Kept as a string so the field can be empty while typing; converted on submit.
  floor_number: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Enter a whole number, 0 or more (0 = Ground floor)')
    .refine((v) => Number(v) <= 50, 'The highest floor number is 50'),
  name: z.string().trim().max(60, 'Keep the name under 60 characters'),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface FloorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockId: string;
  /** null = add a new floor; otherwise edit this one. */
  floor: FloorFormTarget | null;
  /** Floor numbers this block already has (create mode rejects a repeat). */
  takenNumbers: number[];
  /** Prefilled number for create mode — the next floor above the highest. */
  suggestedNumber: number;
}

export function FloorFormDialog({
  open,
  onOpenChange,
  blockId,
  floor,
  takenNumbers,
  suggestedNumber,
}: FloorFormDialogProps) {
  const isEdit = floor !== null;
  const createFloor = useCreateFloor(blockId);
  const updateFloor = useUpdateFloor();
  const saving = createFloor.isPending || updateFloor.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { floor_number: String(suggestedNumber), name: '', is_active: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      floor
        ? { floor_number: String(floor.floor_number), name: floor.name ?? '', is_active: floor.is_active }
        : { floor_number: String(suggestedNumber), name: '', is_active: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, floor?.id, suggestedNumber]);

  const watchedNumber = form.watch('floor_number');
  const placeholderLabel = /^\d+$/.test(watchedNumber) ? floorLabel(Number(watchedNumber)) : 'e.g. Terrace';

  const onSubmit = async (values: FormValues) => {
    const name = values.name.trim() || null;
    try {
      if (floor) {
        await updateFloor.mutateAsync({ id: floor.id, name, is_active: values.is_active });
      } else {
        const number = Number(values.floor_number);
        if (takenNumbers.includes(number)) {
          form.setError('floor_number', { message: `Floor ${number} already exists in this block.` });
          return;
        }
        await createFloor.mutateAsync({ floor_number: number, name });
      }
      onOpenChange(false);
    } catch {
      // The hook already toasted the real reason; keep the dialog open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit floor' : 'Add floor'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Rename the floor or take it out of the room floor picker.'
              : 'Add a floor to this block. Rooms can then be placed on it.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="floor_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Floor number</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      disabled={isEdit}
                      placeholder="0 = Ground floor"
                      {...field}
                    />
                  </FormControl>
                  {isEdit && (
                    <FormDescription>
                      The number can&apos;t be changed — rooms and room rules are tied to it. To renumber,
                      delete this floor once it has no rooms and add it again.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder={placeholderLabel} {...field} />
                  </FormControl>
                  <FormDescription>Leave blank to show the standard name.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isEdit && (
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Inactive floors are hidden when adding rooms. Rooms already on the floor are not affected.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Add floor'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
