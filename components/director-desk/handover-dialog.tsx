'use client';

// ============================================================================
// The hand-over dialog — one screen, six fields, no second step.
//
// The person using this is a Director standing on a page he wants someone else
// to own, and he is in a hurry. So: the route and the title are already filled
// in, the due date already has a sensible value, and the only thing he MUST do
// is name a person. Everything else has a default that is safe.
//
// The four places this refuses to be clever:
//
//  1. NO KEY, NO SUBMIT. If the page declares no permission of its own, the
//     dialog says so in plain words and disables submit. It does not invent a
//     key and it does not send an empty array — a handover of nothing is worse
//     than no handover, because it looks delegated on both desks.
//
//  2. A GATE A GRANT CANNOT SATISFY IS REFUSED UP FRONT. If the page is behind
//     SuperAdminOnly (112 files) or an admin-role guard, no key, level or person
//     makes the handover work. The dialog says so before the Director picks
//     anyone, and never reaches the success screen. Round 1 resolved
//     /hr/admin/payroll to ['hr.dashboard.view'] — unwalled, legal at Watch,
//     accepted by both server refusals, green "Handed over" screen, and the
//     receiver got access-denied.
//
//  3. A LEVEL THAT CARRIES NONE OF THE KEYS BLOCKS SUBMIT. The warning used to
//     be advisory while `canSubmit` ignored it, so a Director could send a
//     handover that grants nothing. The server rejects it too — but a form that
//     lets you press a button it knows will fail is a form that taught you
//     nothing until you pressed it.
//
//  4. SERVER ERRORS ARE SHOWN VERBATIM. fn_director_handover_create names the
//     exact keys it refused and why. Collapsing that into "something went
//     wrong" is how a Director ends up believing he handed over a page that is
//     permanently walled. The raw sentence is more use to him than any
//     paraphrase we could write, so it is displayed as-is.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Search, ShieldAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

import {
  ACCESS_LEVELS,
  deriveHandoverTitle,
  keysNotAllowedAtLevel,
  lowestLevelThatCarries,
  normalizePathname,
  resolveRoutePermissionKeys,
  type HandoverAccessLevel,
} from './route-permission-resolver';

const LOG = 'director-desk/handover';

interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  designation: string | null;
  institution_name: string | null;
}

interface HandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The route the Director is standing on. */
  pathname: string;
}

/**
 * yyyy-mm-dd from the browser's LOCAL calendar, not UTC.
 *
 * toISOString() would be a real bug here, not a nicety: the server compares
 * against (now() AT TIME ZONE 'Asia/Kolkata')::date, and between midnight and
 * 05:29 IST the UTC date is still yesterday. A Director working at 2am would
 * be offered a minimum date the server then rejects as "in the past".
 */
function isoLocalDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Today + n days, as the yyyy-mm-dd an <input type="date"> wants. */
function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoLocalDate(d);
}

function todayIso(): string {
  return isoLocalDate(new Date());
}

export function HandoverDialog({ open, onOpenChange, pathname }: HandoverDialogProps) {
  const route = normalizePathname(pathname);
  const resolution = useMemo(() => resolveRoutePermissionKeys(route), [route]);
  // `blocked` and `hasKeys` are not the same refusal and must not be collapsed.
  // No key = "there is nothing to hand over, just send the link". Blocked = "no
  // handover can ever open this page, and Role Management is the only route".
  const blocked = resolution.blocked !== null;
  const hasKeys = !blocked && resolution.keys.length > 0;

  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [level, setLevel] = useState<HandoverAccessLevel>('update');
  const [dueDate, setDueDate] = useState(isoDatePlusDays(7));
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset every time the dialog opens, so a second handover from the same page
  // never inherits the previous one's receiver or note.
  useEffect(() => {
    if (!open) return;
    setTitle(
      deriveHandoverTitle(route, typeof document !== 'undefined' ? document.title : null)
    );
    setQuery('');
    setResults([]);
    setSearchError(null);
    setPerson(null);
    setLevel('update');
    setDueDate(isoDatePlusDays(7));
    setNote('');
    setSubmitError(null);
    setCreatedId(null);
    setCopied(false);
  }, [open, route]);

  // ---- person search (by name — never by id) -------------------------------
  const searchSeq = useRef(0);
  useEffect(() => {
    if (!open || person) return;
    const term = query.trim();
    if (term.length > 0 && term.length < 2) {
      setResults([]);
      return;
    }

    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const supabase = createClientSupabaseClient();
        // The RPC is new and absent from the generated types (house pattern).
        const { data, error } = await (supabase as any).rpc('fn_handover_people_search', {
          p_query: term,
        });
        if (seq !== searchSeq.current) return;
        if (error) throw error;
        setResults((data ?? []) as Person[]);
      } catch (err: unknown) {
        if (seq !== searchSeq.current) return;
        logger.error(LOG, 'people search failed', err);
        setResults([]);
        setSearchError(
          'Could not look people up just now. Check you are still signed in, then try again.'
        );
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [open, query, person]);

  // ---- the access-level hint (advisory only; the server decides) -----------
  const keysTooHigh = useMemo(
    () => (hasKeys ? keysNotAllowedAtLevel(resolution.keys, level) : []),
    [hasKeys, resolution.keys, level]
  );
  const suggestedLevel = useMemo(
    () => (hasKeys ? lowestLevelThatCarries(resolution.keys) : 'full'),
    [hasKeys, resolution.keys]
  );

  const dueDateInPast = dueDate < todayIso();
  const canSubmit =
    hasKeys &&
    !blocked &&
    // DEFECT C3. This used to be advisory only: the amber warning appeared and
    // the button stayed live, so a handover whose keys are all dead at the
    // chosen level was submitted, accepted by an older server build, and
    // reported as success. The server (fn_director_handover_create, spine
    // migration 20260811100200) does reject it by name — this stops the
    // Director from having to discover that by pressing the button, and stops
    // the dialog from ever being the half that says yes.
    keysTooHigh.length === 0 &&
    !!person &&
    !!title.trim() &&
    !!dueDate &&
    !dueDateInPast &&
    !submitting;

  const shareLink =
    typeof window !== 'undefined' ? `${window.location.origin}${route}` : route;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.warn(LOG, 'clipboard write failed', err);
    }
  }, [shareLink]);

  async function handleSubmit() {
    if (!canSubmit || !person) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_director_handover_create', {
        p_route: route,
        p_title: title.trim(),
        p_permission_keys: resolution.keys,
        p_grantee_user_id: person.id,
        p_due_date: dueDate,
        p_access_level: level,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setCreatedId(row?.id ?? 'created');
      logger.info(LOG, 'handover created', { route, level, keys: resolution.keys });
    } catch (err: unknown) {
      // VERBATIM. fn_director_handover_create names the keys it refused and the
      // reason; that sentence is the answer to "why can I not hand this over",
      // and no generic message can replace it.
      const e = err as { message?: string; details?: string; hint?: string };
      const verbatim = (e?.message || e?.details || e?.hint || '').trim();
      logger.error(LOG, 'handover create failed', err);
      setSubmitError(
        verbatim ||
          'The handover was not saved and the server did not say why. Nothing was changed — try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {blocked ? (
          /*
            DEFECT C2. This page's real gate is SuperAdminOnly, an admin-role
            guard, or one this control cannot read. A handover row grants
            permission keys; it cannot grant profiles.is_super_admin and it
            cannot grant a role. So there is no key, no level and no person that
            makes this work — and the honest thing is to say so here, with the
            reason, rather than take a name and a date and show a green screen.
          */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                This page cannot be handed over
              </DialogTitle>
              <DialogDescription className="break-all font-mono text-xs">
                {route}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm text-destructive/90">{resolution.blockedReason}</p>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : createdId ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-600" />
                Handed over
              </DialogTitle>
              <DialogDescription>
                {person?.full_name || 'They'} will be asked to accept or decline. You will
                see the answer on your desk.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{title}</div>
              <div className="mt-1 break-all text-xs text-muted-foreground">{shareLink}</div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copied ? 'Link copied' : 'Copy the link I just sent them'}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Hand this page over</DialogTitle>
              <DialogDescription>
                Whoever you pick can open this page until the work is done or the date
                below passes — whichever comes first.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* ---- what is being handed over ------------------------------ */}
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  The page
                </div>
                <div className="mt-0.5 break-all font-mono text-xs">{route}</div>
                {hasKeys ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Unlocked by{' '}
                    <span className="font-mono">{resolution.keys.join(', ')}</span>
                    {resolution.inherited && resolution.matchedAt ? (
                      <>
                        {' '}
                        — declared on{' '}
                        <span className="font-mono">{resolution.matchedAt}</span>, which
                        this page sits under.
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      This page has no permission of its own, so there is nothing to hand
                      over. Anyone signed in can already open it — just send them the
                      link.
                    </span>
                  </div>
                )}
              </div>

              {/* ---- title -------------------------------------------------- */}
              <div className="space-y-1.5">
                <Label htmlFor="handover-title">What is the job?</Label>
                <Input
                  id="handover-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Close out the pending approvals"
                  disabled={!hasKeys}
                />
              </div>

              {/* ---- person ------------------------------------------------- */}
              <div className="space-y-1.5">
                <Label htmlFor="handover-person">Who is it for?</Label>
                {person ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {person.full_name || person.email}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[person.designation, person.institution_name, person.email]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPerson(null);
                        setQuery('');
                      }}
                      aria-label="Pick someone else"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="handover-person"
                        className="pl-8"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Start typing their name"
                        autoComplete="off"
                        disabled={!hasKeys}
                      />
                      {searching ? (
                        <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>

                    {searchError ? (
                      <p className="text-xs text-destructive">{searchError}</p>
                    ) : null}

                    {results.length > 0 ? (
                      <ul className="max-h-44 overflow-y-auto rounded-md border">
                        {results.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setPerson(p)}
                              className="w-full px-3 py-2 text-left hover:bg-accent"
                            >
                              <div className="truncate text-sm font-medium">
                                {p.full_name || p.email}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {[p.designation, p.institution_name, p.email]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {!searching &&
                    !searchError &&
                    query.trim().length >= 2 &&
                    results.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nobody by that name. Try part of their email address.
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              {/* ---- access level ------------------------------------------- */}
              <div className="space-y-1.5">
                <Label>What can they do?</Label>
                <div className="grid gap-2">
                  {ACCESS_LEVELS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={!hasKeys}
                      onClick={() => setLevel(opt.value)}
                      aria-pressed={level === opt.value}
                      className={`rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                        level === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>

                {keysTooHigh.length > 0 ? (
                  /*
                    Blocking, not advisory (defect C3). The server refuses this
                    too — but a form that lets you press a button it already
                    knows will fail teaches you nothing until you press it.
                  */
                  <p role="alert" className="text-xs text-destructive">
                    At this level, <span className="font-mono">
                      {keysTooHigh.join(', ')}
                    </span>{' '}
                    would not be handed over
                    {keysTooHigh.length === resolution.keys.length
                      ? ' — so they would get nothing on this page'
                      : ''}
                    . Choose{' '}
                    <span className="font-medium">
                      {ACCESS_LEVELS.find((l) => l.value === suggestedLevel)?.label}
                    </span>{' '}
                    to hand it over.
                  </p>
                ) : null}
              </div>

              {/* ---- due date ----------------------------------------------- */}
              <div className="space-y-1.5">
                <Label htmlFor="handover-due">By when?</Label>
                <Input
                  id="handover-due"
                  type="date"
                  value={dueDate}
                  min={todayIso()}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={!hasKeys}
                />
                {dueDateInPast ? (
                  <p className="text-xs text-destructive">
                    That date has passed. Pick today or later.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Their access ends on this date, or when they mark it done.
                  </p>
                )}
              </div>

              {/* ---- note --------------------------------------------------- */}
              <div className="space-y-1.5">
                <Label htmlFor="handover-note">Anything to add? (optional)</Label>
                <Textarea
                  id="handover-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Context they will need"
                  disabled={!hasKeys}
                />
              </div>

              {submitError ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <div className="text-sm font-medium text-destructive">
                        This was not handed over
                      </div>
                      {/* Verbatim, on purpose — see the note at the top of this file. */}
                      <p className="mt-1 whitespace-pre-wrap text-xs text-destructive/90">
                        {submitError}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Hand it over
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
