'use client';

// =============================================================================
// RCLTP teacher — Part A recording-review console (Phase 4c)
// =============================================================================
// Lists Part A voice recordings and lets a reviewer play the audio + record a
// MANUAL review (scoring_status, review_status, accuracy/fluency/pron/wpm) via
// useReviewRcltpRecording.
//
// CONTENT-SAFETY (non-negotiable):
//   - Manual review fields start EMPTY — never pre-filled with a number.
//   - The auto voice-scoring engine is MyJKKN-gated (POST .../score returns 501),
//     so where an auto-score would be we show an honest "Auto-scoring engine
//     pending (MyJKKN)" note instead of any fabricated value.
//   - audio_path is a Storage key in the PRIVATE rcltp-audio bucket; we mint a
//     short-lived signed URL to play it, and handle a null path honestly.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Mic,
  Play,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Save,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpRecordings,
  useReviewRcltpRecording,
} from '@/hooks/rcltp/use-rcltp-assessments';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  RcltpPartARecording,
  RcltpScoringStatus,
} from '@/types/rcltp';

interface Institution {
  id: string;
  name: string;
}

// scoring_status manual values a reviewer may set. 'scored' here means the
// reviewer's MANUAL judgement is complete — the auto-engine ('pending') stays
// pending until MyJKKN lands. 'low_confidence_review' flags for a second look.
const REVIEW_SCORING_STATUSES: RcltpScoringStatus[] = [
  'pending',
  'low_confidence_review',
  'overridden',
  'scored',
];

const REVIEW_STATUSES = ['pending', 'in_review', 'reviewed', 'flagged'] as const;

function useInstitutions() {
  return useQuery({
    queryKey: ['rcltp', 'institutions', 'active'],
    queryFn: async (): Promise<Institution[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function scoringStatusBadge(status: RcltpScoringStatus) {
  if (status === 'scored')
    return <Badge className='bg-emerald-100 text-emerald-800 hover:bg-emerald-100'>Reviewed</Badge>;
  if (status === 'overridden')
    return <Badge className='bg-emerald-100 text-emerald-800 hover:bg-emerald-100'>Overridden</Badge>;
  if (status === 'low_confidence_review')
    return <Badge className='bg-amber-100 text-amber-900 hover:bg-amber-100'>Low confidence</Badge>;
  return <Badge variant='secondary'>Pending</Badge>;
}

/** A numeric review input that starts EMPTY (never a fabricated default). */
function ScoreInput({
  id,
  label,
  value,
  onChange,
  max,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input
        id={id}
        type='number'
        min={0}
        max={max}
        step={step ?? 'any'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='—'
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One recording row: audio player (signed URL) + manual review form.
// ---------------------------------------------------------------------------
function RecordingCard({ recording }: { recording: RcltpPartARecording }) {
  const reviewRecording = useReviewRcltpRecording();

  // Signed-URL state for the private rcltp-audio bucket.
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Manual review fields — START EMPTY. We deliberately do NOT seed these from
  // any auto-engine output; the reviewer enters their own judgement.
  // Seed the status selects from the recording's CURRENT state so saving the
  // review without touching them never silently downgrades it. The numeric score
  // fields stay empty — those are the reviewer's own manual judgement.
  const [scoringStatus, setScoringStatus] = useState<RcltpScoringStatus>(
    recording.scoring_status ?? 'low_confidence_review'
  );
  const [reviewStatus, setReviewStatus] = useState<string>(
    recording.review_status ?? 'in_review'
  );
  const [accuracy, setAccuracy] = useState('');
  const [fluency, setFluency] = useState('');
  const [pron, setPron] = useState('');
  const [wpm, setWpm] = useState('');

  async function loadAudio() {
    if (!recording.audio_path) return;
    setLoadingUrl(true);
    setUrlError(null);
    try {
      // The rcltp-audio bucket is private with no client read policy, so the URL
      // must be minted by the service-role route (not the browser client).
      const res = await fetch(`/api/rcltp/recordings/${recording.id}/audio-url`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data?.signed_url) {
        throw new Error(
          json?.message || json?.error || 'Could not generate a playable link'
        );
      }
      setSignedUrl(json.data.signed_url as string);
    } catch (e) {
      setUrlError(
        e instanceof Error ? e.message : 'Could not load this recording’s audio.'
      );
    } finally {
      setLoadingUrl(false);
    }
  }

  async function saveReview() {
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await reviewRecording.mutateAsync({
        id: recording.id,
        input: {
          scoring_status: scoringStatus,
          review_status: reviewStatus,
          reviewed_by: user?.id ?? null,
          accuracy_score: num(accuracy),
          fluency_score: num(fluency),
          pron_score: num(pron),
          wpm: num(wpm),
        },
      });
    } catch {
      /* hook surfaces the toast */
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle className='text-sm font-semibold'>
              Recording {recording.id.slice(0, 8)}
            </CardTitle>
            <CardDescription>
              Captured {new Date(recording.created_at).toLocaleString()} · sync:{' '}
              {recording.sync_status}
            </CardDescription>
          </div>
          {scoringStatusBadge(recording.scoring_status)}
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Audio playback (private bucket → signed URL) */}
        <div>
          {!recording.audio_path ? (
            <Alert>
              <AlertTriangle className='h-4 w-4' aria-hidden='true' />
              <AlertDescription className='text-sm'>
                No audio was uploaded for this recording yet — nothing to play.
              </AlertDescription>
            </Alert>
          ) : signedUrl ? (
            <audio controls preload='none' src={signedUrl} className='w-full'>
              Your browser does not support audio playback.
            </audio>
          ) : urlError ? (
            <Alert>
              <AlertTriangle className='h-4 w-4' aria-hidden='true' />
              <AlertDescription className='space-y-2 text-sm'>
                <p>{urlError}</p>
                <Button size='sm' variant='outline' onClick={loadAudio}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Button
              variant='outline'
              size='sm'
              onClick={loadAudio}
              disabled={loadingUrl}
            >
              {loadingUrl ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Play className='mr-2 h-4 w-4' />
              )}
              Load audio
            </Button>
          )}
        </div>

        {/* MyJKKN-honest auto-score note */}
        <Alert>
          <ShieldAlert className='h-4 w-4' aria-hidden='true' />
          <AlertDescription className='text-sm'>
            <span className='font-medium'>Auto-scoring engine pending (MyJKKN).</span>{' '}
            Automatic accuracy / fluency / pronunciation scoring isn’t available
            yet, so no machine score is shown. Enter your manual review below — the
            fields start empty on purpose.
          </AlertDescription>
        </Alert>

        <Separator />

        {/* Manual review form — fields START EMPTY */}
        <div className='space-y-3'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div>
              <Label className='text-xs'>Scoring status</Label>
              <Select
                value={scoringStatus}
                onValueChange={(v) => setScoringStatus(v as RcltpScoringStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_SCORING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className='text-xs'>Review status</Label>
              <Select value={reviewStatus} onValueChange={setReviewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            <ScoreInput
              id={`acc-${recording.id}`}
              label='Accuracy'
              value={accuracy}
              onChange={setAccuracy}
              max={100}
            />
            <ScoreInput
              id={`flu-${recording.id}`}
              label='Fluency'
              value={fluency}
              onChange={setFluency}
              max={100}
            />
            <ScoreInput
              id={`pron-${recording.id}`}
              label='Pronunciation'
              value={pron}
              onChange={setPron}
              max={100}
            />
            <ScoreInput
              id={`wpm-${recording.id}`}
              label='Words/min'
              value={wpm}
              onChange={setWpm}
              step={1}
            />
          </div>

          <div className='flex justify-end'>
            <Button
              size='sm'
              onClick={saveReview}
              disabled={reviewRecording.isPending}
            >
              {reviewRecording.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Save className='mr-2 h-4 w-4' />
              )}
              Save review
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Main console
// ===========================================================================
export function RecordingsConsole() {
  const { data: institutions = [] } = useInstitutions();
  const [instFilter, setInstFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Default to the first institution once loaded.
  useEffect(() => {
    if (!instFilter && institutions.length > 0) {
      setInstFilter(institutions[0].id);
    }
  }, [institutions, instFilter]);

  const recordingsQuery = useRcltpRecordings(
    instFilter
      ? {
          institution_id: instFilter,
          ...(statusFilter !== 'all'
            ? { scoring_status: statusFilter as RcltpScoringStatus }
            : {}),
        }
      : {}
  );
  const recordings = instFilter ? (recordingsQuery.data?.data ?? []) : [];

  const instName = useMemo(() => {
    const m = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? 'School';
  }, [institutions]);

  return (
    <div className='space-y-5'>
      {/* Filters */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Recording review queue</h2>
          <p className='text-sm text-muted-foreground'>
            Listen to each Part A reading and record your manual review.
          </p>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <Select value={instFilter} onValueChange={setInstFilter}>
            <SelectTrigger className='w-full sm:w-56'>
              <SelectValue placeholder='Select school' />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-full sm:w-44'>
              <SelectValue placeholder='All statuses' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All statuses</SelectItem>
              <SelectItem value='pending'>Pending</SelectItem>
              <SelectItem value='low_confidence_review'>Low confidence</SelectItem>
              <SelectItem value='scored'>Reviewed</SelectItem>
              <SelectItem value='overridden'>Overridden</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!instFilter ? (
        <div className='rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground'>
          Select a school to see its recordings.
        </div>
      ) : recordingsQuery.isLoading ? (
        <div className='space-y-4'>
          <Skeleton className='h-64 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      ) : recordings.length === 0 ? (
        <div className='rounded-md border border-dashed p-10 text-center'>
          <Mic className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>
            No recordings to review for {instName(instFilter)} with this filter.
          </p>
        </div>
      ) : (
        <div className='grid gap-4'>
          {recordings.map((r) => (
            <RecordingCard key={r.id} recording={r} />
          ))}
        </div>
      )}
    </div>
  );
}
