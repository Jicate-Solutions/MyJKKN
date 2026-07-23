'use client';

// caste-form-dialog.tsx
// Create/Edit dialog for the `castes` table. Caste is a child of a community
// category. Aliases are entered comma-separated and stored as text[].

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { CasteService, type Caste } from '@/lib/services/admission/caste-service';

interface CommunityOption {
  id: string;
  name: string;
  code: string;
}

const casteFormSchema = z.object({
  community_category_id: z.string().uuid('Select a community'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(160, 'Name must be at most 160 characters'),
  aliases: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  sort_order: z
    .number({ invalid_type_error: 'Sort order must be a number' })
    .int()
    .min(0)
    .max(9999),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof casteFormSchema>;

interface CasteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialValues: Caste | null;
  communities: CommunityOption[];
  /** Pre-selected community when creating from a filtered view. */
  defaultCommunityId?: string;
  onSuccess?: () => void;
}

const parseAliases = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

export function CasteFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  communities,
  defaultCommunityId,
  onSuccess,
}: CasteFormDialogProps) {
  const isEditing = mode === 'edit';

  const form = useForm<FormValues>({
    resolver: zodResolver(casteFormSchema),
    defaultValues: {
      community_category_id: defaultCommunityId ?? '',
      name: '',
      aliases: '',
      notes: '',
      sort_order: 99,
      is_active: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      form.reset({
        community_category_id: initialValues.community_category_id,
        name: initialValues.name,
        aliases: (initialValues.aliases ?? []).join(', '),
        notes: initialValues.notes ?? '',
        sort_order: initialValues.sort_order ?? 99,
        is_active: initialValues.is_active,
      });
    } else {
      form.reset({
        community_category_id: defaultCommunityId ?? '',
        name: '',
        aliases: '',
        notes: '',
        sort_order: 99,
        is_active: true,
      });
    }
  }, [open, initialValues, defaultCommunityId, form]);

  const handleSubmit = async (values: FormValues) => {
    try {
      const payload = {
        community_category_id: values.community_category_id,
        name: values.name,
        aliases: parseAliases(values.aliases),
        notes: values.notes?.trim() ? values.notes.trim() : null,
        sort_order: values.sort_order,
        is_active: values.is_active,
      };
      if (isEditing && initialValues) {
        await CasteService.update(initialValues.id, payload);
        toast.success(`Updated caste "${values.name}"`);
      } else {
        await CasteService.create(payload);
        toast.success(`Created caste "${values.name}"`);
      }
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save caste';
      toast.error(message);
    }
  };

  const isBusy = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Caste' : 'New Caste'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the caste details.'
              : 'Add a new caste under a community category.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="community_category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Community *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isBusy}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select community" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {communities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.code})
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vanniakula Kshatriya" {...field} disabled={isBusy} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="aliases"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aliases</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="vanniyar, padayachi, palli"
                      {...field}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormDescription>
                    Comma-separated spelling variants. Used to match legacy text values on import.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="District-scoping or clarification notes (optional)"
                      rows={2}
                      {...field}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormDescription>Lower numbers appear first in dropdowns.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>Inactive castes are hidden from active dropdowns.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isBusy} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Caste'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
