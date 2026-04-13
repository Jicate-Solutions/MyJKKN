'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useRoles } from '@/hooks/organization/use-roles';
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

// Wire types MUST match the API contract in app/api/admin/notifications/audiences/route.ts:
//   - query_type: 'built_in' | 'sql'   (snake_case, matches DB enum)
//   - query_params: { name: BuiltInName } | { sql: string }
const audienceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name must be less than 80 characters'),
    description: z
      .string()
      .max(500, 'Description must be less than 500 characters')
      .optional()
      .or(z.literal('')),
    icon: z.string().min(1, 'Select an icon'),
    query_type: z.enum(['built_in', 'sql']),
    built_in_type: z.string().optional(),
    custom_sql: z.string().max(4096).optional(),
    // Visual builder fields
    selected_roles: z.array(z.string()).optional(),
    selected_institution_id: z.string().optional(),
    login_direction: z.enum(['not_logged_in', 'logged_in']).optional(),
    login_days: z.number().min(1).max(365).optional()
  })
  .superRefine((data, ctx) => {
    if (!data.built_in_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select an audience condition',
        path: ['built_in_type']
      });
    }
    if (data.built_in_type === 'role_filter' && (!data.selected_roles || data.selected_roles.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select at least one role',
        path: ['selected_roles']
      });
    }
    if (data.built_in_type === 'institution_filter' && !data.selected_institution_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select an institution',
        path: ['selected_institution_id']
      });
    }
    if (data.built_in_type === 'login_recency' && !data.login_days) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter number of days',
        path: ['login_days']
      });
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
  const queryClient = useQueryClient();
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
      query_type: 'built_in',
      built_in_type: undefined,
      custom_sql: '',
      selected_roles: [],
      selected_institution_id: undefined,
      login_direction: 'not_logged_in',
      login_days: 7
    }
  });

  const queryType = form.watch('query_type');
  const selectedIcon = form.watch('icon');
  const selectedCondition = form.watch('built_in_type');
  const IconPreview =
    ICON_OPTIONS.find((o) => o.value === selectedIcon)?.Icon ?? Users;

  // Data for visual builder sub-forms
  const { institutions: institutionsData } = useInstitutionsWithAccess({});
  const institutions = institutionsData || [];
  const { data: rolesData } = useRoles({ includeSystemRoles: true });
  const availableRoles = (rolesData || []).map((r: any) => ({
    value: r.role_key,
    label: r.role_name
  }));

  // Produces the API-compatible payload shape:
  //   { name, description, icon, query_type, query_params }
  function buildPayload(data: AudienceFormValues) {
    const base = {
      name: data.name,
      description: data.description || null,
      icon: data.icon,
      query_type: 'built_in' as const
    };

    const builtIn = data.built_in_type;

    // Build query_params based on the condition type
    if (builtIn === 'role_filter') {
      return { ...base, query_params: { name: 'role_filter', roles: data.selected_roles } };
    }
    if (builtIn === 'institution_filter') {
      return { ...base, query_params: { name: 'institution_filter', institution_id: data.selected_institution_id } };
    }
    if (builtIn === 'login_recency') {
      const key = data.login_direction === 'logged_in' ? 'logged_in_within_days' : 'not_logged_in_days';
      return { ...base, query_params: { name: 'login_recency', [key]: data.login_days || 7 } };
    }
    // All other types: simple name-only query_params
    return { ...base, query_params: { name: builtIn } };
  }

  // Save-then-preview flow:
  //   1) POST /audiences          → creates the audience row (super_admin only)
  //   2) GET  /audiences/:id/preview → returns count + preview_users
  //
  // Rationale: there is no collection-level /preview endpoint, and an older
  // implementation that POSTed `{ preview_only: true }` to the create route
  // silently created real rows on every click (the server never read the
  // flag). The save-first approach is the simplest path that avoids DB
  // pollution and respects the existing permission model.
  async function handlePreview() {
    // Clear any previous result BEFORE validation so a stale error banner
    // doesn't hang around if validation now fails.
    setPreviewError(null);
    setPreviewResult(null);

    const valid = await form.trigger();
    if (!valid) return;

    const data = form.getValues();
    setIsPreviewing(true);

    try {
      // Step 1: create the audience
      const createRes = await fetch('/api/admin/notifications/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(buildPayload(data))
      });

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        throw new Error(body.error || 'Preview failed');
      }

      const createBody = await createRes.json();
      const audienceId = createBody?.audience?.id;
      if (!audienceId) {
        throw new Error('Preview failed: audience id missing in response');
      }

      // Step 2: fetch preview for the newly created audience
      const previewRes = await fetch(
        `/api/admin/notifications/audiences/${audienceId}/preview`,
        { cache: 'no-store' }
      );

      if (!previewRes.ok) {
        const body = await previewRes.json().catch(() => ({}));
        throw new Error(body.error || 'Preview failed');
      }

      const previewBody = await previewRes.json();
      const users: PreviewUser[] = Array.isArray(previewBody.preview_users)
        ? previewBody.preview_users
        : [];
      const count: number =
        typeof previewBody.count === 'number' ? previewBody.count : users.length;

      setPreviewResult({ count, users: users.slice(0, 20) });
      toast.success(`Audience saved — matched ${count} users`);
      // Once the audience exists, the form should navigate to the list so
      // the user sees their creation and doesn't double-create on re-click.
      router.push('/admin/notifications/audiences');
      router.refresh();
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

      // Invalidate the list cache so audience-list.tsx doesn't show stale
      // data until its next refetch. Pair with the queryClient import below.
      queryClient.invalidateQueries({ queryKey: ['notification-audiences'] });

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
        <p className='text-sm text-muted-foreground'>
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

              {/* Audience Condition — Visual Builder */}
              <div className='space-y-4'>
                <FormLabel>Who should be in this audience? *</FormLabel>

                {/* Condition Type Picker */}
                <FormField
                  control={form.control}
                  name='built_in_type'
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          // Auto-set query_type to built_in for all visual options
                          form.setValue('query_type', 'built_in');
                          setPreviewResult(null);
                          setPreviewError(null);
                        }}
                        value={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Pick a condition...' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='_header_everyone' disabled>
                            <span className='text-xs font-semibold text-muted-foreground uppercase'>Everyone</span>
                          </SelectItem>
                          <SelectItem value='all_active_users'>All Active Users</SelectItem>
                          <SelectItem value='all_students'>All Students</SelectItem>
                          <SelectItem value='all_faculty'>All Faculty (incl. HODs, Principals)</SelectItem>

                          <SelectItem value='_header_role' disabled>
                            <span className='text-xs font-semibold text-muted-foreground uppercase'>By Role</span>
                          </SelectItem>
                          <SelectItem value='all_hods'>All HODs</SelectItem>
                          <SelectItem value='role_filter'>Pick specific roles...</SelectItem>

                          <SelectItem value='_header_inst' disabled>
                            <span className='text-xs font-semibold text-muted-foreground uppercase'>By Institution</span>
                          </SelectItem>
                          <SelectItem value='institution_filter'>Pick an institution...</SelectItem>

                          <SelectItem value='_header_engage' disabled>
                            <span className='text-xs font-semibold text-muted-foreground uppercase'>By Engagement</span>
                          </SelectItem>
                          <SelectItem value='login_recency'>By login activity...</SelectItem>
                          <SelectItem value='push_subscribers'>Users WITH push notifications</SelectItem>
                          <SelectItem value='no_push'>Users WITHOUT push notifications</SelectItem>

                          <SelectItem value='_header_risk' disabled>
                            <span className='text-xs font-semibold text-muted-foreground uppercase'>By Risk</span>
                          </SelectItem>
                          <SelectItem value='attendance_below'>At-risk students (low attendance)</SelectItem>
                          <SelectItem value='work_pulse_laggards'>Work Pulse Laggards (no entry this week)</SelectItem>

                          <SelectItem value='_header_future' disabled>
                            <span className='text-xs font-semibold text-muted-foreground uppercase'>Coming Soon</span>
                          </SelectItem>
                          <SelectItem value='hostel_residents'>Hostel Residents (requires hostel module)</SelectItem>
                          <SelectItem value='bus_commuters'>Bus Commuters (requires transport module)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Sub-form: Role Picker */}
              {selectedCondition === 'role_filter' && (
                <FormField
                  control={form.control}
                  name='selected_roles'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select roles *</FormLabel>
                      <FormDescription>Pick one or more roles to include in this audience</FormDescription>
                      <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
                        {availableRoles.map((role: any) => (
                          <div key={role.value} className='flex items-center gap-2 p-2 border rounded-lg hover:bg-muted/50'>
                            <Checkbox
                              id={`role-${role.value}`}
                              checked={field.value?.includes(role.value) || false}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                field.onChange(
                                  checked
                                    ? [...current, role.value]
                                    : current.filter((r: string) => r !== role.value)
                                );
                              }}
                            />
                            <Label htmlFor={`role-${role.value}`} className='text-sm cursor-pointer'>
                              {role.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Sub-form: Institution Picker */}
              {selectedCondition === 'institution_filter' && (
                <FormField
                  control={form.control}
                  name='selected_institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select institution *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Pick an institution...' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {institutions.map((inst: any) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Sub-form: Login Activity */}
              {selectedCondition === 'login_recency' && (
                <div className='space-y-3 p-4 border rounded-lg bg-muted/30'>
                  <FormField
                    control={form.control}
                    name='login_direction'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Show users who...</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value || 'not_logged_in'}
                            className='flex gap-4'
                          >
                            <div className='flex items-center gap-2'>
                              <RadioGroupItem value='not_logged_in' id='login-inactive' />
                              <Label htmlFor='login-inactive' className='text-sm cursor-pointer'>
                                Have NOT logged in
                              </Label>
                            </div>
                            <div className='flex items-center gap-2'>
                              <RadioGroupItem value='logged_in' id='login-active' />
                              <Label htmlFor='login-active' className='text-sm cursor-pointer'>
                                HAVE logged in
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='login_days'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Within the last...</FormLabel>
                        <div className='flex items-center gap-2'>
                          <FormControl>
                            <Input
                              type='number'
                              min={1}
                              max={365}
                              className='w-24'
                              value={field.value || 7}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 7)}
                            />
                          </FormControl>
                          <span className='text-sm text-muted-foreground'>days</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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

              {/* Actions — on mobile stack vertically (each button full-width),
                  on sm+ line them up horizontally. Fixes the pile-up where
                  Preview + Save competed for ~160px each on a 360px phone. */}
              <div className='flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => router.back()}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
                <div className='flex flex-col gap-2 w-full sm:flex-row sm:w-auto sm:items-center'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handlePreview}
                    disabled={isPreviewing || isSubmitting}
                    className='w-full sm:w-auto'
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
                    className='w-full sm:w-auto'
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
