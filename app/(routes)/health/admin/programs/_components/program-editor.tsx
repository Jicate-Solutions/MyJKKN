'use client';

// app/(routes)/health/admin/programs/_components/program-editor.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Edit one program's metadata (useUpdateProgram) + manage its 7 days
// (useUpsertDay via DayEditor). Days are loaded through the spine's
// useProgram(slug) — which returns HealthProgramWithDays — after resolving the
// slug from the all-programs list (the route only carries the program id).
// Mirrors the AI Pulse cycle-edit-form structure, health aesthetic.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Loader2,
  Save,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAllPrograms,
  useProgram,
  useUpdateProgram,
} from '@/hooks/health/use-wellness-programs';
import type {
  HealthProgram,
  HealthProgramAudience,
  HealthProgramStatus,
} from '@/types/health-programs';
import { DayEditor } from './day-editor';

const PROGRAM_DAYS = 7;

interface ProgramEditorProps {
  programId: string;
}

interface MetaForm {
  title: string;
  theme: string;
  description: string;
  status: HealthProgramStatus;
  audience: HealthProgramAudience;
  start_date: string;
  end_date: string;
}

function toMeta(p: HealthProgram): MetaForm {
  return {
    title: p.title ?? '',
    theme: p.theme ?? '',
    description: p.description ?? '',
    status: p.status,
    audience: p.audience,
    start_date: p.start_date ?? '',
    end_date: p.end_date ?? '',
  };
}

export function ProgramEditor({ programId }: ProgramEditorProps) {
  const router = useRouter();
  const update = useUpdateProgram();

  // Resolve the program (and its slug) from the all-programs list.
  const { data: allPrograms, isLoading: listLoading, error: listError } =
    useAllPrograms();
  const program = useMemo(
    () => allPrograms?.find((p) => p.id === programId) ?? null,
    [allPrograms, programId],
  );

  // Load the program-with-days by slug (spine hook). Days refetch after
  // useUpsertDay invalidates the ['wellness-program'] query family.
  const { data: withDays, isLoading: daysLoading } = useProgram(
    program?.slug,
  );

  const [meta, setMeta] = useState<MetaForm | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (program) {
      setMeta(toMeta(program));
      setDirty(false);
    }
  }, [program]);

  const setField = <K extends keyof MetaForm>(key: K, value: MetaForm[K]) => {
    setMeta((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  };

  // Map saved days by day_number for quick lookup.
  const daysByNumber = useMemo(() => {
    const map = new Map<number, NonNullable<typeof withDays>['days'][number]>();
    for (const d of withDays?.days ?? []) map.set(d.day_number, d);
    return map;
  }, [withDays]);

  // ---- loading / not-found ----
  if (listLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (listError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load this program</AlertTitle>
        <AlertDescription>{(listError as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (!program || !meta) {
    return (
      <Alert>
        <AlertTitle>Program not found</AlertTitle>
        <AlertDescription>
          No wellness program with id{' '}
          <code className="font-mono text-xs">{programId}</code>. It may have
          been deleted.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => router.push('/health/admin/programs')}
          >
            Back to all programs
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  const handleSaveMeta = async () => {
    if (meta.title.trim().length < 3) {
      toast.error('Title is required (min 3 characters).');
      return;
    }
    if (meta.start_date && meta.end_date && meta.end_date < meta.start_date) {
      toast.error('End date cannot be before the start date.');
      return;
    }
    try {
      await update.mutateAsync({
        id: programId,
        patch: {
          title: meta.title.trim(),
          theme: meta.theme.trim() || null,
          description: meta.description.trim() || null,
          status: meta.status,
          audience: meta.audience,
          start_date: meta.start_date || null,
          end_date: meta.end_date || null,
        },
      });
      setDirty(false);
    } catch {
      // hook shows an error toast
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/health/admin/programs')}
            className="-ml-2 mb-1 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            All programs
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-800">
              {program.title}
            </h1>
            <Badge variant="outline" className="capitalize">
              {program.status}
            </Badge>
            <span className="font-mono text-xs text-slate-400">
              /{program.slug}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/health/admin/programs/${programId}/responses`)
            }
            className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ClipboardList className="h-4 w-4" />
            Responses
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(`/health/admin/programs/${programId}/impact`)
            }
            className="gap-2 border-teal-200 text-teal-700 hover:bg-teal-50"
          >
            <BarChart3 className="h-4 w-4" />
            View impact
          </Button>
        </div>
      </div>

      {/* Program metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-slate-800">
            Program details
          </CardTitle>
          <CardDescription>
            Changes apply as soon as you save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pe-title">Title</Label>
            <Input
              id="pe-title"
              value={meta.title}
              onChange={(e) => setField('title', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pe-theme">Theme (optional)</Label>
              <Input
                id="pe-theme"
                value={meta.theme}
                onChange={(e) => setField('theme', e.target.value)}
                placeholder="e.g. Sleep, Hydration"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pe-status">Status</Label>
              <Select
                value={meta.status}
                onValueChange={(v) => setField('status', v as HealthProgramStatus)}
              >
                <SelectTrigger id="pe-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft — not visible yet</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active — live now</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pe-description">Description (optional)</Label>
            <Textarea
              id="pe-description"
              value={meta.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pe-audience">Audience</Label>
              <Select
                value={meta.audience}
                onValueChange={(v) =>
                  setField('audience', v as HealthProgramAudience)
                }
              >
                <SelectTrigger id="pe-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="students">Students</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="both">Students & staff</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pe-start">Start date</Label>
              <Input
                id="pe-start"
                type="date"
                value={meta.start_date}
                onChange={(e) => setField('start_date', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pe-end">End date</Label>
              <Input
                id="pe-end"
                type="date"
                value={meta.end_date}
                onChange={(e) => setField('end_date', e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveMeta}
              disabled={!dirty || update.isPending}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {update.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save details
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Days */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Daily content
          </h2>
          <p className="text-sm text-slate-500">
            Add a title, video, and optional quiz for each of the {PROGRAM_DAYS}{' '}
            days. Each day saves on its own.
          </p>
        </div>

        {daysLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-2.5">
            {Array.from({ length: PROGRAM_DAYS }, (_, i) => i + 1).map(
              (dayNumber) => (
                <DayEditor
                  key={dayNumber}
                  programId={programId}
                  dayNumber={dayNumber}
                  day={daysByNumber.get(dayNumber) ?? null}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
