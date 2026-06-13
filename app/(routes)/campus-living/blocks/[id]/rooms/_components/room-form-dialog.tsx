'use client';

// Create / Edit dialog for a hostel room.
//
// Shared by the rooms list:
//   - "Add Room" header button   → mode='create'
//   - row-action "Edit"          → mode='edit' (via room-row-actions adapter)
//
// Mirrors the fields of the standalone /rooms/new page but as an in-place
// dialog so the list never has to navigate away. We lean on the mutation
// hooks (useCreateHostelRoom / useUpdateHostelRoom) for the success/error
// toasts + cache invalidation — exactly like new/page.tsx — so this dialog
// stays silent and just closes on success (no double toast).

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import {
  useCreateHostelRoom,
  useUpdateHostelRoom,
  useRoomAmenityTagIds,
} from '@/hooks/campus-living/use-hostel-rooms';
import { useAmenitiesByScope } from '@/hooks/campus-living/use-amenities';
import type { HostelRoom, RoomType, AcStatus } from '@/types/campus-living';
import { ROOM_PURPOSE_OPTIONS, TIER_ACCESS_OPTIONS } from './room-meta';

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'triple', label: 'Triple' },
  { value: 'quad', label: 'Quad' },
  { value: 'dormitory', label: 'Dormitory' },
];

const AC_STATUSES: { value: AcStatus; label: string }[] = [
  { value: 'non_ac', label: 'Non-AC' },
  { value: 'ac', label: 'AC' },
  { value: 'cooler', label: 'Cooler' },
];

const formSchema = z
  .object({
    room_number: z
      .string()
      .trim()
      .min(1, 'Room number is required')
      .max(20, 'Room number is too long'),
    floor: z.coerce.number().int().min(0, 'Floor must be 0 or greater').max(50),
    room_type: z.enum(['single', 'double', 'triple', 'quad', 'dormitory']),
    ac_status: z.enum(['non_ac', 'ac', 'cooler']),
    room_purpose: z.string().min(1, 'Purpose is required'),
    tier_access: z.string().min(1, 'Tier is required'),
    // Optional at the field level — required for student rooms only (see
    // superRefine). Special-purpose rooms (Accounts, Warden, …) have no category.
    category_id: z.string().optional(),
    capacity: z.coerce.number().int().min(1, 'At least 1 bed').max(20),
    // Real bed-count; can differ from sanctioned capacity (a 6-bed dorm
    // fitting 7). String round-trip so '' → null (nullable column).
    actual_capacity: z.string().optional(),
    // Kept as a string so an empty input round-trips to null (annual_fee is
    // nullable). z.coerce.number() would turn '' into 0 and hide "no fee set".
    annual_fee: z.string().optional(),
    // Free-text status strings (e.g. "DONE PROPERLY", "RENOVATED Pending
    // (Window added)", "LAST YEAR DONE") — no enum so nothing is lost.
    renovated: z.string().optional(),
    painting: z.string().optional(),
    has_attached_bathroom: z.boolean(),
    is_accessible: z.boolean(),
  })
  .superRefine((data, ctx) => {
    // Student rooms drive fee/tier resolution, so they need a category. Special-
    // purpose rooms legitimately have none — requiring it would make them
    // uneditable (the bug that hid Accounts/Warden rooms from this form).
    if (data.room_purpose === 'student' && !data.category_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category_id'],
        message: 'Category is required for student rooms',
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const DEFAULTS: FormValues = {
  room_number: '',
  floor: 1,
  room_type: 'double',
  ac_status: 'non_ac',
  room_purpose: 'student',
  tier_access: 'classic',
  category_id: '',
  capacity: 2,
  actual_capacity: '',
  annual_fee: '',
  renovated: '',
  painting: '',
  has_attached_bathroom: false,
  is_accessible: false,
};

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  blockId: string;
  /** Block gender ('boys' | 'girls' | 'mixed') — narrows the category list. */
  blockType?: string;
  /** Required in edit mode — the room being edited. */
  room?: HostelRoom;
}

export function RoomFormDialog({
  open,
  onOpenChange,
  mode,
  blockId,
  blockType,
  room,
}: RoomFormDialogProps) {
  const createRoom = useCreateHostelRoom();
  const updateRoom = useUpdateHostelRoom();
  const { hostelCategories: allCategories, loading: categoriesLoading } =
    useActiveHostelCategories();
  const { amenities: roomAmenities, loading: amenitiesLoading } =
    useAmenitiesByScope('room');
  const { data: existingAmenityTagIds } = useRoomAmenityTagIds(
    room?.id,
    open && mode === 'edit'
  );
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleAmenity = (id: string) =>
    setSelectedAmenityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // Categories are gendered tiers; a block is a single gender, so only its
  // matching tiers apply. A 'mixed' block (rare) accepts every category.
  const categories =
    blockType && blockType !== 'mixed'
      ? allCategories.filter((c) => c.type === blockType)
      : allCategories;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && room) {
      form.reset({
        room_number: room.room_number,
        floor: room.floor,
        room_type: room.room_type,
        ac_status: room.ac_status,
        room_purpose: room.room_purpose ?? 'student',
        tier_access: room.tier_access ?? 'classic',
        category_id: room.category_id ?? '',
        capacity: room.capacity,
        actual_capacity:
          room.actual_capacity != null ? String(room.actual_capacity) : '',
        annual_fee: room.annual_fee != null ? String(room.annual_fee) : '',
        renovated: room.renovated ?? '',
        painting: room.painting ?? '',
        has_attached_bathroom: !!room.has_attached_bathroom,
        is_accessible: !!room.is_accessible,
      });
    } else {
      form.reset(DEFAULTS);
    }
  }, [open, mode, room, form]);

  // Pre-fill the amenity picker from the room's saved tags (edit mode only).
  useEffect(() => {
    if (!open) return;
    setSelectedAmenityIds(mode === 'edit' ? existingAmenityTagIds ?? [] : []);
  }, [open, mode, existingAmenityTagIds]);

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        room_number: data.room_number.trim(),
        floor: data.floor,
        room_type: data.room_type,
        ac_status: data.ac_status,
        room_purpose: data.room_purpose,
        tier_access: data.tier_access,
        // '' → null: special-purpose rooms carry no category (nullable FK).
        category_id: data.category_id ? data.category_id : null,
        capacity: data.capacity,
        actual_capacity:
          data.actual_capacity && data.actual_capacity.trim() !== ''
            ? Number(data.actual_capacity)
            : null,
        annual_fee:
          data.annual_fee && data.annual_fee.trim() !== ''
            ? Number(data.annual_fee)
            : null,
        renovated:
          data.renovated && data.renovated.trim() !== ''
            ? data.renovated.trim()
            : null,
        painting:
          data.painting && data.painting.trim() !== ''
            ? data.painting.trim()
            : null,
        has_attached_bathroom: data.has_attached_bathroom,
        is_accessible: data.is_accessible,
      };

      if (mode === 'create') {
        await createRoom.mutateAsync({
          block_id: blockId,
          ...payload,
          amenityTagIds: selectedAmenityIds,
        });
      } else if (room) {
        await updateRoom.mutateAsync({
          id: room.id,
          payload,
          amenityTagIds: selectedAmenityIds,
        });
      }
      onOpenChange(false);
    } catch {
      // toast surfaced by the mutation hook's onError
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Room' : 'Edit Room'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create a room in this block.'
              : `Update the details for room ${room?.room_number ?? ''}.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="room_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 101" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="floor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={50} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="room_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROOM_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Room Category
                      {form.watch('room_purpose') !== 'student' && (
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          (Optional)
                        </span>
                      )}
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={categoriesLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {blockType &&
                      blockType !== 'mixed' &&
                      !categoriesLoading &&
                      categories.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No {blockType} categories defined. Add one under
                          Settings → Hostel Rooms Categories.
                        </p>
                      )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ac_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AC Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select AC status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {AC_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="room_purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purpose</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROOM_PURPOSE_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tier_access"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tier</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIER_ACCESS_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity (beds)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={20} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="actual_capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Actual Capacity{' '}
                      <span className="text-muted-foreground font-normal">
                        (Optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        placeholder="real bed count"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="annual_fee"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>
                      Annual Fee (INR){' '}
                      <span className="text-muted-foreground font-normal">
                        (Optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="optional"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="renovated"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Renovation{' '}
                      <span className="text-muted-foreground font-normal">
                        (Optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Done properly / Renovated"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="painting"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Painting{' '}
                      <span className="text-muted-foreground font-normal">
                        (Optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Pending / Finished" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="has_attached_bathroom"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <FormLabel className="cursor-pointer">
                      Attached Bathroom
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_accessible"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <FormLabel className="cursor-pointer">
                      Wheelchair Accessible
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Amenities</Label>
              {amenitiesLoading ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading amenities…
                </div>
              ) : roomAmenities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No room-scoped amenities defined yet. Add them under Settings →
                  Amenities (set Scope to Room or Both).
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {roomAmenities.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <Label htmlFor={`room-amenity-${a.id}`} className="cursor-pointer">
                        {a.name}
                      </Label>
                      <Switch
                        id={`room-amenity-${a.id}`}
                        checked={selectedAmenityIds.includes(a.id)}
                        onCheckedChange={() => toggleAmenity(a.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {mode === 'create' ? 'Create Room' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
