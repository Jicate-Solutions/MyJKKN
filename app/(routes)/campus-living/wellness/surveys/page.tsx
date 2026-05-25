'use client';

/**
 * /campus-living/wellness/surveys — admin config for pulse survey templates.
 *
 * Wired 2026-05-21 (Agent o). Replaces ComingSoon. CRUD on
 * hostel_pulse_configs:
 *   - list (any status), filter by status
 *   - create or edit via ConfigEditorDialog
 *   - delete (with confirm) — safe because responses use config_id with no
 *     fk cascade; deleting an active config is rare in practice
 *
 * Per-institution scope via useAuth().profile.institution_id.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useAuth } from '@/hooks/use-auth';
import {
  useDeletePulseConfig,
  usePulseConfigs,
} from '@/hooks/campus-living/use-wellness';
import {
  PULSE_FREQUENCY_LABELS,
  PULSE_STATUS_LABELS,
  type HostelPulseConfig,
  type PulseStatusEnum,
} from '@/types/campus-living/wellness';
import { ConfigEditorDialog } from '../_components/config-editor-dialog';

export const navMeta = {
  invokedFrom: '/campus-living/wellness',
} as const;

const STATUS_FILTERS: { value: PulseStatusEnum | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_BADGE: Record<PulseStatusEnum, string> = {
  draft: 'bg-slate-100 text-slate-800 hover:bg-slate-100',
  active: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  paused: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  completed: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  archived: 'bg-zinc-100 text-zinc-700 hover:bg-zinc-100',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function CampusLivingWellnessSurveysPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? undefined;
  const authorId = profile?.id ?? null;

  const [statusFilter, setStatusFilter] = useState<PulseStatusEnum | 'all'>(
    'all',
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HostelPulseConfig | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HostelPulseConfig | null>(
    null,
  );

  const filters = useMemo(
    () => (statusFilter !== 'all' ? { status: statusFilter } : {}),
    [statusFilter],
  );

  const {
    data: configs = [],
    isLoading,
    isError,
    error,
  } = usePulseConfigs(institutionId, filters);

  const deleteMut = useDeletePulseConfig();

  const handleNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleEdit = (cfg: HostelPulseConfig) => {
    setEditing(cfg);
    setEditorOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
    } catch {
      // toast handled by hook
    }
  };

  if (!institutionId) {
    return (
      <ContentLayout title="Wellness Surveys">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Campus Living', href: '/campus-living' },
            { label: 'Wellness', href: '/campus-living/wellness' },
            { label: 'Surveys' },
          ]}
        />
        <div className="container mx-auto p-6 max-w-3xl">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pick an institution</AlertTitle>
            <AlertDescription>
              Survey templates are scoped per-institution. Switch into an
              institution context to view or create surveys.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Wellness Surveys">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Wellness', href: '/campus-living/wellness' },
          { label: 'Surveys' },
        ]}
      />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link href="/campus-living/wellness">
              <Button variant="ghost" size="sm" className="mb-2 -ml-2">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to Wellness
              </Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-violet-600" />
              Wellness Surveys
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Configure pulse-survey templates, cadence, and auto-escalation
              rules for critical responses.
            </p>
          </div>
          <Button onClick={handleNew} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            New survey
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Filter:</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as PulseStatusEnum | 'all')}
          >
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {configs.length} survey{configs.length === 1 ? '' : 's'}
          </span>
        </div>

        {isError ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load surveys</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unexpected error.'}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading surveys…</span>
          </div>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <div className="text-sm text-muted-foreground">
                No surveys yet. Create a pulse template to start collecting
                weekly mood, sleep, food, and homesickness signals.
              </div>
              <Button onClick={handleNew} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Create first survey
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {configs.map((cfg) => {
              const itemsCount = cfg.questions?.items?.length ?? 0;
              const anon = cfg.questions?.anonymous_mode === true;
              return (
                <Card key={cfg.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {cfg.title}
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        className={STATUS_BADGE[cfg.status]}
                      >
                        {PULSE_STATUS_LABELS[cfg.status]}
                      </Badge>
                    </div>
                    {cfg.description ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {cfg.description}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Cadence</div>
                        <div className="font-medium">
                          {PULSE_FREQUENCY_LABELS[cfg.frequency]}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Questions</div>
                        <div className="font-medium">{itemsCount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">
                          Critical threshold
                        </div>
                        <div className="font-medium">
                          mood &le;{' '}
                          {cfg.questions?.critical_threshold ?? 2}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Anonymous</div>
                        <div className="font-medium">
                          {anon ? 'Yes' : 'No'}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Updated {formatDate(cfg.updated_at)}
                    </div>
                    <div className="flex items-center gap-2 pt-2 mt-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(cfg)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete(cfg)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <ConfigEditorDialog
          institutionId={institutionId}
          authorId={authorId}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          existing={editing}
        />

        <AlertDialog
          open={!!confirmDelete}
          onOpenChange={(o) => {
            if (!o) setConfirmDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this survey?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{confirmDelete?.title}&rdquo; will be removed.
                Previously-submitted responses remain in the database but lose
                their config join — they&apos;ll still appear in the warden
                inbox without a title.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMut.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={deleteMut.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentLayout>
  );
}
