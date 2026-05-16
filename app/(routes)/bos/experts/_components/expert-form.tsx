'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import {
  BosExternalExpert,
  BOS_EXPERT_CATEGORY_LABELS,
} from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext, useAllInstitutionContexts } from '@/hooks/use-institution-context';

// ── Validation Schema ─────────────────────────────────────────────────────────

const expertFormSchema = z.object({
  institutions_id: z.string().min(1, 'Institution is required'),
  name: z.string().min(1, 'Name is required').max(255),
  title: z.string().optional(),
  designation: z.string().optional(),
  institution_name: z.string().optional(),
  department_name: z.string().optional(),
  address: z.string().optional(),
  contact_no: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  category: z.enum([
    'university_nominee',
    'subject_expert',
    'industry_expert',
    'alumni',
    'startup',
  ]),
  specialization: z.string().optional(),
  qualifications: z.string().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
});

export type ExpertFormValues = z.infer<typeof expertFormSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExpertFormProps {
  expert?: BosExternalExpert;         // undefined = create mode
  isSubmitting: boolean;
  onSubmit: (data: ExpertFormValues) => void;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExpertForm({ expert, isSubmitting, onSubmit, onCancel }: ExpertFormProps) {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  // Non-admins: own institution resolved automatically.
  // Super-admins: disabled (returns undefined); they pick from the dropdown.
  const { data: institutionCtx } = useInstitutionContext();
  // Super-admin institution list for the picker dropdown.
  const { data: allContexts = [] } = useAllInstitutionContexts();

  const form = useForm<ExpertFormValues>({
    resolver: zodResolver(expertFormSchema),
    defaultValues: expert
      ? {
          institutions_id: expert.institutions_id,
          name: expert.name,
          title: expert.title ?? '',
          designation: expert.designation ?? '',
          institution_name: expert.institution_name ?? '',
          department_name: expert.department_name ?? '',
          address: expert.address ?? '',
          contact_no: expert.contact_no ?? '',
          email: expert.email ?? '',
          category: expert.category,
          specialization: expert.specialization ?? '',
          qualifications: expert.qualifications ?? '',
          is_active: expert.is_active,
          notes: expert.notes ?? '',
        }
      : {
          institutions_id: '',
          name: '',
          title: '',
          designation: '',
          institution_name: '',
          department_name: '',
          address: '',
          contact_no: '',
          email: '',
          category: 'subject_expert',
          specialization: '',
          qualifications: '',
          is_active: true,
          notes: '',
        },
  });

  // Auto-set institution for non-admins once context resolves.
  useEffect(() => {
    if (expert || isSuperAdmin || !institutionCtx?.myjkkn_id) return;
    form.setValue('institutions_id', institutionCtx.myjkkn_id, { shouldValidate: true });
  }, [institutionCtx?.myjkkn_id, isSuperAdmin, expert, form]);

  if (permissionsLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>

        {/* ── Institution selector (super admin only) ─────────────────── */}
        {isSuperAdmin && (
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Institution</CardTitle>
            </CardHeader>
            <CardContent className='pt-0'>
              <FormField
                control={form.control}
                name='institutions_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution <span className='text-destructive'>*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allContexts.map((ctx) => (
                          <SelectItem key={ctx.myjkkn_id} value={ctx.myjkkn_id}>
                            {ctx.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Identity ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Expert Identity</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 space-y-3'>
            <div className='grid gap-3 md:grid-cols-4'>
              {/* Title */}
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {['Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.'].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Full Name */}
              <div className='md:col-span-3'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name <span className='text-destructive'>*</span></FormLabel>
                      <FormControl>
                        <Input placeholder='e.g. Rajesh Kumar' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              {/* Category */}
              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category <span className='text-destructive'>*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select category' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(BOS_EXPERT_CATEGORY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Designation */}
              <FormField
                control={form.control}
                name='designation'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Associate Professor' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Affiliation ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Affiliation</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 space-y-3'>
            <div className='grid gap-3 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='institution_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution / Company</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Anna University' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='department_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Department of Computer Science' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='specialization'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specialization</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='e.g. Machine Learning, Data Mining, Algorithms'
                      className='resize-none'
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='qualifications'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qualifications</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. MCA, M.Phil, Ph.D.' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Contact ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Contact Details</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 space-y-3'>
            <div className='grid gap-3 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type='email' placeholder='expert@institution.ac.in' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='contact_no'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Number</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. +91 98765 43210' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='address'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Full postal address'
                      className='resize-none'
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Settings ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className='p-4 space-y-3'>
            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Any internal notes about this expert (not printed on documents)'
                      className='resize-none'
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Active</FormLabel>
                    <FormDescription>
                      Inactive experts will not appear in composition member lists.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className='flex justify-end gap-3'>
          <Button type='button' variant='outline' onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : expert
              ? 'Update Expert'
              : 'Add Expert'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
