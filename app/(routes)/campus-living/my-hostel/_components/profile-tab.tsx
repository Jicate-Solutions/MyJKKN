'use client';

// Profile & Emergency tab — lets a resident view and edit their own
// hostel-specific emergency contact, parent phone, and medical notes.
//
// Data lives in `learner_hostel_profiles` (the side-table beside
// `learners_profiles`). RLS already allows the resident to read/upsert
// their own row (gated by campus_living.profile.view_own / .edit_own).
//
// Form is intentionally all-optional — the first save creates the row;
// a missing row (null from maybeSingle) renders an empty editable form.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import {
  useLearnerHostelProfile,
  useSaveLearnerHostelFields,
} from '@/hooks/campus-living/use-learner-hostel-profile';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Button } from '@/components/ui/button';
import { Loader2, UserCog } from 'lucide-react';

// ---------------------------------------------------------------------------
// Schema — all fields nullable/optional (the service normalises '' → null)
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  hostel_emergency_contact_name: z.string().max(150).optional(),
  hostel_emergency_contact_phone: z
    .string()
    .max(20)
    .refine(
      (v) => !v || /^\d{10}$/.test(v.trim()),
      'Must be a 10-digit number or leave blank',
    )
    .optional(),
  hostel_emergency_contact_relation: z.string().max(100).optional(),
  hostel_medical_notes: z.string().max(2000).optional(),
  hostel_parent_phone: z
    .string()
    .max(20)
    .refine(
      (v) => !v || /^\d{10}$/.test(v.trim()),
      'Must be a 10-digit number or leave blank',
    )
    .optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// ProfileTab
// ---------------------------------------------------------------------------
export function ProfileTab() {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? '';
  const updatedBy = profile?.id ?? null;

  const { data: hostelProfile, isLoading } = useLearnerHostelProfile(learnerId);
  const saveMutation = useSaveLearnerHostelFields();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      hostel_emergency_contact_name: '',
      hostel_emergency_contact_phone: '',
      hostel_emergency_contact_relation: '',
      hostel_medical_notes: '',
      hostel_parent_phone: '',
    },
  });

  // Pre-fill the form once the query resolves (or null = first-save, keep empty)
  useEffect(() => {
    if (isLoading) return;
    form.reset({
      hostel_emergency_contact_name: hostelProfile?.hostel_emergency_contact_name ?? '',
      hostel_emergency_contact_phone:
        hostelProfile?.hostel_emergency_contact_phone ?? '',
      hostel_emergency_contact_relation:
        hostelProfile?.hostel_emergency_contact_relation ?? '',
      hostel_medical_notes: hostelProfile?.hostel_medical_notes ?? '',
      hostel_parent_phone: hostelProfile?.hostel_parent_phone ?? '',
    });
  }, [isLoading, hostelProfile, form]);

  const onSubmit = async (values: ProfileFormValues) => {
    // Double-submit guard (repo gotcha: ~16ms race between mutateAsync and React commit)
    if (saveMutation.isPending) return;

    await saveMutation.mutateAsync({
      learnerId,
      profileFields: {
        hostel_emergency_contact_name: values.hostel_emergency_contact_name ?? null,
        hostel_emergency_contact_phone: values.hostel_emergency_contact_phone ?? null,
        hostel_emergency_contact_relation:
          values.hostel_emergency_contact_relation ?? null,
        hostel_medical_notes: values.hostel_medical_notes ?? null,
        hostel_parent_phone: values.hostel_parent_phone ?? null,
      },
      updatedBy,
    });
  };

  // ------------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className='flex items-center justify-center min-h-[200px]'>
        <Loader2 className='h-6 w-6 animate-spin text-primary' />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Form
  // ------------------------------------------------------------------
  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <UserCog className='h-5 w-5 text-primary' />
            Emergency &amp; Medical Profile
          </CardTitle>
          <CardDescription>
            Your emergency contact and medical notes are visible to the warden in case of
            an emergency. All fields are optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              {/* Emergency contact block */}
              <div className='space-y-4 rounded-md border p-4'>
                <h3 className='text-sm font-medium'>Emergency Contact</h3>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <FormField
                    control={form.control}
                    name='hostel_emergency_contact_name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl>
                          <Input placeholder='e.g. Rajesh Kumar' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='hostel_emergency_contact_relation'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relation</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='e.g. Father, Mother, Guardian'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name='hostel_emergency_contact_phone'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Phone</FormLabel>
                      <FormControl>
                        <Input
                          inputMode='numeric'
                          maxLength={10}
                          placeholder='10-digit mobile number'
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.value.replace(/\D/g, '').slice(0, 10))
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        10-digit Indian mobile number. Leave blank if not applicable.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Parent phone */}
              <div className='space-y-4 rounded-md border p-4'>
                <h3 className='text-sm font-medium'>Parent Contact</h3>

                <FormField
                  control={form.control}
                  name='hostel_parent_phone'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent / Guardian Phone</FormLabel>
                      <FormControl>
                        <Input
                          inputMode='numeric'
                          maxLength={10}
                          placeholder='10-digit mobile number'
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.value.replace(/\D/g, '').slice(0, 10))
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Used for leave consent and emergency notifications.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Medical notes */}
              <div className='space-y-4 rounded-md border p-4'>
                <h3 className='text-sm font-medium'>Medical Notes</h3>

                <FormField
                  control={form.control}
                  name='hostel_medical_notes'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical Conditions / Allergies</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={4}
                          placeholder='e.g. asthma, peanut allergy — leave blank if none'
                          className='resize-none'
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Visible to warden and mess in-charge for emergencies only.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='flex justify-end'>
                <Button
                  type='submit'
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Save Profile
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
