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
import { Switch } from '@/components/ui/switch';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useCreateProject, usePartnerOptions, useMentorOptions } from '@/hooks/industry';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X } from 'lucide-react';

const projectSchema = z.object({
  partner_id: z.string().min(1, 'Partner is required'),
  project_title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  duration_weeks: z.coerce.number().min(1).optional(),
  max_team_size: z.coerce.number().min(1).optional(),
  min_team_size: z.coerce.number().min(1).optional(),
  stipend_amount: z.coerce.number().min(0).optional(),
  application_deadline: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  technologies: z.string().optional(),
  deliverables: z.string().optional(),
  mentor_id: z.string().optional()
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const { data: partners } = usePartnerOptions(institutionId);
  const createMutation = useCreateProject();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      partner_id: searchParams.get('partner_id') || '',
      project_title: '',
      description: '',
      difficulty_level: undefined,
      duration_weeks: undefined,
      max_team_size: 4,
      min_team_size: 1,
      stipend_amount: undefined,
      application_deadline: '',
      start_date: '',
      end_date: '',
      technologies: '',
      deliverables: '',
      mentor_id: ''
    }
  });

  const partnerId = form.watch('partner_id');
  const { data: mentors } = useMentorOptions(partnerId);

  const onSubmit = async (values: ProjectFormValues) => {
    try {
      await createMutation.mutateAsync({
        institution_id: institutionId,
        partner_id: values.partner_id,
        project_title: values.project_title,
        description: values.description,
        difficulty_level: values.difficulty_level,
        duration_weeks: values.duration_weeks,
        max_team_size: values.max_team_size,
        min_team_size: values.min_team_size,
        stipend_amount: values.stipend_amount,
        application_deadline: values.application_deadline || undefined,
        start_date: values.start_date || undefined,
        end_date: values.end_date || undefined,
        technologies: values.technologies ? values.technologies.split(',').map(s => s.trim()) : undefined,
        deliverables: values.deliverables ? values.deliverables.split(',').map(s => s.trim()) : [],
        mentor_id: values.mentor_id || undefined
      });
      toast({ title: 'Project created successfully' });
      router.push('/industry/projects');
    } catch {
      toast({ title: 'Failed to create project', variant: 'destructive' });
    }
  };

  return (
    <PermissionGuard module="industry.projects" action="create">
      <ContentLayout title="Add Project">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/projects">Projects</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="partner_id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry Partner *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger></FormControl>
                          <SelectContent>{partners?.map((p) => <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
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
                  </div>
                  <FormField control={form.control} name="project_title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Title *</FormLabel>
                      <FormControl><Input placeholder="E-commerce Platform Development" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea placeholder="Project description..." className="min-h-[100px]" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="difficulty_level" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Difficulty</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                            <SelectItem value="expert">Expert</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="duration_weeks" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (weeks)</FormLabel>
                        <FormControl><Input type="number" min={1} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="stipend_amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stipend (INR)</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="min_team_size" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min Team Size</FormLabel>
                        <FormControl><Input type="number" min={1} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="max_team_size" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Team Size</FormLabel>
                        <FormControl><Input type="number" min={1} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="detailed_requirements" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requirements / Technologies</FormLabel>
                      <FormControl><Textarea placeholder="Technologies, tools, and requirements..." className="min-h-[80px]" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="deliverables" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deliverables (comma-separated)</FormLabel>
                      <FormControl><Input placeholder="Web App, API Documentation, Deployment" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField control={form.control} name="application_deadline" render={({ field }) => (
                      <FormItem><FormLabel>Application Deadline</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="project_start_date" render={({ field }) => (
                      <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="project_end_date" render={({ field }) => (
                      <FormItem><FormLabel>End Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()}><X className="h-4 w-4 mr-2" />Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Create Project
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
