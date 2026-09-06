'use client';

// app/(routes)/health/admin/programs/_components/program-list.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Lists every wellness program (useAllPrograms) and hosts the "New program"
// create form. Mirrors the AI Pulse cycle-list precedent, restyled to the
// emerald/teal/slate health aesthetic.

import Link from 'next/link';
import { useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllPrograms } from '@/hooks/health/use-wellness-programs';
import type {
  HealthProgram,
  HealthProgramStatus,
} from '@/types/health-programs';
import { NewProgramForm } from './new-program-form';

const STATUS_STYLES: Record<HealthProgramStatus, string> = {
  draft: 'border-slate-300 text-slate-600 bg-slate-50',
  scheduled: 'border-blue-200 text-blue-700 bg-blue-50',
  active: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  completed: 'border-teal-200 text-teal-700 bg-teal-50',
  archived: 'border-slate-200 text-slate-400 bg-slate-50',
};

const AUDIENCE_LABEL: Record<HealthProgram['audience'], string> = {
  students: 'Students',
  staff: 'Staff',
  both: 'Students & staff',
  public: 'Public',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// A program whose run window has already closed is still stored as 'active'
// (or 'scheduled') until an admin changes it — the status enum is an
// admin-controlled state machine, not auto-advanced. Mirror the read-time
// derivation getActivePrograms() uses for learners (PR #1635: drop programs
// once end_date passes) so the admin list never presents a finished program as
// live. Display-only: the stored status and the editor dropdown are untouched.
const ENDED_STYLE = 'border-slate-300 text-slate-600 bg-slate-100';

function isEndedByDate(program: HealthProgram): boolean {
  if (!program.end_date) return false; // open-ended programs never auto-end
  if (program.status !== 'active' && program.status !== 'scheduled') {
    return false; // draft / completed / archived keep their explicit status
  }
  // end_date is a DATE ('YYYY-MM-DD'); compare ISO date strings to dodge
  // Date-parse timezone drift. Use the SAME UTC basis as getActivePrograms()
  // (toISOString) so the admin badge and the learner-facing window can never
  // disagree at the day boundary. Ended = end date strictly before today.
  const todayUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return program.end_date.slice(0, 10) < todayUTC;
}

function ProgramCard({ program }: { program: HealthProgram }) {
  const ended = isEndedByDate(program);
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-800">
              {program.title}
            </h3>
            <Badge
              variant="outline"
              className={`capitalize text-xs ${
                ended ? ENDED_STYLE : STATUS_STYLES[program.status]
              }`}
              title={
                ended
                  ? `Run window ended — stored status: ${program.status}`
                  : undefined
              }
            >
              {ended ? 'Ended' : program.status}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="font-mono">/{program.slug}</span>
            {program.theme && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-500" />
                {program.theme}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {AUDIENCE_LABEL[program.audience]}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="h-3 w-3" />
              {formatDate(program.start_date)} – {formatDate(program.end_date)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={`/health/admin/programs/${program.id}/responses`}>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Responses
            </Button>
          </Link>
          <Link href={`/health/admin/programs/${program.id}/impact`}>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Impact
            </Button>
          </Link>
          <Link href={`/health/admin/programs/${program.id}`}>
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Manage
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProgramList() {
  const { data: programs, isLoading, isFetching, error, refetch } =
    useAllPrograms();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {programs
            ? `${programs.length} program${programs.length === 1 ? '' : 's'}`
            : '—'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate((v) => !v)}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            {showCreate ? 'Close' : 'New program'}
          </Button>
        </div>
      </div>

      {/* Create form (collapsible) */}
      {showCreate && (
        <NewProgramForm onCreated={() => setShowCreate(false)} />
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load programs</AlertTitle>
          <AlertDescription>
            {(error as Error).message || 'Unknown error reading health_programs.'}
          </AlertDescription>
        </Alert>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : !programs || programs.length === 0 ? (
        <Card className="border-dashed border-emerald-200">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50">
              <Sparkles className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-slate-600">
              No wellness programs yet
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-slate-400">
              Create your first program — for example a 7-day sleep or hydration
              challenge — then add a daily video and short quiz for each day.
            </p>
            {!showCreate && (
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="mt-2 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                New program
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {programs.map((p) => (
            <ProgramCard key={p.id} program={p} />
          ))}
        </div>
      )}
    </div>
  );
}
