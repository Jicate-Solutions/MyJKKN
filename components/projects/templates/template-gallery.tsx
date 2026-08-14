'use client';

/**
 * TemplateGallery
 *
 * Renders the full template gallery: search input, type filter, a responsive
 * card grid (TemplateCard per row), and an empty/error state. The "Save as
 * template" CTA in the header opens SaveAsTemplateDialog.
 *
 * Spec: F10 — template gallery at /projects/templates.
 */

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, BookTemplate, Plus } from 'lucide-react';
import { useTemplates } from '@/hooks/projects/use-templates';
import { useProjectTypes } from '@/hooks/projects/use-projects';
import { TemplateCard } from './template-card';
import { SaveAsTemplateDialog } from './save-as-template-dialog';

const ALL_TYPES = '__all__';

export function TemplateGallery() {
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState<string>(ALL_TYPES);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const { data: templates, isLoading, isError, error } = useTemplates({
    projectTypeId: typeId === ALL_TYPES ? null : typeId,
    search: search.trim() || null,
  });

  const { data: projectTypes } = useProjectTypes();

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className={`pl-8 ${TAP_TARGET}`}
          />
        </div>

        {/* Type filter */}
        <Select
          value={typeId}
          onValueChange={setTypeId}
        >
          <SelectTrigger className={`w-[180px] ${TAP_TARGET}`}>
            <SelectValue placeholder="All project types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All project types</SelectItem>
            {(projectTypes ?? []).map((pt) => (
              <SelectItem key={pt.id} value={pt.id}>
                {pt.icon ? `${pt.icon} ` : ''}
                {pt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Save-as-template CTA */}
        <Button
          variant="outline"
          className={`gap-1.5 ${TAP_TARGET}`}
          onClick={() => setShowSaveDialog(true)}
        >
          <Plus className="h-4 w-4" />
          Save as template
        </Button>
      </div>

      {/* Body */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading templates…
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load templates:{' '}
              {(error as Error)?.message ?? 'unknown error'}
            </AlertDescription>
          </Alert>
        ) : !templates || templates.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-sm text-muted-foreground">
            <BookTemplate className="h-10 w-10 opacity-30" />
            <p className="font-medium">
              {search.trim() || typeId !== ALL_TYPES
                ? 'No templates match your filters.'
                : 'No templates yet.'}
            </p>
            {!(search.trim() || typeId !== ALL_TYPES) && (
              <p className="text-xs max-w-xs">
                Save an existing project as a template to reuse its task
                structure in future projects.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tmpl) => (
              <TemplateCard key={tmpl.id} template={tmpl} />
            ))}
          </div>
        )}
      </div>

      {/* Save-as-template dialog (gallery entry point — no pre-selected project) */}
      <SaveAsTemplateDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
      />
    </>
  );
}
