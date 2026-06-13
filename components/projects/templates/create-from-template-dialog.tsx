'use client';

/**
 * CreateFromTemplateDialog
 *
 * Takes a template and collects a minimal project title + optional description
 * to create a new project seeded from the template's blueprint tasks.
 *
 * After successful creation, navigates to the new project's detail page
 * (/projects/[id]) so the user immediately sees their seeded tasks.
 *
 * Spec: F10 — create-from-template.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateProjectFromTemplate } from '@/hooks/projects/use-templates';
import type { ProjectTemplateWithType } from '@/lib/services/projects/template-service';
import type { TemplateBlueprint } from '@/lib/services/projects/template-service';

interface CreateFromTemplateDialogProps {
  template: ProjectTemplateWithType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateFromTemplateDialog({
  template,
  open,
  onOpenChange,
}: CreateFromTemplateDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const createFromTemplate = useCreateProjectFromTemplate();

  const bp = template.blueprint as unknown as TemplateBlueprint | null;
  const taskCount = bp?.task_count ?? (bp?.tasks?.length ?? 0);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setTitle('');
      setDescription('');
    }
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    createFromTemplate.mutate(
      {
        templateId: template.id,
        projectInput: {
          title: title.trim(),
          description: description.trim() || null,
          project_type_id: template.project_type_id ?? null,
        },
      },
      {
        onSuccess: ({ projectId, tasksCreated }) => {
          toast.success(
            `Project created with ${tasksCreated} task${tasksCreated !== 1 ? 's' : ''}.`
          );
          handleOpenChange(false);
          router.push(`/projects/${projectId}`);
        },
        onError: (err) => {
          toast.error(
            `Failed to create project: ${err instanceof Error ? err.message : 'unknown error'}`
          );
        },
      }
    );
  }

  const canSubmit = title.trim().length > 0 && !createFromTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create project from template</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <span>
                Using <strong>{template.name}</strong>
                {template.project_type && (
                  <> &mdash; {template.project_type.name}</>
                )}
                .
              </span>
              {taskCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>
                    {taskCount} task{taskCount !== 1 ? 's' : ''} will be seeded (status
                    reset to &ldquo;todo&rdquo;).
                  </span>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Template type badge */}
        {template.project_type && (
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-xs"
              style={
                template.project_type.color
                  ? {
                      backgroundColor: `${template.project_type.color}20`,
                      color: template.project_type.color,
                      borderColor: `${template.project_type.color}40`,
                    }
                  : undefined
              }
            >
              {template.project_type.icon && (
                <span className="mr-1">{template.project_type.icon}</span>
              )}
              {template.project_type.name}
            </Badge>
          </div>
        )}

        <form id="create-from-template-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Project title */}
          <div className="space-y-1.5">
            <Label htmlFor="cft-title">
              Project title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cft-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for the new project"
              maxLength={200}
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cft-desc">Description</Label>
            <Textarea
              id="cft-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              maxLength={1000}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={createFromTemplate.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-from-template-form"
            disabled={!canSubmit}
          >
            {createFromTemplate.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
