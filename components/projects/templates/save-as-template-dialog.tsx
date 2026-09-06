'use client';

/**
 * SaveAsTemplateDialog
 *
 * Self-contained dialog to snapshot an existing project as a template.
 * Includes its own project picker (searchable select over active projects)
 * and an optional project-type override.
 *
 * Entry points:
 *   (a) Called from the gallery with no pre-selected project — user picks one.
 *   (b) Orchestrator wires a "Save as template" button on the project detail
 *       page and passes projectId directly (pre-selected, picker hidden).
 *
 * Spec: F10 — save-as-template.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useProjects, useProjectTypes } from '@/hooks/projects/use-projects';
import { useSaveProjectAsTemplate } from '@/hooks/projects/use-templates';

interface SaveAsTemplateDialogProps {
  /** If provided, the project is pre-selected and the picker is hidden. */
  projectId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SaveAsTemplateDialog({
  projectId: preselectedProjectId,
  open,
  onOpenChange,
}: SaveAsTemplateDialogProps) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    preselectedProjectId ?? ''
  );
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: projectTypes, isLoading: typesLoading } = useProjectTypes();
  const saveAsTemplate = useSaveProjectAsTemplate();

  const effectiveProjectId = preselectedProjectId ?? selectedProjectId;

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset form on close.
      setName('');
      setDescription('');
      if (!preselectedProjectId) setSelectedProjectId('');
      setSelectedTypeId('');
    }
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveProjectId) return;

    saveAsTemplate.mutate(
      {
        projectId: effectiveProjectId,
        name: name.trim(),
        description: description.trim() || null,
        projectTypeId: selectedTypeId || null,
      },
      {
        onSuccess: (template) => {
          toast.success(`Template "${template.name}" saved.`);
          handleOpenChange(false);
          // Navigate to templates gallery so user sees the new card.
          router.push('/projects/templates');
        },
        onError: (err) => {
          toast.error(
            `Failed to save template: ${err instanceof Error ? err.message : 'unknown error'}`
          );
        },
      }
    );
  }

  const canSubmit =
    name.trim().length > 0 &&
    !!effectiveProjectId &&
    !saveAsTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Snapshot this project&rsquo;s task structure into a reusable template.
            Owners, dates, and assignments are not copied.
          </DialogDescription>
        </DialogHeader>

        <form id="save-template-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Project picker — hidden when pre-selected */}
          {!preselectedProjectId && (
            <div className="space-y-1.5">
              <Label htmlFor="sat-project">Source project</Label>
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                disabled={projectsLoading}
              >
                <SelectTrigger id="sat-project">
                  <SelectValue
                    placeholder={
                      projectsLoading ? 'Loading projects…' : 'Pick a project'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Template name */}
          <div className="space-y-1.5">
            <Label htmlFor="sat-name">
              Template name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Research Project"
              maxLength={120}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="sat-desc">Description</Label>
            <Textarea
              id="sat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When to use this template…"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Project type override */}
          <div className="space-y-1.5">
            <Label htmlFor="sat-type">Project type (optional override)</Label>
            <Select
              value={selectedTypeId}
              onValueChange={setSelectedTypeId}
              disabled={typesLoading}
            >
              <SelectTrigger id="sat-type">
                <SelectValue
                  placeholder={typesLoading ? 'Loading…' : 'Same as source project'}
                />
              </SelectTrigger>
              <SelectContent>
                {(projectTypes ?? []).map((pt) => (
                  <SelectItem key={pt.id} value={pt.id}>
                    {pt.icon ? `${pt.icon} ` : ''}
                    {pt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saveAsTemplate.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="save-template-form"
            disabled={!canSubmit}
          >
            {saveAsTemplate.isPending ? 'Saving…' : 'Save template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
