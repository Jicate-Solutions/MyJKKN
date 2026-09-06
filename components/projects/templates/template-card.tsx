'use client';

/**
 * TemplateCard
 *
 * Single card in the template gallery. Shows name, description, project type
 * badge, task count (from blueprint.task_count), and two CTAs:
 *   - "Use template" → opens CreateFromTemplateDialog
 *   - "Delete" → confirms + deletes via useDeleteTemplate
 *
 * Spec: F10.
 */

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckSquare, Layers, Trash2, WandSparkles } from 'lucide-react';
import { useDeleteTemplate } from '@/hooks/projects/use-templates';
import type { ProjectTemplateWithType } from '@/lib/services/projects/template-service';
import type { TemplateBlueprint } from '@/lib/services/projects/template-service';
import { CreateFromTemplateDialog } from './create-from-template-dialog';

interface TemplateCardProps {
  template: ProjectTemplateWithType;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const deleteTemplate = useDeleteTemplate();

  const bp = template.blueprint as unknown as TemplateBlueprint | null;
  const taskCount = bp?.task_count ?? (bp?.tasks?.length ?? 0);

  function handleDelete() {
    deleteTemplate.mutate(template.id, {
      onSuccess: () => setShowDelete(false),
    });
  }

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{template.name}</CardTitle>
            {template.project_type && (
              <Badge
                variant="secondary"
                className="shrink-0 text-xs"
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
            )}
          </div>
          {template.description && (
            <CardDescription className="line-clamp-2 text-sm">
              {template.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="grow pb-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckSquare className="h-3.5 w-3.5" />
            <span>
              {taskCount === 0
                ? 'No tasks'
                : taskCount === 1
                ? '1 task'
                : `${taskCount} tasks`}
            </span>
            {template.source_project_id && (
              <>
                <span className="mx-1 text-muted-foreground/40">·</span>
                <Layers className="h-3.5 w-3.5" />
                <span>Saved from project</span>
              </>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex gap-2 pt-2">
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setShowCreate(true)}
          >
            <WandSparkles className="h-3.5 w-3.5" />
            Use template
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </CardFooter>
      </Card>

      {/* Create-from-template dialog */}
      <CreateFromTemplateDialog
        template={template}
        open={showCreate}
        onOpenChange={setShowCreate}
      />

      {/* Delete confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{template.name}&rdquo; will be permanently deleted. Projects already
              created from this template are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteTemplate.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
