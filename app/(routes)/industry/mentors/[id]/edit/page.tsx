'use client';

import { useParams, useRouter } from 'next/navigation';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryMentor, useUpdateMentor } from '@/hooks/industry';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { Loader2, Save, X, Users } from 'lucide-react';

const mentorSchema = z.object({
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

export default function EditMentorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const { data: mentor, isLoading } = useIndustryMentor(id);
  const updateMutation = useUpdateMentor(id);

  const form = useForm<MentorFormValues>({
    resolver: zodResolver(mentorSchema),
    defaultValues: {
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

  useEffect(() => {
    if (mentor) {
      form.reset({
        mentor_name: mentor.mentor_name,
        designation: mentor.designation || '',
        expertise_areas: mentor.expertise_areas?.join(', ') || '',
        email: mentor.email || '',
        phone: mentor.phone || '',
        linkedin_url: mentor.linkedin_url || '',
        bio: mentor.bio || '',
        max_mentees: mentor.max_mentees
      });
    }
  }, [mentor, form]);

  const onSubmit = async (values: MentorFormValues) => {
    try {
      await updateMutation.mutateAsync({
        mentor_name: values.mentor_name,
        designation: values.designation,
        expertise_areas: values.expertise_areas ? values.expertise_areas.split(',').map(s => s.trim()) : [],
        email: values.email || undefined,
        phone: values.phone,
        linkedin_url: values.linkedin_url || undefined,
        bio: values.bio,
        max_mentees: values.max_mentees
      });
      toast({ title: 'Mentor updated successfully' });
      router.push(`/industry/mentors/${id}`);
    } catch {
      toast({ title: 'Failed to update mentor', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <ContentLayout title="Loading..."><Skeleton className="h-64 w-full" /></ContentLayout>;
  }

  if (!mentor) {
    return (
      <ContentLayout title="Not Found">
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Mentor not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/mentors')}>Back to Mentors</Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module="industry.mentors" action="edit">
      <ContentLayout title={`Edit ${mentor.mentor_name}`}>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/mentors">Mentors</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href={`/industry/mentors/${id}`}>{mentor.mentor_name}</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Edit</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Mentor Information</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="mentor_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="designation" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Designation</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="expertise_areas" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expertise Areas (comma-separated)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="linkedin_url" render={({ field }) => (
                    <FormItem>
                      <FormLabel>LinkedIn Profile</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="bio" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl>
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
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
