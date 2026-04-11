'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';
import {
  Users,
  GraduationCap,
  UserCog,
  Briefcase,
  Home,
  Bus,
  AlertTriangle,
  Megaphone,
  Shield,
  Eye,
  Save,
  Loader2,
  AlertCircle
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// --- Constants -----------------------------------------------------------

const ICON_OPTIONS = [
  { value: 'Users', label: 'Users', Icon: Users },
  { value: 'GraduationCap', label: 'Graduation Cap', Icon: GraduationCap },
  { value: 'UserCog', label: 'User Cog', Icon: UserCog },
  { value: 'Briefcase', label: 'Briefcase', Icon: Briefcase },
  { value: 'Home', label: 'Home', Icon: Home },
  { value: 'Bus', label: 'Bus', Icon: Bus },
  { value: 'AlertTriangle', label: 'Alert Triangle', Icon: AlertTriangle },
  { value: 'Megaphone', label: 'Megaphone', Icon: Megaphone },
  { value: 'Shield', label: 'Shield', Icon: Shield }
] as const;

const BUILT_IN_TYPES = [
  {
    value: 'all_active_users',
    label: 'All Active Users',
    description: 'Every active user across all roles'
  },
  {
    value: 'all_students',
    label: 'All Students',
    description: 'All students currently enrolled'
  },
  {
    value: 'all_faculty',
    label: 'All Faculty',
    description: 'All teaching faculty members'
  },
  {
    value: 'all_hods',
    label: 'All HODs',
    description: 'Heads of department across institutions'
  },
  {
    value: 'hostel_residents',
    label: 'Hostel Residents',
    description: 'Students living in hostels'
  },
  {
    value: 'bus_commuters',
    label: 'Bus Commuters',
    description: 'Users assigned to a transport route'
  },
  {
    value: 'work_pulse_laggards',
    label: 'Work Pulse Laggards',
    description: 'Staff with pending work pulse submissions'
  }
] as const;

// --- Schema --------------------------------------------------------------

const audienceSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name must be less than 80 characters'),
    description: z
      .string()
      .max(500, 'Description must be less than 500 characters')
      .optional()
      .or(z.literal('')),
    icon: z.string().min(1, 'Select an icon'),
    query_type: z.enum(['built-in', 'custom-sql']),
    built_in_type: z.string().optional(),
    custom_sql: z.string().optional()
  })
  .superRefine((data, ctx) => {
    if (data.query_type === 'built-in' && !data.built_in_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a built-in audience type',
        path: ['built_in_type']
      });
    }
    if (data.query_type === 'custom-sql') {
      const sql = (data.custom_sql ?? '').trim();
      if (!sql) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Custom SQL is required',
          path: ['custom_sql']
        });
      } else if (!/\bid\b/i.test(sql)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SQL must return a column named 'id' (the user_id)",
          path: ['custom_sql']
        });
      }
    }
  });

type AudienceFormValues = z.infer<typeof audienceSchema>;

interface PreviewUser {
  id: string;
  email?: string | null;
  name?: string | null;
  full_name?: string | null;
  role?: string | null;
}

interface PreviewResult {
  count: number;
  users: PreviewUser[];
}

// --- Component -----------------------------------------------------------

export function AudienceForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
    null
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

  const form = useForm<AudienceFormValues>({
    resolver: zodResolver(audienceSchema),
    defaultValues: {
      name: '',
      description: '',
      icon: 'Users',
      query_type: 'built-in',
      built_in_type: undefined,
      custom_sql: ''
    }
  });

  const queryType = form.watch('query_type');
  const selectedIcon = form.watch('icon');
  const IconPreview =
    ICON_OPTIONS.find((o) => o.value === selectedIcon)?.Icon ?? Users;

  function buildPayload(data: AudienceFormValues) {
    return {
      name: data.name,
      description: data.description || null,
      icon: data.icon,
      query_type: data.query_type,
      built_in_type:
        data.query_type === 'built-in' ? data.built_in_type : null,
      custom_sql:
        data.query_type === 'custom-sql' ? data.custom_sql?.trim() : null
    };
  }

  async function handlePreview() {
    // Validate before firing a preview request
    const valid = await form.trigger();
    if (!valid) return;

    const data = form.getValues();
    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewResult(null);

    try {
      const res = await fetch('/api/admin/notifications/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ ...buildPayload(data), preview_only: true })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Preview failed');
      }

      const body = await res.json();
      const users: PreviewUser[] = body.users || body.preview || [];
      const count: number =
        body.count ?? body.total ?? users.length ?? 0;
      setPreviewResult({ count, users: users.slice(0, 20) });
      toast.success(`Matched ${count} users`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Preview failed';
      setPreviewError(message);
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function onSubmit(data: AudienceFormValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/notifications/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(buildPayload(data))
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save audience');
      }

      toast.success('Audience created');
      router.push('/admin/notifications/audiences');
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save audience'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className='flex-1 space-y-4 pt-2 sm:pt-4'>
      <div>
        <h2 className='text-2xl sm:text-3xl font-bold tracking-tight'>
          Create Audience
        </h2>
        <p className='text-sm text-muted-foreground hidden sm:block'>
          Define a reusable audience for targeted notifications
        </p>
      </div>

      <Card className='border-0 sm:border shadow-none sm:shadow-sm'>
        <CardHeader>
          <CardTitle>Audience details</CardTitle>
          <CardDescription>
            Give this audience a name, an icon, and the query that selects
            users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-6'
            >
              {/* Name */}
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g. Final year CSE students'
                        maxLength={80}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A short, human-friendly label
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='What does this audience cover? Optional.'
                        rows={3}
                        maxLength={500}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Icon */}
              <FormField
                control={form.control}
                name='icon'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon</FormLabel>
                    <div className='flex items-center gap-3'>
                      <div className='h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0'>
                        <IconPreview className='h-5 w-5 text-primary' />
                      </div>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className='flex-1'>
                            <SelectValue placeholder='Select an icon' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ICON_OPTIONS.map(({ value, label, Icon }) => (
                            <SelectItem key={value} value={value}>
                              <div className='flex items-center gap-2'>
                                <Icon className='h-4 w-4' />
                                <span>{label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Query type */}
              <FormField
                control={form.control}
                name='query_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Query type *</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(val) => {
                          field.onChange(val);
                          setPreviewResult(null);
                          setPreviewError(null);
                        }}
                        value={field.value}
                        className='grid grid-cols-1 sm:grid-cols-2 gap-3'
                      >
                        <div
                          className={cn(
                            'flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                            field.value === 'built-in'
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          )}
                        >
                          <RadioGroupItem
                            value='built-in'
                            id='query-built-in'
                            className='mt-1'
                          />
                          <Label
                            htmlFor='query-built-in'
                            className='flex-1 cursor-pointer'
                          >
                            <div className='font-medium text-sm'>
                              Built-in
                            </div>
                            <div className='text-xs text-muted-foreground mt-1'>
                              Pick from predefined audience types
                            </div>
                          </Label>
                        </div>
                        <div
                          className={cn(
                            'flex items-start space-x-3 rounded-lg border p-3 cursor-pointer transition-colors',
                            field.value === 'custom-sql'
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          )}
                        >
                          <RadioGroupItem
                            value='custom-sql'
                            id='query-custom'
                            className='mt-1'
                          />
                          <Label
                            htmlFor='query-custom'
                            className='flex-1 cursor-pointer'
                          >
                            <div className='font-medium text-sm'>
                              Custom SQL
                            </div>
                            <div className='text-xs text-muted-foreground mt-1'>
                              Advanced: write your own SELECT
                            </div>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Built-in select */}
              {queryType === 'built-in' && (
                <FormField
                  control={form.control}
                  name='built_in_type'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Built-in type *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select built-in audience' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BUILT_IN_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              <div>
                                <div className='font-medium'>{t.label}</div>
                                <div className='text-xs text-muted-foreground'>
                                  {t.description}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Custom SQL */}
              {queryType === 'custom-sql' && (
                <FormField
                  control={form.control}
                  name='custom_sql'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom SQL *</FormLabel>
                      <div className='rounded-md border border-yellow-200 bg-yellow-50 p-3 mb-2 text-xs text-yellow-900 flex items-start gap-2'>
                        <AlertCircle className='h-4 w-4 shrink-0 mt-0.5' />
                        <div>
                          <strong>Advanced users only.</strong> Your query
                          must return a column named{' '}
                          <code className='bg-yellow-100 px-1 rounded'>
                            id
                          </code>{' '}
                          containing the user_id. Read-only; dangerous
                          statements will be rejected.
                        </div>
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder='SELECT id FROM profiles WHERE role = $1'
                          rows={6}
                          className='font-mono text-xs'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Preview result */}
              {previewResult && (
                <Card>
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <CardTitle className='text-sm flex items-center gap-2'>
                        <Eye className='h-4 w-4' />
                        Preview
                      </CardTitle>
                      <Badge variant='secondary'>
                        {previewResult.count} users
                      </Badge>
                    </div>
                    <CardDescription>
                      First 20 users matched by this audience
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='pt-0'>
                    {previewResult.users.length === 0 ? (
                      <p className='text-sm text-muted-foreground text-center py-4'>
                        No users match this audience.
                      </p>
                    ) : (
                      <div className='max-h-64 overflow-y-auto border rounded-md divide-y'>
                        {previewResult.users.map((u, idx) => (
                          <div
                            key={u.id || idx}
                            className='px-3 py-2 text-sm flex items-center justify-between gap-2'
                          >
                            <div className='min-w-0'>
                              <p className='font-medium truncate'>
                                {u.full_name || u.name || u.email || u.id}
                              </p>
                              {u.email && (
                                <p className='text-xs text-muted-foreground truncate'>
                                  {u.email}
                                </p>
                              )}
                            </div>
                            {u.role && (
                              <Badge
                                variant='outline'
                                className='text-xs shrink-0'
                              >
                                {u.role}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {previewError && !previewResult && (
                <div className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2'>
                  <AlertCircle className='h-4 w-4 shrink-0 mt-0.5' />
                  <span>{previewError}</span>
                </div>
              )}

              {/* Actions */}
              <div className='flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => router.back()}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handlePreview}
                    disabled={isPreviewing || isSubmitting}
                    className='flex-1 sm:flex-none'
                  >
                    {isPreviewing ? (
                      <>
                        <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                        Previewing...
                      </>
                    ) : (
                      <>
                        <Eye className='h-4 w-4 mr-2' />
                        Preview
                      </>
                    )}
                  </Button>
                  <Button
                    type='submit'
                    disabled={isSubmitting || isPreviewing}
                    className='flex-1 sm:flex-none'
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className='h-4 w-4 mr-2' />
                        Save audience
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
