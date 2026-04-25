'use client';

import { useEffect, useState } from 'react';
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

interface Institution { id: string; name: string; }

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
  const { userProfile, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [institutions, setInstitutions] = useState<Institution[]>([]);

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

  // Fetch institutions from COE database
  useEffect(() => {
    fetch('/api/bos/institutions')
      .then((r) => r.json())
      .then((list: Institution[]) => {
        setInstitutions(Array.isArray(list) ? list : []);
        if (!expert && !isSuperAdmin && Array.isArray(list) && list.length === 1) {
          form.setValue('institutions_id', list[0].id);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast path: set institution from profile (non-admin)
  useEffect(() => {
    if (!expert && !isSuperAdmin && userProfile?.institution_id) {
      form.setValue('institutions_id', userProfile.institution_id);
    }
  }, [userProfile, expert, isSuperAdmin, form]);

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
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>

        {/* ── Institution selector (super admin only) ─────────────────── */}
        {isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Institution</CardTitle>
            </CardHeader>
            <CardContent>
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
                        {institutions.map((inst) => (
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
            </CardContent>
          </Card>
        )}

        {/* ── Identity ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Expert Identity</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-4'>
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

            <div className='grid gap-4 md:grid-cols-2'>
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
                    <FormDescription>
                      UGC-defined category for this BoS member position.
                    </FormDescription>
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
          <CardHeader>
            <CardTitle className='text-base'>Affiliation</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='institution_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution / Company</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Anna University' {...field} />
                    </FormControl>
                    <FormDescription>
                      Where the expert is currently employed.
                    </FormDescription>
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
          <CardHeader>
            <CardTitle className='text-base'>Contact Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type='email' placeholder='expert@institution.ac.in' {...field} />
                    </FormControl>
                    <FormDescription>
                      Used for call letter dispatch (Phase 5+).
                    </FormDescription>
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
                      placeholder='Full postal address for call letters and TA/DA billing'
                      className='resize-none'
                      rows={3}
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
          <CardContent className='p-6 space-y-4'>
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
