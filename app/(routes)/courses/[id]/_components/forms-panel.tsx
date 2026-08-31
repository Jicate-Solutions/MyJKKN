'use client';

// Course Events — the Forms tab body (Phase 3 Task 5).
//
// A plain list from useCourseForms, not a DataTable — same reasoning as the
// Packages and Sessions tabs.
//
// The single most useful thing on this screen is the PUBLIC LINK, because the
// entire point of a form is that a stranger can reach it. It is shown in full
// with a copy button, and it is visibly disabled when the form is not accepting
// applications — a live-looking link that 404s is worse than no link.

import { useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/lib/utils';
import {
  findIdentityGaps,
  identityGapMessage,
} from '@/lib/services/courses/applicant-identity';
import {
  useCourseForms,
  useDeleteCourseForm,
  useSaveCourseForm,
  useSetCourseFormEnabled,
} from '@/hooks/courses/use-course-forms';
import type { CourseForm, SaveCourseFormDto } from '@/types/courses';
import { FormBuilder } from './form-builder';

interface FormsPanelProps {
  courseEventId: string;
  /** The COURSE slug — the public URL is /course/<course-slug>?form=<form-slug>. */
  courseSlug: string;
  /** Applications are only reachable once the course itself is published. */
  coursePublished: boolean;
}

export function FormsPanel({ courseEventId, courseSlug, coursePublished }: FormsPanelProps) {
  const { canAccess } = usePermissions();
  const canManage = canAccess('courses', 'forms.manage');

  const { data: forms, isLoading, isError, error } = useCourseForms(courseEventId);
  const saveForm = useSaveCourseForm();
  const setEnabled = useSetCourseFormEnabled();
  const deleteForm = useDeleteCourseForm();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<CourseForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CourseForm | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const publicUrl = (formSlug: string) =>
    // origin is read at click time, not render time, so this stays correct on
    // localhost, on a preview deployment and in production without config.
    `${typeof window === 'undefined' ? '' : window.location.origin}/course/${courseSlug}?form=${formSlug}`;

  const copy = async (formSlug: string) => {
    try {
      await navigator.clipboard.writeText(publicUrl(formSlug));
      setCopied(formSlug);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions). The link is
      // visible on screen, so failing silently here is not a dead end.
    }
  };

  const openCreate = () => {
    setEditing(null);
    setBuilderOpen(true);
  };

  const openEdit = (f: CourseForm) => {
    setEditing(f);
    setBuilderOpen(true);
  };

  const handleSubmit = (dto: SaveCourseFormDto) => {
    saveForm.mutate(dto, { onSuccess: () => setBuilderOpen(false) });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Could not load forms. {getErrorMessage(error)}
        </CardContent>
      </Card>
    );
  }

  const list = forms ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          What an applicant fills in. Each form has its own public link.
        </p>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add form
          </Button>
        )}
      </div>

      {!coursePublished && list.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          This course is still a draft, so its public page is not reachable yet —
          enabling a form here will not make it live until the course is published.
        </div>
      )}

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No registration forms yet. Nobody can apply to this course until there is one.
            </p>
            {canManage && (
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                Build the first form
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((f) => {
            // The builder's zod gate cannot reach this toggle — useSetCourseFormEnabled
            // writes is_enabled directly, so a form saved before that gate existed
            // could still be flipped live here. listByCourse already embeds every
            // section's fields, so this costs no extra query.
            const identityGaps = findIdentityGaps(
              (f.sections ?? []).flatMap((s) => (s.fields ?? []).map((x) => x.field_key)),
            );
            const identityMessage = identityGapMessage(identityGaps);
            const live = f.is_enabled && coursePublished && !identityMessage;
            return (
              <Card key={f.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{f.name}</h3>
                        <Badge
                          variant="outline"
                          className={
                            live
                              ? 'border-emerald-300 text-[10px] text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                              : 'text-[10px] text-muted-foreground'
                          }
                        >
                          {live ? 'Accepting applications' : 'Not accepting applications'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {f.field_count ?? 0} question{(f.field_count ?? 0) === 1 ? '' : 's'}
                          {' · '}
                          {f.sections?.length ?? 0} section
                          {(f.sections?.length ?? 0) === 1 ? '' : 's'}
                        </span>
                      </div>
                      {f.description && (
                        <p className="text-sm text-muted-foreground">{f.description}</p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={f.is_enabled}
                          // Turning it OFF stays available even for a broken
                          // form — the guard must never trap one in the ON state.
                          disabled={
                            setEnabled.isPending || (!f.is_enabled && Boolean(identityMessage))
                          }
                          onCheckedChange={(v) => setEnabled.mutate({ id: f.id, enabled: v })}
                          aria-label={`Toggle applications for ${f.name}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(f)}
                          aria-label={`Edit ${f.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete(f)}
                          aria-label={`Delete ${f.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {identityMessage && (
                    <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                      <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
                        {identityMessage}
                      </p>
                      {canManage && (
                        <Button variant="outline" size="sm" className="h-7" onClick={() => openEdit(f)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Fix the form
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
                    <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      /course/{courseSlug}?form={f.slug}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => void copy(f.slug)}
                    >
                      {copied === f.slug ? (
                        <><Check className="mr-1 h-3.5 w-3.5" />Copied</>
                      ) : (
                        <><Copy className="mr-1 h-3.5 w-3.5" />Copy link</>
                      )}
                    </Button>
                    {live && (
                      <Button variant="ghost" size="sm" className="h-7" asChild>
                        <a
                          href={`/course/${courseSlug}?form=${f.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          Open
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* key remounts the builder so defaultValues re-initialise between Add and
          Edit, and between two different forms. */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Build a registration form'}</DialogTitle>
          </DialogHeader>
          <FormBuilder
            key={editing?.id ?? 'new'}
            courseEventId={courseEventId}
            editing={editing}
            onSubmit={handleSubmit}
            onCancel={() => setBuilderOpen(false)}
            submitting={saveForm.isPending}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this form?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{pendingDelete?.name}</span>, its
              sections and all its questions will be permanently deleted, and its public link
              will stop working. Applications already submitted are kept, but they will no
              longer point at the form they came from. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteForm.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              disabled={deleteForm.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteForm.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
              ) : (
                'Delete form'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
