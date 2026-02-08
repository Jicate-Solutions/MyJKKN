'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryEngagement, useUpdateEngagement, useMentorOptions } from '@/hooks/industry';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X, Briefcase } from 'lucide-react';
import type { EngagementStatus, EngagementType } from '@/types/industry';

const engagementSchema = z.object({
  engagement_type: z.enum(['project', 'internship', 'mentorship', 'workshop', 'site_visit', 'guest_lecture', 'hackathon'] as const),
  mentor_id: z.string().optional(),
  status: z.enum(['applied', 'approved', 'active', 'completed', 'withdrawn', 'terminated'] as const),
  start_date: z.string().optional(),
  expected_end_date: z.string().optional(),
  end_date: z.string().optional(),
  hours_completed: z.coerce.number().min(0).default(0),
  certificate_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional()
});

type EngagementFormValues = z.infer<typeof engagementSchema>;

export default function EditEngagementPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const { data: engagement, isLoading } = useIndustryEngagement(id);
  const updateMutation = useUpdateEngagement(id);

  const project = engagement?.project as any;
  const partner = engagement?.partner as any;
  const effectivePartnerId = project?.partner_id || partner?.id;
  const { data: mentors } = useMentorOptions(effectivePartnerId);

  const form = useForm<EngagementFormValues>({
    resolver: zodResolver(engagementSchema),
    defaultValues: {
      engagement_type: 'project',
      mentor_id: '',
      status: 'applied',
      start_date: '',
      expected_end_date: '',
      end_date: '',
      hours_completed: 0,
      certificate_url: '',
      notes: ''
    }
  });

  useEffect(() => {
    if (engagement) {
      // Map legacy statuses to new values (database might have old values)
      const statusStr = engagement.status as string;
      const mappedStatus = statusStr === 'pending' ? 'applied' : statusStr;
      // Map legacy engagement types to new values
      const typeStr = engagement.engagement_type as string;
      const mappedType = typeStr === 'placement' ? 'internship' : typeStr;
      form.reset({
        engagement_type: mappedType as 'project' | 'internship' | 'mentorship' | 'workshop' | 'site_visit' | 'guest_lecture' | 'hackathon',
        mentor_id: engagement.mentor_id || '',
        status: mappedStatus as EngagementFormValues['status'],
        start_date: engagement.start_date || '',
        expected_end_date: engagement.expected_end_date || '',
        end_date: engagement.end_date || '',
        hours_completed: engagement.hours_completed || 0,
        certificate_url: engagement.certificate_url || '',
        notes: engagement.notes || ''
      });
    }
  }, [engagement, form]);

  const onSubmit = async (values: EngagementFormValues) => {
    try {
      await updateMutation.mutateAsync({
        engagement_type: values.engagement_type,
        start_date: values.start_date || undefined,
        expected_end_date: values.expected_end_date || undefined,
        end_date: values.end_date || undefined,
        status: values.status,
        hours_completed: values.hours_completed,
        certificate_url: values.certificate_url || undefined,
        notes: values.notes
      });
      toast({ title: 'Engagement updated successfully' });
      router.push(`/industry/engagements/${id}`);
    } catch {
      toast({ title: 'Failed to update engagement', variant: 'destructive' });
    }
  };

  if (isLoading) return <ContentLayout title="Loading..."><Skeleton className="h-64 w-full" /></ContentLayout>;

  if (!engagement) {
    return (
      <ContentLayout title="Not Found">
        <div className="text-center py-12">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Engagement not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/engagements')}>Back to Engagements</Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module="industry.engagements" action="edit">
      <ContentLayout title="Edit Engagement">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/engagements">Engagements</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href={`/industry/engagements/${id}`}>Details</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Edit</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Engagement Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {project && (
                    <div className="p-4 rounded-lg bg-muted/50 mb-4">
                      <p className="text-sm text-muted-foreground">Project</p>
                      <p className="font-medium">{project.project_title}</p>
                    </div>
                  )}
                  {partner && !project && (
                    <div className="p-4 rounded-lg bg-muted/50 mb-4">
                      <p className="text-sm text-muted-foreground">Industry Partner</p>
                      <p className="font-medium">{partner.company_name}</p>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="engagement_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engagement Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
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
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="applied">Applied</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="withdrawn">Withdrawn</SelectItem>
                            <SelectItem value="terminated">Terminated</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="hours_completed" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hours Completed</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="start_date" render={({ field }) => (
                      <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="expected_end_date" render={({ field }) => (
                      <FormItem><FormLabel>Expected End</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="actual_end_date" render={({ field }) => (
                      <FormItem><FormLabel>Actual End</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="certificate_url" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Certificate URL</FormLabel>
                      <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="status_notes" render={({ field }) => (
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
