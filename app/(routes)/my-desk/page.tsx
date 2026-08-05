'use client';

// app/(routes)/my-desk/page.tsx
// ============================================================================
// /my-desk — what has been handed to me.
//
// The receiving half of the Director's Desk. Somebody senior asked you to carry
// a piece of work; this is where it arrives, where you say yes or no to it, and
// where you say what has happened since.
//
// WHY THIS PAGE HAS NO PERMISSION GATE — read before adding one.
//
// Every other page here opens on a permission key. This one deliberately does
// not, and the reason is the entire feature. A handover exists precisely so a
// colleague who holds NO relevant role can be given one page for one job. Gate
// this page on a key and the person the feature was built for lands on an
// access-denied panel holding a job they cannot see — which is the exact bug
// the Director's Desk was built to remove, rebuilt one layer up.
//
// So the gate is: are you signed in. Nothing more. The protection is in the
// database, where it belongs — the RLS SELECT policy on director_handovers
// admits `grantee_user_id = auth.uid()`, and the read below narrows to the same
// person again. Two people signed in at once see two different desks with no
// help from this file.
//
// WHY AN EMPTY DESK IS NOT AUTOMATICALLY AN EMPTY DESK.
//
// RLS denial is silent: a denied read comes back as zero rows with
// `error === null`, byte-identical to genuinely having nothing to do. Telling a
// colleague "nothing has been handed to you" off that is a claim about their
// workload the page cannot support. So the page reads twice — the list through
// the session client, and a counts-only SECURITY DEFINER probe — and only says
// the desk is empty when the probe positively agrees. Every other combination
// says what it actually knows. The rules are pure functions in ./_lib/desk.ts,
// with tests.
//
// Writes never touch the table. Every one goes through the lifecycle RPCs,
// because RLS restricts ROWS and not COLUMNS: an "update rows you received"
// policy would also let a receiver rewrite permission_keys and grant themselves
// the rest of the platform. And success is asserted on RE-READ STATE, never on
// the absence of an error.
// ============================================================================

import { useCallback, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  History,
  Inbox,
  Loader2,
  Lock,
  MessageSquarePlus,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

import {
  accessIsLive,
  accessLevelWords,
  closedReason,
  daysQuiet,
  describeAudit,
  describeDue,
  chunk,
  hasPermissionKeys,
  indexAudit,
  istToday,
  personName,
  readabilityVerdict,
  splitDesk,
  AUDIT_ID_CHUNK,
  CLOSED_ROW_LIMIT,
  DESK_ROW_LIMIT,
  type AuditRow,
  type DeskPerson,
  type DeskProbe,
  type HandoverRow,
} from './_lib/desk';

const LOG = 'director-desk/my-desk';

/** Everything this page reads, under one key prefix so one call clears it all. */
const QK = ['director-desk', 'my-desk'] as const;

/** Columns the desk needs. Named explicitly so a schema addition cannot surprise it. */
const HANDOVER_COLUMNS =
  'id, route, title, note, permission_keys, access_level, grantee_user_id, granted_by, ' +
  'institution_id, status, due_date, responded_at, decline_reason, completed_at, ' +
  'revoked_at, last_activity_at, created_at, updated_at';

/** After this many silent days an item starts showing up in the daily chase. */
const QUIET_DAYS = 7;

/** Per-chunk ceiling on the audit read, for the same reason as DESK_ROW_LIMIT. */
const AUDIT_ROW_LIMIT = 2000;

/**
 * Ceiling on any one write. supabase-js has no default timeout, so a request
 * that never settles leaves `busyIds` populated and that item's buttons permanently
 * disabled with no toast and no way back short of a reload.
 */
const WRITE_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms = WRITE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const bell = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            'That took too long and we do not know whether it went through. Reload the page before trying again.',
          ),
        ),
      ms,
    );
  });
  return Promise.race([work, bell]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface DeskList {
  rows: HandoverRow[];
  /** True when either read hit its own ceiling, so the list is short by design. */
  capped: boolean;
}

/**
 * The desk itself, read as TWO queries.
 *
 * Filtered to `grantee_user_id` even though RLS already scopes the table: the
 * policy also admits rows the viewer GRANTED, and those belong on the Director's
 * desk, not this one.
 *
 * Open and ended are read separately because a single capped read ordered by
 * due date spends its budget oldest-first — and on a desk with any history that
 * is all closed rows, pushing the live work off the bottom while the page
 * cheerfully reports that nothing is being withheld. Open work gets its own
 * ceiling and cannot be evicted by things that already finished.
 */
function useMyHandovers(userId: string | undefined) {
  return useQuery({
    queryKey: [...QK, 'rows', userId],
    enabled: !!userId,
    queryFn: async (): Promise<DeskList> => {
      const sb = createClientSupabaseClient() as any;

      const open = await sb
        .from('director_handovers')
        .select(HANDOVER_COLUMNS)
        .eq('grantee_user_id', userId)
        .in('status', ['pending', 'accepted'])
        .order('due_date', { ascending: true })
        // Explicit, so a short answer is OUR cap and not an unknowable
        // PostgREST truncation the page would misread as rows being withheld.
        .limit(DESK_ROW_LIMIT);
      if (open.error) throw new Error(open.error.message);

      // `not in` rather than a list of ended statuses: a status added to the
      // spine later must land here on its own, not vanish from the page while
      // the probe keeps counting it and the two reads argue forever.
      const closed = await sb
        .from('director_handovers')
        .select(HANDOVER_COLUMNS)
        .eq('grantee_user_id', userId)
        .not('status', 'in', '(pending,accepted)')
        .order('updated_at', { ascending: false })
        .limit(CLOSED_ROW_LIMIT);
      if (closed.error) throw new Error(closed.error.message);

      const openRows = (open.data ?? []) as HandoverRow[];
      const closedRows = (closed.data ?? []) as HandoverRow[];

      return {
        rows: [...openRows, ...closedRows],
        capped:
          openRows.length >= DESK_ROW_LIMIT || closedRows.length >= CLOSED_ROW_LIMIT,
      };
    },
    staleTime: 30 * 1000,
    retry: false,
  });
}

/**
 * Counts only, through a SECURITY DEFINER function, so the page can tell an
 * empty desk from an unreadable one. Never used to render an item — if this
 * disagrees with the list, the page reports the disagreement rather than
 * papering over it with numbers nobody can click.
 */
function useDeskProbe(userId: string | undefined) {
  return useQuery({
    queryKey: [...QK, 'probe', userId],
    enabled: !!userId,
    queryFn: async (): Promise<DeskProbe> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_my_desk_probe');
      if (error) throw new Error(error.message);
      return (data ?? {}) as DeskProbe;
    },
    staleTime: 30 * 1000,
    retry: false,
  });
}

/**
 * Names for the people on the caller's own rows. A failure here costs a name,
 * never a row, so it is swallowed — "handed over by" degrades to a quiet line
 * rather than taking the desk down with it.
 */
function useDeskPeople(userId: string | undefined) {
  return useQuery({
    queryKey: [...QK, 'people', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, DeskPerson>> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_my_desk_people');
      if (error) {
        logger.warn(LOG, 'Could not resolve the names on this desk', error);
        return {};
      }
      return ((data ?? []) as DeskPerson[]).reduce(
        (acc: Record<string, DeskPerson>, person) => {
          acc[person.person_id] = person;
          return acc;
        },
        {},
      );
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

interface DeskTrails {
  rows: AuditRow[];
  /** A chunk hit its ceiling, so some item's history may be missing entries. */
  truncated: boolean;
}

/**
 * The trail. Append-only in the database, so this is history, never state.
 *
 * Read in chunks: the id filter travels in the query string, and a few hundred
 * uuids is enough URL to earn a 414 from Kong or a CDN — a failure that would
 * render as "this item has no history", which is the page asserting from a
 * request that never arrived that nothing ever happened. A chunk that fails
 * throws, and the caller shows a "history could not be loaded" line instead of
 * an empty trail.
 */
function useDeskAudit(handoverIds: string[]) {
  const key = useMemo(() => [...handoverIds].sort().join(','), [handoverIds]);
  return useQuery({
    queryKey: [...QK, 'audit', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<DeskTrails> => {
      const sb = createClientSupabaseClient() as any;
      const groups = chunk(key.split(','), AUDIT_ID_CHUNK);
      const results = await Promise.all(
        groups.map((ids) =>
          sb
            .from('director_handover_audit')
            .select('id, handover_id, action, actor_user_id, detail, created_at')
            .in('handover_id', ids)
            .order('created_at', { ascending: false })
            .limit(AUDIT_ROW_LIMIT),
        ),
      );
      const failed = results.find((r: any) => r.error);
      if (failed) throw new Error(failed.error.message);

      // A chunk at its ceiling is a chunk we cannot vouch for: the rows come
      // back newest-first ACROSS the whole chunk, so one chatty handover can eat
      // the budget and leave its neighbours with nothing — which Trail would
      // otherwise render as "nothing ever happened here".
      const truncated = results.some(
        (r: any) => ((r.data ?? []) as AuditRow[]).length >= AUDIT_ROW_LIMIT,
      );

      return {
        rows: results.flatMap((r: any) => (r.data ?? []) as AuditRow[]),
        truncated,
      };
    },
    staleTime: 30 * 1000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Writes — every one asserted on re-read state
// ---------------------------------------------------------------------------

type AfterState = { status?: string; last_activity_at?: string | null } | null;

/**
 * The state the row is actually in after a write.
 *
 * Every lifecycle RPC is declared `RETURNS public.director_handovers`, so the
 * authoritative post-state comes back with the call itself. Prefer it. A second
 * SELECT is only a fallback, and a poor one: it goes through the session client,
 * where a denied or replica-lagged read is a silent null — which would report
 * "your answer was not recorded" about a write that already succeeded, and send
 * the person to retry against a row that has already moved.
 */
function afterFromRpc(data: unknown): AfterState {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const { status, last_activity_at } = row as Record<string, unknown>;
  if (typeof status !== 'string') return null;
  return {
    status,
    last_activity_at: typeof last_activity_at === 'string' ? last_activity_at : null,
  };
}

async function readBack(handoverId: string): Promise<AfterState> {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb
    .from('director_handovers')
    .select('id, status, last_activity_at')
    .eq('id', handoverId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as AfterState;
}

/**
 * Accept or decline (decision 8). The stored status must come back as the one
 * asked for — an RPC that returned without error but changed nothing would
 * otherwise read as success and leave the Director waiting for an answer that
 * was never recorded.
 */
async function respondToHandover(
  handoverId: string,
  decision: 'accepted' | 'declined',
  reason?: string,
) {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb.rpc('fn_director_handover_respond', {
    p_handover_id: handoverId,
    p_decision: decision,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);

  const after = afterFromRpc(data) ?? (await readBack(handoverId));
  if (!after || after.status !== decision) {
    throw new Error(
      'Your answer was not recorded. Try again, and tell the person who handed this over if it keeps happening.',
    );
  }
}

/**
 * Post an update. This is the thing that keeps an item out of the "gone quiet"
 * bucket, so it is checked on the field that actually moves: last_activity_at.
 * The status deliberately does not change, so status cannot be the proof.
 *
 * The comparison is SERVER TIMESTAMP against SERVER TIMESTAMP — the value the
 * row carried before, against the value it carries now. An earlier version
 * compared the database's clock against this browser's, so a machine running a
 * few minutes fast reported "your update was not saved" about a write that had
 * landed; the person then retried and a duplicate note went into a trail that
 * cannot be edited. A false failure is worse than no check here.
 */
async function postProgress(handoverId: string, note: string, before: string | null) {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb.rpc('fn_director_handover_progress', {
    p_handover_id: handoverId,
    p_note: note,
  });
  if (error) throw new Error(error.message);

  const after = afterFromRpc(data) ?? (await readBack(handoverId));
  if (!after) throw new Error('Your update was not saved. Please try again.');

  const now = after.last_activity_at ? Date.parse(after.last_activity_at) : NaN;
  const then = before ? Date.parse(before) : NaN;
  // Only assert when both values are readable. If either is missing we have a
  // row back from an RPC that raises on every failure — that is enough.
  if (Number.isFinite(now) && Number.isFinite(then) && now <= then) {
    throw new Error('Your update was not saved. Please try again.');
  }
}

/** Mark done — decision 4: access to the page ends here. */
async function completeHandover(handoverId: string, note: string | null) {
  const sb = createClientSupabaseClient() as any;
  const { data, error } = await sb.rpc('fn_director_handover_complete', {
    p_handover_id: handoverId,
    p_note: note && note.trim() !== '' ? note.trim() : null,
  });
  if (error) throw new Error(error.message);

  const after = afterFromRpc(data) ?? (await readBack(handoverId));
  if (!after || after.status !== 'done') {
    throw new Error('This could not be marked done. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Small presentation pieces
// ---------------------------------------------------------------------------

function DueChip({ dueDate, today }: { dueDate: string; today: string }) {
  const { label, tone } = describeDue(dueDate, today);
  const cls =
    tone === 'past'
      ? 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-300'
      : tone === 'soon'
        ? 'border-amber-300 text-amber-800 dark:border-amber-900 dark:text-amber-300'
        : 'border-muted-foreground/30 text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${cls}`}
    >
      <CalendarClock className="h-3 w-3" />
      {dueDate} — {label}
    </span>
  );
}

function AccessChip({ level }: { level: string }) {
  const { title, detail } = accessLevelWords(level);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      title={detail}
    >
      <Eye className="h-3 w-3" />
      {title}
    </span>
  );
}

function Trail({
  entries,
  people,
  unavailable,
}: {
  entries: AuditRow[];
  people: Record<string, DeskPerson> | undefined;
  /** The audit read failed. An empty trail here would be a claim, not a fact. */
  unavailable: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (unavailable) {
    return (
      <span className="text-xs text-muted-foreground">
        The history could not be loaded — this does not mean nothing happened.
      </span>
    );
  }
  if (entries.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <History className="mr-1 h-3.5 w-3.5" />
          What has happened ({entries.length})
          <ChevronDown
            className={`ml-1 h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 space-y-2 border-l pl-4">
          {entries.map((entry) => {
            const { headline, body } = describeAudit(entry);
            const who = personName(people, entry.actor_user_id);
            return (
              <li key={entry.id} className="text-xs">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{headline}</span>
                  <span className="text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                    {who ? ` · ${who}` : ''}
                  </span>
                </div>
                {body && <p className="mt-0.5 text-muted-foreground">{body}</p>}
              </li>
            );
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The note dialog, shared by decline / update / done. */
function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  required,
  confirmLabel,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  required: boolean;
  confirmLabel: string;
  busy: boolean;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const fieldId = useId();
  const blocked = required && text.trim() === '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{label}</Label>
          <Textarea
            id={fieldId}
            value={text}
            placeholder={placeholder}
            rows={4}
            onChange={(event) => setText(event.target.value)}
          />
          {required && blocked && (
            <p className="text-xs text-muted-foreground">
              This one cannot be left blank.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(text)} disabled={blocked || busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DialogKind = 'decline' | 'progress' | 'done';

type PendingDialog = { kind: DialogKind; row: HandoverRow } | null;

/** What each question actually says. Separated so the copy reads as copy. */
const DIALOG_COPY: Record<
  DialogKind,
  {
    title: string;
    description: string;
    label: string;
    placeholder: string;
    required: boolean;
    confirmLabel: string;
  }
> = {
  decline: {
    title: 'Decline this',
    description:
      'Declining is a normal answer. The person who asked will see your reason, and the page will close to you straight away.',
    label: 'Why are you declining?',
    placeholder: 'Say what is in the way — a clash, the wrong person, not enough time.',
    required: true,
    confirmLabel: 'Decline',
  },
  progress: {
    title: 'Post an update',
    description:
      'A line about where this stands. This is what stops the daily reminder — it does not close the item.',
    label: 'What has happened?',
    placeholder: 'Two paragraphs drafted, waiting on the finance figures.',
    required: true,
    confirmLabel: 'Post it',
  },
  done: {
    title: 'Mark this done',
    description:
      'This closes the item and your access to that page ends with it. You can leave a closing note if it helps.',
    label: 'Closing note (optional)',
    placeholder: 'Submitted on the 12th, acknowledged by the office.',
    required: false,
    confirmLabel: 'Mark done',
  },
};

function OpenItem({
  row,
  today,
  people,
  trail,
  trailUnavailable,
  busy,
  onAccept,
  onAsk,
}: {
  row: HandoverRow;
  today: string;
  people: Record<string, DeskPerson> | undefined;
  trail: AuditRow[];
  trailUnavailable: boolean;
  busy: boolean;
  onAccept: (row: HandoverRow) => void;
  onAsk: (next: PendingDialog) => void;
}) {
  const from = personName(people, row.granted_by);
  const fromRole = people?.[row.granted_by]?.person_designation ?? null;
  const live = accessIsLive(row, today);
  const quiet = daysQuiet(row.last_activity_at, new Date().toISOString());
  const level = accessLevelWords(row.access_level);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72 space-y-1">
          <p className="font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">
            Handed to you by {from ?? 'someone whose name we could not load'}
            {fromRole ? ` · ${fromRole}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            The page: <code className="rounded bg-muted px-1 py-0.5">{row.route}</code>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <DueChip dueDate={row.due_date} today={today} />
          <AccessChip level={row.access_level} />
          {live ? (
            <Button asChild variant="outline" size="sm">
              <Link href={row.route}>
                Open the page
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              The page is closed to you now
            </span>
          )}
        </div>
      </div>

      <Separator className="my-3" />

      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">{level.detail}</p>
        {row.note && (
          <p className="rounded-md bg-muted/60 p-3 text-sm">
            <span className="font-medium">What they said: </span>
            {row.note}
          </p>
        )}
        {!live && !hasPermissionKeys(row) && (
          <p className="text-xs text-red-700 dark:text-red-300">
            This item does not name any page permission, so opening it would not
            work. Ask the person who handed it over to send it again.
          </p>
        )}
        {!live && hasPermissionKeys(row) && (
          <p className="text-xs text-red-700 dark:text-red-300">
            The date on this has passed, so the page no longer opens for you.
            {row.status === 'pending'
              ? ' Answer it below, and ask for a new date if you are taking it on.'
              : ' Post an update saying where it stands, or ask for a new date.'}
          </p>
        )}
        {row.status === 'accepted' && quiet !== null && quiet >= QUIET_DAYS && (
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Nothing has been recorded here for {quiet} days. A short update stops
            the daily reminder.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {row.status === 'pending' ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => onAccept(row)}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAsk({ kind: 'decline', row })}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Decline
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAsk({ kind: 'progress', row })}
              >
                <MessageSquarePlus className="mr-1 h-4 w-4" />
                Post an update
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onAsk({ kind: 'done', row })}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Mark done
              </Button>
            </>
          )}
          <Trail entries={trail} people={people} unavailable={trailUnavailable} />
        </div>
      </div>
    </div>
  );
}

function ClosedItem({
  row,
  people,
  trail,
  trailUnavailable,
}: {
  row: HandoverRow;
  people: Record<string, DeskPerson> | undefined;
  trail: AuditRow[];
  trailUnavailable: boolean;
}) {
  const from = personName(people, row.granted_by);
  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">
            {closedReason(row)}
            {from ? ` · from ${from}` : ''}
          </p>
          {row.status === 'declined' && row.decline_reason && (
            <p className="text-xs text-muted-foreground">
              Your reason: {row.decline_reason}
            </p>
          )}
        </div>
        <Badge variant="secondary" className="shrink-0 text-[11px] font-normal">
          {row.status}
        </Badge>
      </div>
      <div className="pt-1">
        <Trail entries={trail} people={people} unavailable={trailUnavailable} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function MyDeskPage() {
  const qc = useQueryClient();
  const { profile, isLoading: authLoading } = useAuth();
  const userId = profile?.id as string | undefined;

  // A SET, not a scalar. With one id, finishing a write on row A cleared the
  // flag and re-enabled row B's buttons while B's own request was still in
  // flight — one more click and the audit trail carries a duplicate.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dialog, setDialog] = useState<PendingDialog>(null);

  const rowsQuery = useMyHandovers(userId);
  const probeQuery = useDeskProbe(userId);
  const peopleQuery = useDeskPeople(userId);

  const rows = useMemo(() => rowsQuery.data?.rows ?? [], [rowsQuery.data]);
  const handoverIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const auditQuery = useDeskAudit(handoverIds);

  const today = istToday();
  const buckets = useMemo(() => splitDesk(rows, today), [rows, today]);
  const trails = useMemo(() => indexAudit(auditQuery.data?.rows ?? []), [auditQuery.data]);
  // Truncation counts as unavailable: a starved item would otherwise render an
  // empty trail, which reads as "nothing ever happened" — a claim, not a fact.
  const trailUnavailable = !!auditQuery.error || auditQuery.data?.truncated === true;

  const verdict = readabilityVerdict({
    rowsFailed: !!rowsQuery.error,
    probeFailed: !!probeQuery.error,
    probe: probeQuery.data,
    visibleCount: rows.length,
    listCapped: rowsQuery.data?.capped === true,
  });

  const refreshDesk = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: QK });
  }, [qc]);

  const run = useCallback(
    async (row: HandoverRow, job: () => Promise<void>, success: string) => {
      setBusyIds((current) => new Set(current).add(row.id));
      try {
        await withTimeout(job());
        toast.success(success);
        setDialog(null);
        await refreshDesk();
      } catch (error) {
        logger.error(LOG, 'Handover action failed', error);
        toast.error(
          error instanceof Error ? error.message : 'That did not go through. Please try again.',
        );
      } finally {
        setBusyIds((current) => {
          const next = new Set(current);
          next.delete(row.id);
          return next;
        });
      }
    },
    [refreshDesk],
  );

  const onAccept = useCallback(
    (row: HandoverRow) =>
      run(row, () => respondToHandover(row.id, 'accepted'), 'Accepted. It is yours now.'),
    [run],
  );

  if (authLoading) {
    return (
      <ContentLayout>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </ContentLayout>
    );
  }

  // The ONLY gate on this page. Not a permission — being signed in.
  if (!userId) {
    return (
      <ContentLayout>
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-lg">Please sign in</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page shows work handed to you personally, so it needs to know
            who you are. Sign in and it will load.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const loading = rowsQuery.isLoading || probeQuery.isLoading;
  // olderClosedCount belongs in here: those are rows the page READ. Leaving
  // them out let a desk whose every item closed a month ago render "nothing
  // open" with the count silently dropped.
  const nothingToShow =
    buckets.awaitingAnswer.length === 0 &&
    buckets.mine.length === 0 &&
    buckets.recentlyClosed.length === 0 &&
    buckets.olderClosedCount === 0;

  return (
    <ContentLayout>
      <div className="space-y-6">
        <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ClipboardList className="h-6 w-6 text-indigo-600" />
              What has been handed to you
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              Each item below is one job on one page, with a date and a note from
              the person who asked. Opening the page works for as long as the item
              is open — you do not need any other access.
            </p>
            <p>
              Nothing here is yours until you accept it, and declining is a normal
              answer.
            </p>
          </CardContent>
        </Card>

        {/*
          ── What the page is entitled to claim ─────────────────────────────
          Every banner below waits for `loading` to clear. Mid-load the probe
          has not answered yet, which is indistinguishable from a probe that
          FAILED — so rendering these early flashes "this list may not be
          everything" on every single page load and teaches people to ignore
          the one banner that matters.
        */}
        {!loading && verdict.kind === 'unavailable' && (
          <Card className="border-red-200 dark:border-red-900/50">
            <CardContent className="flex items-start gap-3 pt-6 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="font-medium">We could not check your desk.</p>
                <p className="text-muted-foreground">
                  This is a loading problem, not a statement that you have nothing
                  to do. Reload the page. If it keeps happening, tell the person
                  who handed the work over — they can still see it from their side.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && verdict.kind === 'unknown' && (
          <Card className="border-amber-200 dark:border-amber-900/50">
            <CardContent className="flex items-start gap-3 pt-6 text-sm">
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">This list may not be everything.</p>
                <p className="text-muted-foreground">
                  The second check behind this page did not answer, so nothing
                  here can be treated as the complete picture — and an empty desk
                  is not proof that nothing was handed to you. Reload, and ask
                  directly if you were expecting something.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && verdict.kind === 'capped' && (
          <Card className="border-amber-200 dark:border-amber-900/50">
            <CardContent className="flex items-start gap-3 pt-6 text-sm">
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">
                  Showing {verdict.visible} of {verdict.expected}.
                </p>
                {/*
                  Deliberately names NO limit. `capped` fires when either the
                  open read or the ended read hits its own ceiling, and printing
                  one number beside a total produced by the other read gave a
                  sentence that contradicted itself on screen.
                */}
                <p className="text-muted-foreground">
                  This page loads only so many at a time, so the rest are simply
                  not on screen — nothing is being withheld from you. Open work is
                  always loaded first.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/*
          Deliberately does NOT name a cause. The page can see that the two
          reads disagree; it cannot see WHY, and "held back by a permission
          rule" was a guess dressed as a fact on the one page whose thesis is
          never to state what it did not verify.
        */}
        {!loading && verdict.kind === 'partial' && (
          <Card className="border-amber-200 dark:border-amber-900/50">
            <CardContent className="flex items-start gap-3 pt-6 text-sm">
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">
                  The two checks disagree: {verdict.expected} items are on your
                  desk, but only {verdict.visible} can be shown here.
                </p>
                <p className="text-muted-foreground">
                  Reload before acting on this list. If it still does not add up,
                  ask the person who handed the work over — they can see it from
                  their side.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {/* ── Waiting for your answer ──────────────────────────────────────── */}
        {!loading && buckets.awaitingAnswer.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Waiting for your answer ({buckets.awaitingAnswer.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You can already open these pages — that is on purpose, so you can
                look before you decide.
              </p>
              {buckets.awaitingAnswer.map((row) => (
                <OpenItem
                  key={row.id}
                  row={row}
                  today={today}
                  people={peopleQuery.data}
                  trail={trails[row.id] ?? []}
                  trailUnavailable={trailUnavailable}
                  busy={busyIds.has(row.id)}
                  onAccept={onAccept}
                  onAsk={setDialog}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Accepted ─────────────────────────────────────────────────────── */}
        {!loading && buckets.mine.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Yours to carry ({buckets.mine.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {buckets.mine.map((row) => (
                <OpenItem
                  key={row.id}
                  row={row}
                  today={today}
                  people={peopleQuery.data}
                  trail={trails[row.id] ?? []}
                  trailUnavailable={trailUnavailable}
                  busy={busyIds.has(row.id)}
                  onAccept={onAccept}
                  onAsk={setDialog}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Recently closed ──────────────────────────────────────────────── */}
        {!loading &&
          (buckets.recentlyClosed.length > 0 || buckets.olderClosedCount > 0) && (
          <Collapsible>
            <Card>
              <CardHeader className="pb-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                  >
                    <CardTitle className="text-lg">
                      Off your desk ({buckets.recentlyClosed.length + buckets.olderClosedCount})
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-2">
                  {buckets.recentlyClosed.map((row) => (
                    <ClosedItem
                      key={row.id}
                      row={row}
                      people={peopleQuery.data}
                      trail={trails[row.id] ?? []}
                      trailUnavailable={trailUnavailable}
                    />
                  ))}
                  {buckets.olderClosedCount > 0 && (
                    <p className="pt-1 text-xs text-muted-foreground">
                      {buckets.olderClosedCount === 1
                        ? '1 older item closed more than a month ago is not listed.'
                        : `${buckets.olderClosedCount} older items closed more than a month ago are not listed.`}
                    </p>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* ── Empty — claimed ONLY when the probe agrees ───────────────────── */}
        {!loading && nothingToShow && verdict.kind === 'empty' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-medium">Nothing has been handed to you.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                We checked, and your desk is genuinely clear. Work appears here the
                moment somebody hands you a page to look after, and you will be
                asked to accept it before it counts as yours.
              </p>
            </CardContent>
          </Card>
        )}

        {/* An empty screen we could NOT confirm says so, and says nothing more. */}
        {!loading && nothingToShow && verdict.kind === 'ok' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-medium">Nothing open on your desk.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Anything handed to you will appear here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/*
        ── The one dialog ─────────────────────────────────────────────────
        Mounted only while something is being asked, and KEYED on the item and
        the question. That key is what clears the box between uses: React
        remounts on a key change, so the previous item's note cannot follow you
        into the next one. (An effect that reset the field on close would do the
        same thing and is exactly what react-hooks/set-state-in-effect exists to
        stop.)
      */}
      {dialog && (
        <NoteDialog
          key={`${dialog.kind}:${dialog.row.id}`}
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          busy={busyIds.size > 0}
          {...DIALOG_COPY[dialog.kind]}
          onConfirm={(text) => {
            const row = dialog.row;
            switch (dialog.kind) {
              case 'decline':
                void run(
                  row,
                  () => respondToHandover(row.id, 'declined', text.trim()),
                  'Declined. They have been told.',
                );
                return;
              case 'progress':
                // The row's CURRENT server timestamp, so the check afterwards
                // compares the database against itself and never against this
                // browser's clock.
                void run(
                  row,
                  () => postProgress(row.id, text.trim(), row.last_activity_at),
                  'Update posted.',
                );
                return;
              case 'done':
                void run(row, () => completeHandover(row.id, text), 'Marked done.');
            }
          }}
        />
      )}
    </ContentLayout>
  );
}
