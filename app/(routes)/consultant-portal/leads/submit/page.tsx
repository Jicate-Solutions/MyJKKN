// app/(routes)/consultant-portal/leads/submit/page.tsx
// Lead submission form for consultants

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormDescription,
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
import { useAuth } from '@/hooks/use-auth';
import { useSubmitLeadFromPortal } from '@/hooks/admission/use-consultants';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { EducationConsultant } from '@/types/education-consultants';
import { toast } from 'sonner';
import {
  UserPlus,
  Phone,
  Mail,
  MapPin,
  BookOpen,
  FileText,
  ChevronLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

// Validation schema
const leadSubmissionSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long'),
  phone: z
    .string()
    .min(10, 'Phone must be at least 10 digits')
    .max(15, 'Phone is too long')
    .regex(/^[0-9+\-\s()]+$/, 'Invalid phone number format'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  alternate_phone: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  program_interest: z.string().optional(),
  preferred_batch: z.string().optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
});

type LeadFormData = z.infer<typeof leadSubmissionSchema>;

const indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Puducherry', 'Jammu and Kashmir', 'Ladakh',
];

export default function SubmitLeadPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [consultant, setConsultant] = useState<EducationConsultant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedLeadName, setSubmittedLeadName] = useState('');

  const submitLead = useSubmitLeadFromPortal();

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadSubmissionSchema),
    defaultValues: {
      full_name: '',
      phone: '',
      email: '',
      alternate_phone: '',
      city: '',
      state: '',
      program_interest: '',
      preferred_batch: '',
      notes: '',
    },
  });

  // Load consultant data
  useEffect(() => {
    async function loadConsultant() {
      if (!profile?.id || !profile?.institution_id) {
        setIsLoading(false);
        return;
      }

      try {
        const consultants = await ConsultantService.getConsultants({
          institution_id: profile.institution_id,
          limit: 100,
        });

        const myConsultant = consultants.data.find(
          (c) => c.referrer_user_id === profile.id
        );

        setConsultant(myConsultant || null);
      } catch (err) {
        console.error('Failed to load consultant:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadConsultant();
  }, [profile]);

  const onSubmit = async (data: LeadFormData) => {
    if (!consultant || !profile?.institution_id) {
      toast.error('Missing consultant information');
      return;
    }

    try {
      await submitLead.mutateAsync({
        institution_id: profile.institution_id,
        consultant_id: consultant.id,
        full_name: data.full_name,
        phone: data.phone,
        email: data.email || null,
        alternate_phone: data.alternate_phone || null,
        city: data.city || null,
        state: data.state || null,
        program_interest: data.program_interest || null,
        preferred_batch: data.preferred_batch || null,
        notes: data.notes || null,
        referral_code: consultant.code || undefined,
      });

      setSubmittedLeadName(data.full_name);
      setIsSubmitted(true);
      toast.success('Lead submitted successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit lead';
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Unable to load consultant profile</p>
      </div>
    );
  }

  // Success state
  if (isSubmitted) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="p-4 rounded-full bg-green-100 w-fit mx-auto">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold">Lead Submitted Successfully!</h2>
              <p className="text-muted-foreground">
                {submittedLeadName} has been added to the admission pipeline.
                You&apos;ll earn commission when they enroll.
              </p>
              <div className="flex gap-3 justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmitted(false);
                    form.reset();
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Submit Another Lead
                </Button>
                <Button onClick={() => router.push('/consultant-portal/leads')}>
                  View My Leads
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Submit New Lead
          </CardTitle>
          <CardDescription>
            Refer a prospective student and earn commission when they enroll.
            All fields marked with * are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Basic Information
                </h3>

                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="9876543210"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="email@example.com"
                              type="email"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="alternate_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alternate Phone</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Parent/Guardian number (optional)"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Parent or guardian contact number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Location */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Location
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="City"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {indianStates.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Academic Interest */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Academic Interest
                </h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="program_interest"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Program Interest</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="e.g., B.Tech CSE, MBA"
                              className="pl-10"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="preferred_batch"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preferred Batch</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 2025-26"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Notes</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Textarea
                          placeholder="Any additional information about the lead..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Include any relevant details about the lead&apos;s background or preferences
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Info box */}
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Your Referral Code:</strong> {consultant.code || 'Not assigned'}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  This code will be automatically attached to the lead for tracking.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitLead.isPending}
                  className="flex-1"
                >
                  {submitLead.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Submit Lead
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
