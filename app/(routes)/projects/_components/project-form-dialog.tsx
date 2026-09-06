'use client';

/**
 * Project Create / Edit Dialog (Feature F1)
 *
 * react-hook-form + zod. Creates via useCreateProject, edits via useUpdateProject.
 * Validation: title required; end_date must be >= start_date when both set.
 *
 * Pattern: app/(routes)/hr/workload/page.tsx (Dialog + form), with react-hook-form
 * + zodResolver for validation as the spec requires.
 * Spec: specs/pm-projects-module-2026-05-26.md (F1).
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useCreateProject,
  useUpdateProject,
  useProjectTypes,
  useProjectPriorities,
} from '@/hooks/projects/use-projects';
import { useInstitutions } from '@/hooks/hr/recruitment-need/use-data-entry';
import { useClients } from '@/hooks/solutions/use-clients';
import { useSolutions } from '@/hooks/solutions/use-solutions';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';
import type {
  Project,
  ProjectInsert,
  ProjectScopeModel,
  ProjectUpdate,
} from '@/types/projects';

const NONE = 'none';

const SCOPE_OPTIONS: { value: ProjectScopeModel; label: string }[] = [
  { value: 'single_institution', label: 'Single institution' },
  { value: 'cross_institution', label: 'Cross-institution' },
  { value: 'global', label: 'Global' },
];

const formSchema = z
  .object({
    title: z.string().trim().min(1, 'Project name is required').max(200),
    description: z.string().trim().max(5000).optional().or(z.literal('')),
    project_type_id: z.string().optional(),
    priority_id: z.string().optional(),
    scope_model: z.enum(['single_institution', 'cross_institution', 'global']),
    institution_id: z.string().optional(),
    client_id: z.string().optional(),
    solution_id: z.string().optional(),
    start_date: z.string().optional().or(z.literal('')),
    end_date: z.string().optional().or(z.literal('')),
  })
  .refine(
    (v) => {
      if (!v.start_date || !v.end_date) return true;
      return v.end_date >= v.start_date;
    },
    { message: 'End date must be on or after start date', path: ['end_date'] }
  );

type FormValues = z.infer<typeof formSchema>;

function defaultValues(project?: Project | null): FormValues {
  return {
    title: project?.title ?? '',
    description: project?.description ?? '',
    project_type_id: project?.project_type_id ?? NONE,
    priority_id: project?.priority_id ?? NONE,
    scope_model: (project?.scope_model as ProjectScopeModel) ?? 'single_institution',
    institution_id: project?.institution_id ?? NONE,
    client_id: project?.client_id ?? NONE,
    solution_id: project?.solution_id ?? NONE,
    start_date: project?.start_date ?? '',
    end_date: project?.due_date ?? '',
  };
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this project instead of creating one. */
  project?: Project | null;
  onSaved?: (project: Project) => void;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: ProjectFormDialogProps) {
  const isEdit = !!project;

  const { data: types = [] } = useProjectTypes();
  const { data: priorities = [] } = useProjectPriorities();
  const { data: institutions = [] } = useInstitutions();
  // Solutions Hub bridge — both optional; a failed fetch (no solutions-hub
  // permission) just leaves the pickers empty.
  const { data: clientsData } = useClients({ limit: 100 });
  const clients = clientsData?.data ?? [];

  const createMut = useCreateProject();
  const updateMut = useUpdateProject();
  const isPending = createMut.isPending || updateMut.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(project),
  });

  const watchedClientId = form.watch('client_id');
  const hasClient = !!watchedClientId && watchedClientId !== NONE;
  const { data: solutionsData } = useSolutions({
    client_id: hasClient ? watchedClientId : undefined,
    limit: 100,
  });
  // Defensive re-filter: the API ignores an undefined client_id and returns all.
  const clientSolutions = (solutionsData?.data ?? []).filter(
    (s) => hasClient && s.client_id === watchedClientId
  );

  // Reset form whenever the dialog opens or the target project changes.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues(project));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  async function onSubmit(values: FormValues) {
    const payload = {
      title: values.title.trim(),
      description: values.description?.trim() || null,
      project_type_id: values.project_type_id === NONE ? null : values.project_type_id ?? null,
      priority_id: values.priority_id === NONE ? null : values.priority_id ?? null,
      scope_model: values.scope_model,
      institution_id: values.institution_id === NONE ? null : values.institution_id ?? null,
      start_date: values.start_date || null,
      due_date: values.end_date || null,
      // Deploy-order safety: only send the bridge columns when they carry a
      // value or clear an existing link — so create/edit keeps working even if
      // this code reaches production before the bridge migration is applied.
      ...(values.client_id && values.client_id !== NONE
        ? { client_id: values.client_id }
        : project?.client_id
          ? { client_id: null }
          : {}),
      ...(values.solution_id && values.solution_id !== NONE
        ? { solution_id: values.solution_id }
        : project?.solution_id
          ? { solution_id: null }
          : {}),
    };

    try {
      const saved = isEdit
        ? await updateMut.mutateAsync({ id: project!.id, input: payload as ProjectUpdate })
        : await createMut.mutateAsync(payload as ProjectInsert);
      onSaved?.(saved);
      onOpenChange(false);
    } catch {
      // Mutation error surfaces via the hooks; keep dialog open for retry.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the project details below.'
              : 'Create a new project. You can add tasks, phases and members after it exists.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. NAAC re-accreditation 2027" className={TAP_TARGET} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="What is this project about?"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="project_type_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={TAP_TARGET}>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={TAP_TARGET}>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {priorities.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="scope_model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={TAP_TARGET}>
                          <SelectValue placeholder="Select scope" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SCOPE_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="institution_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={TAP_TARGET}>
                          <SelectValue placeholder="Select institution" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {institutions.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // A solution belongs to one client — changing the client
                        // invalidates the previous solution choice.
                        form.setValue('solution_id', NONE);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className={TAP_TARGET}>
                          <SelectValue placeholder="Internal (no client)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Internal (no client)</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="solution_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Solution</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!hasClient}
                    >
                      <FormControl>
                        <SelectTrigger className={TAP_TARGET}>
                          <SelectValue
                            placeholder={hasClient ? 'Select solution' : 'Pick a client first'}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {clientSolutions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" className={TAP_TARGET} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input type="date" className={TAP_TARGET} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className={TAP_TARGET}
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className={`gap-1.5 ${TAP_TARGET}`}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
