'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SourceMasterService,
  type SourceMaster,
  type LeadSourceEnum,
} from '@/lib/services/admission/source-master-service';

const ENUM_OPTIONS: { value: LeadSourceEnum; label: string }[] = [
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-In' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'education_fair', label: 'Education Fair' },
  { value: 'agent', label: 'Agent' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'inbound_call', label: 'Inbound Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'gate_entry', label: 'Gate Entry' },
  { value: 'other', label: 'Other' },
];

const KEY_REGEX = /^[a-z0-9_]+$/;

const formSchema = z.object({
  key: z
    .string()
    .min(2, 'Key must be at least 2 characters')
    .max(64, 'Key must be at most 64 characters')
    .regex(KEY_REGEX, 'Use lowercase letters, numbers, and underscores only'),
  enum_value: z.string().min(1, 'Routing target is required'),
  label: z.string().min(2, 'Label must be at least 2 characters').max(120),
  description: z.string().max(500).optional().nullable(),
  display_order: z
    .number({ invalid_type_error: 'Display order must be a number' })
    .int()
    .min(0)
    .max(9999)
    .default(100),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface SourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: SourceMaster | null;
  onSaved?: () => void;
}

export function SourceFormDialog({
  open,
  onOpenChange,
  source,
  onSaved,
}: SourceFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!source;
  const isSystem = !!source?.is_system;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      key: '',
      enum_value: 'other',
      label: '',
      description: '',
      display_order: 100,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        key: source?.key ?? '',
        enum_value: source?.enum_value ?? 'other',
        label: source?.label ?? '',
        description: source?.description ?? '',
        display_order: source?.display_order ?? 100,
        is_active: source?.is_active ?? true,
      });
    }
  }, [open, source, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEditing && source) {
        return SourceMasterService.update(source.id, {
          label: values.label,
          description: values.description ?? null,
          display_order: values.display_order,
          is_active: values.is_active,
          ...(isSystem
            ? {}
            : { key: values.key, enum_value: values.enum_value as LeadSourceEnum }),
        });
      }
      return SourceMasterService.create({
        key: values.key,
        enum_value: values.enum_value as LeadSourceEnum,
        label: values.label,
        description: values.description ?? null,
        display_order: values.display_order,
        is_active: values.is_active,
      });
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Source updated' : 'Source created');
      queryClient.invalidateQueries({ queryKey: ['admission-sources-master'] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save source');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Source' : 'New Source'}</DialogTitle>
          <DialogDescription>
            {isSystem
              ? 'System source — key and routing target are locked. You can edit label, description, order, and active status.'
              : 'Custom sources let you track finer business-level distinctions while still routing to a core lead source enum.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. JKKN Trichy Expo Oct'26" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="trichy_expo_oct26"
                        disabled={isSystem}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Stable internal identifier (lowercase, underscores)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="enum_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routes To</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSystem}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick parent enum" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ENUM_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Parent enum used by routing + analytics
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Optional notes for the team"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="display_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={9999}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border px-3 py-2 mt-1.5">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription className="text-xs">
                        Inactive sources stay hidden from capture forms
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? 'Saving...'
                  : isEditing
                    ? 'Save changes'
                    : 'Create source'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
