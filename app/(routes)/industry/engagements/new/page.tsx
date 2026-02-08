'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useCreateEngagement, useProjectOptions, useMentorOptions, usePartnerOptions } from '@/hooks/industry';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X } from 'lucide-react';

const engagementSchema = z.object({
  learner_id: z.string().min(1, 'Learner ID is required'),
  engagement_type: z.enum(['project', 'internship', 'mentorship', 'workshop', 'site_visit', 'guest_lecture', 'hackathon']),
  project_id: z.string().optional(),
  mentor_id: z.string().optional(),
  partner_id: z.string().optional(),
  start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  notes: z.string().optional()
});

type EngagementFormValues = z.infer<typeof engagementSchema>;

export default function NewEngagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const { data: projectOptions } = useProjectOptions();
  const { data: partners } = usePartnerOptions(institutionId);
  const createMutation = useCreateEngagement();

  const form = useForm<EngagementFormValues>({
    resolver: zodResolver(engagementSchema),
    defaultValues: {
      learner_id: searchParams.get('learner_id') || '',
      engagement_type: 'project',
      project_id: searchParams.get('project_id') || '',
      mentor_id: '',
      partner_id: '',
      start_date: '',
      expected_end_date: '',
      notes: ''
    }
  });

  const engagementType = form.watch('engagement_type');
  const partnerId = form.watch('partner_id');
  const projectId = form.watch('project_id');

  // Get mentor options based on partner (from project or direct selection)
  // Note: projectOptions doesn't have partner_id, so use partnerId directly or fetch project details
  const effectivePartnerId = partnerId;
  const { data: mentors } = useMentorOptions(effectivePartnerId);

  const onSubmit = async (values: EngagementFormValues) => {
    try {
      if (!institutionId) {
        toast({ title: 'No institution selected', variant: 'destructive' });
        return;
      }
      await createMutation.mutateAsync({
        learner_id: values.learner_id,
        institution_id: institutionId,  // Required field
        engagement_type: values.engagement_type,
        project_id: values.project_id || undefined,
        mentor_id: values.mentor_id || undefined,
        partner_id: values.partner_id || undefined,
        start_date: values.start_date || undefined,
        expected_end_date: values.expected_end_date || undefined,
        notes: values.notes || undefined
      });
      toast({ title: 'Engagement created successfully' });
      router.push('/industry/engagements');
    } catch {
      toast({ title: 'Failed to create engagement', variant: 'destructive' });
    }
  };

  return (
    <PermissionGuard module="industry.engagements" action="create">
      <ContentLayout title="New Engagement">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/engagements">Engagements</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Engagement Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="learner_id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Learner ID *</FormLabel>
                        <FormControl><Input placeholder="Enter learner UUID" {...field} /></FormControl>
                        <FormDescription>UUID of the learner</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="engagement_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engagement Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="project">Project</SelectItem>
                            <SelectItem value="internship">Internship</SelectItem>
                            <SelectItem value="mentorship">Mentorship</SelectItem>
                            <SelectItem value="workshop">Workshop</SelectItem>
                            <SelectItem value="site_visit">Site Visit</SelectItem>
                            <SelectItem value="guest_lecture">Guest Lecture</SelectItem>
                            <SelectItem value="hackathon">Hackathon</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {(engagementType === 'project' || engagementType === 'internship') && (
                    <FormField control={form.control} name="project_id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="">No project</SelectItem>
                            {projectOptions?.filter(p => p.status === 'open').map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.project_title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Only open projects are shown</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  {!projectId && (
                    <FormField control={form.control} name="partner_id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry Partner</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="">No partner</SelectItem>
                            {partners?.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}

                  <FormField control={form.control} name="mentor_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assigned Mentor</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select mentor" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">No mentor</SelectItem>
                          {mentors?.map((m) => <SelectItem key={m.id} value={m.id}>{m.mentor_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="start_date" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="expected_end_date" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected End Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl><Textarea placeholder="Additional notes..." className="min-h-[100px]" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()}><X className="h-4 w-4 mr-2" />Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Create Engagement
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
