'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useCreateMentor, usePartnerOptions } from '@/hooks/industry';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X } from 'lucide-react';

const mentorSchema = z.object({
  partner_id: z.string().min(1, 'Partner is required'),
  mentor_name: z.string().min(1, 'Name is required'),
  designation: z.string().optional(),
  expertise_areas: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  linkedin_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  bio: z.string().optional(),
  max_mentees: z.coerce.number().min(1).default(5)
});

type MentorFormValues = z.infer<typeof mentorSchema>;

export default function NewMentorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const { data: partners } = usePartnerOptions(institutionId);
  const createMutation = useCreateMentor();

  const form = useForm<MentorFormValues>({
    resolver: zodResolver(mentorSchema),
    defaultValues: {
      partner_id: searchParams.get('partner_id') || '',
      mentor_name: '',
      designation: '',
      expertise_areas: '',
      email: '',
      phone: '',
      linkedin_url: '',
      bio: '',
      max_mentees: 5
    }
  });

  const onSubmit = async (values: MentorFormValues) => {
    try {
      await createMutation.mutateAsync({
        institution_id: institutionId,
        partner_id: values.partner_id,
        mentor_name: values.mentor_name,
        designation: values.designation,
        expertise_areas: values.expertise_areas ? values.expertise_areas.split(',').map(s => s.trim()) : [],
        email: values.email || '',
        phone: values.phone,
        linkedin_url: values.linkedin_url || undefined,
        bio: values.bio,
        max_mentees: values.max_mentees
      });
      toast({ title: 'Mentor created successfully' });
      router.push('/industry/mentors');
    } catch {
      toast({ title: 'Failed to create mentor', variant: 'destructive' });
    }
  };

  return (
    <PermissionGuard module="industry.mentors" action="create">
      <ContentLayout title="Add Mentor">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/mentors">Mentors</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Mentor Information</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="partner_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry Partner *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {partners?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="mentor_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="designation" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Designation</FormLabel>
                        <FormControl><Input placeholder="Senior Engineer" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="expertise_areas" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expertise Areas</FormLabel>
                      <FormControl><Input placeholder="Python, Machine Learning, Data Science (comma-separated)" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" placeholder="john@company.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input placeholder="+91 XXXXX XXXXX" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="linkedin_url" render={({ field }) => (
                    <FormItem>
                      <FormLabel>LinkedIn Profile</FormLabel>
                      <FormControl><Input placeholder="https://linkedin.com/in/johndoe" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="bio" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl><Textarea placeholder="Brief bio..." className="min-h-[100px]" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="max_mentees" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Mentees</FormLabel>
                      <FormControl><Input type="number" min={1} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()}><X className="h-4 w-4 mr-2" />Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Create Mentor
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
