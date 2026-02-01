'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryProject, useUpdateProject, useMentorOptions } from '@/hooks/industry';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X, Target } from 'lucide-react';

const projectSchema = z.object({
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
  location: z.string().optional(),
  is_remote: z.boolean().default(false),
  mentor_id: z.string().optional(),
  status: z.enum(['draft', 'open', 'assigned', 'in_progress', 'completed', 'cancelled'])
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export default function EditProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const { data: project, isLoading } = useIndustryProject(id);
  const updateMutation = useUpdateProject(id);
  const { data: mentors } = useMentorOptions(project?.partner_id);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { project_title: '', description: '', is_remote: false, status: 'draft' }
  });

  useEffect(() => {
    if (project) {
      form.reset({
        project_title: project.project_title,
        description: project.description || '',
        difficulty_level: project.difficulty_level || undefined,
        duration_weeks: project.duration_weeks || undefined,
        max_team_size: project.max_team_size || undefined,
        min_team_size: project.min_team_size || undefined,
        stipend_amount: project.stipend_amount || undefined,
        application_deadline: project.application_deadline || '',
        start_date: project.start_date || '',
        end_date: project.end_date || '',
        technologies: project.technologies?.join(', ') || '',
        deliverables: project.deliverables?.join(', ') || '',
        location: project.location || '',
        is_remote: project.is_remote,
        mentor_id: project.mentor_id || '',
        status: project.status
      });
    }
  }, [project, form]);

  const onSubmit = async (values: ProjectFormValues) => {
    try {
      await updateMutation.mutateAsync({
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
        technologies: values.technologies ? values.technologies.split(',').map(s => s.trim()) : [],
        deliverables: values.deliverables ? values.deliverables.split(',').map(s => s.trim()) : [],
        location: values.location,
        is_remote: values.is_remote,
        mentor_id: values.mentor_id || undefined,
        status: values.status
      });
      toast({ title: 'Project updated successfully' });
      router.push(`/industry/projects/${id}`);
    } catch {
      toast({ title: 'Failed to update project', variant: 'destructive' });
    }
  };

  if (isLoading) return <ContentLayout title="Loading..."><Skeleton className="h-64 w-full" /></ContentLayout>;

  if (!project) {
    return (
      <ContentLayout title="Not Found">
        <div className="text-center py-12">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Project not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/projects')}>Back to Projects</Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module="industry.projects" action="edit">
      <ContentLayout title={`Edit ${project.project_title}`}>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/projects">Projects</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href={`/industry/projects/${id}`}>{project.project_title}</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Edit</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="project_title" render={({ field }) => (
                      <FormItem><FormLabel>Title *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="assigned">Assigned</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea className="min-h-[100px]" {...field} /></FormControl><FormMessage /></FormItem>
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
                      <FormItem><FormLabel>Duration (weeks)</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="stipend_amount" render={({ field }) => (
                      <FormItem><FormLabel>Stipend (INR)</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
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
                  <FormField control={form.control} name="technologies" render={({ field }) => (
                    <FormItem><FormLabel>Technologies</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="is_remote" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div><FormLabel>Remote Work</FormLabel><FormDescription>Allow remote participation</FormDescription></div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
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
