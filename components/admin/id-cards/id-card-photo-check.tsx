'use client';

// ============================================================================
// IdCardPhotoCheck — who cannot be handed an ID card yet, per college, so the
// office can run the photo drive against a list instead of a guess.
// Created: 2026-08-26.
//
// WHY THIS EXISTS. Guard 3 (lib/services/id-cards/reprint-eligibility.ts)
// refuses to print a card for anyone with no photograph, because the renderer
// would draw initials where a face belongs and the QR beside it carries only a
// number. That refusal is correct, and on its own it is useless to the office:
// it fires one person at a time, at the counter, after they have queued.
//
// This page is the other half. It answers the question the refusal creates —
// "who else?" — before anyone walks up.
//
// It reads learners_profiles through the browser client, so RLS scopes the rows
// exactly as it does everywhere else, and classifies each person with
// lib/id-cards/photo-quality.ts — THE SAME module the guard uses. That sharing
// is the point: if this page and the endpoint held separate definitions of "has
// a photo", the office would chase a different list than the printer refuses.
//
// Nothing here writes. Every row links out to the learner's own edit screen,
// because the fix is a photograph somebody has to take.
//
// Measured on production 2026-08-26: 2,620 of 5,454 eligible learners (48.0%)
// have no picture that would render. Engineering, already live, is 808 of 1,019.
//
// NOTE `student_photo_url`, `avatar_url` and `lifecycle_status` are existing
// database identifiers (terminology-exempt); the copy a reader sees says
// "learner".
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CameraOff,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { logger, serializeError } from '@/lib/utils/enhanced-logger';
import { classifyCardPhoto, type PhotoVerdict } from '@/lib/id-cards/photo-quality';

const LOG_MODULE = 'id-cards/photo-check';
const FETCH_PAGE_SIZE = 1000;

// Stable identity — an inline array would re-fire the hook's effect forever.
const COHORT_ENTITY_TYPES: Array<'institution' | 'school'> = ['institution', 'school'];

/**
 * Which learners could receive a card. The widest choice mirrors
 * DEFAULT_LEARNER_CARD_STATUSES in reprint-eligibility.ts exactly, so the list
 * on this page is the same population the endpoint will judge — including
 * `reserved`, who stay eligible (Director decision 3, 2026-08-26).
 */
const SCOPE_CHOICES = [
  { value: 'active', label: 'Active learners', statuses: ['active'] },
  {
    value: 'active_admitted',
    label: 'Active + newly admitted',
    statuses: ['active', 'admitted', 'account'],
  },
  {
    value: 'card_eligible',
    label: 'Everyone a card can be printed for',
    statuses: ['active', 'admitted', 'account', 'reserved'],
  },
] as const;

type ScopeValue = (typeof SCOPE_CHOICES)[number]['value'];

/** Which list is on screen. Defaults to the drive list — the actionable one. */
type ViewFilter = 'missing' | 'all';

interface LearnerPhotoRow {
  id: string;
  name: string;
  rollNumber: string;
  verdict: PhotoVerdict;
}

const VERDICT_META: Record<
  PhotoVerdict['kind'],
  { label: string; badge: string; whatToDo: string }
> = {
  missing: {
    label: 'No photograph',
    badge: 'bg-red-100 text-red-800 border-red-200',
    whatToDo: 'Take their photograph and add it to their record. No card can be printed until then.',
  },

  official: {
    label: 'Official photograph',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    whatToDo: 'Nothing to do — the card will print with their photograph.',
  },
};

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof CameraOff;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function IdCardPhotoCheck() {
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: COHORT_ENTITY_TYPES,
  });

  const [institutionId, setInstitutionId] = useState<string>('');
  const [scope, setScope] = useState<ScopeValue>('card_eligible');
  const [view, setView] = useState<ViewFilter>('missing');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LearnerPhotoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionId && institutions.length > 0) setInstitutionId(institutions[0].id);
  }, [institutions, institutionId]);

  const loadRows = useCallback(async () => {
    if (!institutionId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const supabase = createClientSupabaseClient();
      const statuses = SCOPE_CHOICES.find((c) => c.value === scope)?.statuses ?? ['active'];

      // 1. The cohort and their institutional photograph.
      const learners: Array<{
        id: string;
        name: string;
        rollNumber: string;
        photoUrl: string | null;
      }> = [];

      for (let from = 0; ; from += FETCH_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('learners_profiles')
          .select('id, first_name, last_name, roll_number, student_photo_url')
          .eq('institution_id', institutionId)
          .in('lifecycle_status', statuses)
          .order('id')
          .range(from, from + FETCH_PAGE_SIZE - 1);

        if (error) throw error;
        for (const record of data ?? []) {
          learners.push({
            id: record.id,
            name:
              [record.first_name, record.last_name].filter(Boolean).join(' ').trim() || 'Unnamed',
            rollNumber: record.roll_number ?? '',
            photoUrl: record.student_photo_url ?? null,
          });
        }
        if (!data || data.length < FETCH_PAGE_SIZE) break;
      }

      // The login-account picture is deliberately NOT read. Until 2026-09-03
      // it was a qualifying fallback and this screen fetched it in a second
      // keyed query; the Director withdrew that, so only the institutional
      // photograph decides and the extra round trip is gone with it.
      const collected: LearnerPhotoRow[] = learners.map((learner) => ({
        id: learner.id,
        name: learner.name,
        rollNumber: learner.rollNumber,
        verdict: classifyCardPhoto({ officialPhotoUrl: learner.photoUrl }),
      }));

      // Worst first — the people who cannot be printed at all lead the list.
      const rank: Record<PhotoVerdict['kind'], number> = { missing: 0, official: 1 };
      collected.sort(
        (a, b) => rank[a.verdict.kind] - rank[b.verdict.kind] || a.name.localeCompare(b.name)
      );
      setRows(collected);
    } catch (error) {
      logger.error(LOG_MODULE, 'Failed to load photo coverage', serializeError(error));
      setLoadError('Could not load the learners for this college. Try again in a moment.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [institutionId, scope]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const summary = useMemo(() => {
    let missing = 0;
    let official = 0;
    for (const row of rows) {
      if (row.verdict.kind === 'missing') missing += 1;
      else official += 1;
    }
    return { missing, official, total: rows.length };
  }, [rows]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (view === 'missing' && row.verdict.kind !== 'missing') return false;
      if (term === '') return true;
      return (
        row.name.toLowerCase().includes(term) || row.rollNumber.toLowerCase().includes(term)
      );
    });
  }, [rows, view, search]);

  const collegeName = institutions.find((i) => i.id === institutionId)?.name ?? 'college';

  const handleExport = () => {
    if (visible.length === 0) {
      toast('Nothing to export in this view.');
      return;
    }
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [
      ['Learner', 'Roll number', 'Photograph', 'What to do'].join(','),
      ...visible.map((row) =>
        [
          escape(row.name),
          escape(row.rollNumber),
          escape(VERDICT_META[row.verdict.kind].label),
          escape(VERDICT_META[row.verdict.kind].whatToDo),
        ].join(',')
      ),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `photo-drive-${collegeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visible.length} learners.`);
  };

  const percent = (n: number) =>
    summary.total === 0 ? '0%' : `${Math.round((n / summary.total) * 100)}%`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pick a college</CardTitle>
          <CardDescription>
            Nothing on this page changes a record. It lists the people a card cannot be printed
            for yet, so the photo drive has a list to work down.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="photo-check-college">College</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger id="photo-check-college">
                <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Select a college'} />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="photo-check-scope">Which learners</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as ScopeValue)}>
              <SelectTrigger id="photo-check-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="photo-check-search">Search</Label>
            <div className="flex gap-2">
              <Input
                id="photo-check-search"
                placeholder="Name or roll number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => void loadRows()}
                disabled={isLoading}
                aria-label="Re-check"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loadError ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <p>{loadError}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile
          icon={CameraOff}
          label="No photograph"
          value={String(summary.missing)}
          hint={`${percent(summary.missing)} of this cohort — no card can be printed for them`}
        />
        <SummaryTile
          icon={CheckCircle2}
          label="Ready to print"
          value={String(summary.official)}
          hint={`${percent(summary.official)} have an official photograph on record`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {view === 'missing'
                ? 'Needs a photograph'
                : 'Everyone in this cohort'}
            </CardTitle>
            <CardDescription>
              {visible.length} of {summary.total} learners. Use Open to reach the learner&apos;s own
              screen and add their photograph.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Select value={view} onValueChange={(value) => setView(value as ViewFilter)}>
              <SelectTrigger className="w-[210px]" aria-label="Which list">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="missing">Needs a photograph</SelectItem>
                <SelectItem value="all">Everyone</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExport} disabled={visible.length === 0}>
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {view === 'missing'
                ? 'Every learner in this cohort has a photograph. Cards can be printed for all of them.'
                : 'Nothing in this view.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Learner</TableHead>
                  <TableHead>Roll number</TableHead>
                  <TableHead>Photograph</TableHead>
                  <TableHead className="text-right">Fix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.rollNumber || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={VERDICT_META[row.verdict.kind].badge}>
                        {VERDICT_META[row.verdict.kind].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/learners/profiles/${row.id}/edit`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
