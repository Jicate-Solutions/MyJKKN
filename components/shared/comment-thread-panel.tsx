'use client';

// components/shared/comment-thread-panel.tsx
//
// The presentation of a two-level comment thread: a composer, a list of root
// comments with their replies, per-thread resolve, and inline edit/delete. It
// owns no data and knows no table — every write is a promise handed in by the
// caller, and every authority decision arrives as a boolean.
//
// It exists because two features need the same panel with opposite audiences:
//
//   EventReviewCommentsCard       an authority's remark on an event, hidden
//                                 from the students it is about
//   ReservationCommentsCard       an approver's note on a room booking, shown
//                                 to the booker on purpose
//
// Their gates, their tables and their SQL functions are all separate and stay
// separate (see lib/services/shared/comment-threads.ts for why). What they
// share is 300 lines of JSX, and a second hand-maintained copy of that is how
// one of them quietly stops matching the other.
//
// ── The two authority props ────────────────────────────────────────────────
// `canResolveAny` and `canDeleteAny` are separate and must stay separate. In
// both features an admin-class role may CLOSE any thread while only a super
// admin may DELETE somebody else's words, and the DELETE policies say exactly
// that. Collapsing them into one "isAdmin" would paint a Delete button that the
// database then refuses on every click.

import { useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  CornerDownRight,
  Loader2,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  AtSign,
  X,
} from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { MAX_COMMENT_BODY } from '@/lib/services/shared/comment-threads';
import type { ThreadComment } from '@/lib/services/shared/comment-threads';

/** Someone who can be tagged, as the tag picker lists them. */
export interface TaggablePerson {
  id: string;
  name: string;
  subtitle?: string | null;
}

/** Every write the panel can ask for. Reject to keep the user's text. */
export interface CommentThreadHandlers {
  /** mentionIds is only ever passed when the panel was given `peopleSearch`. */
  onPost: (body: string, mentionIds?: string[]) => Promise<unknown>;
  onReply: (parentId: string, body: string, mentionIds?: string[]) => Promise<unknown>;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onResolve: (id: string, resolved: boolean) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /**
   * Remove one tag from a comment, revoking the access it granted; the comment
   * stays. Omit it and tags are shown without a remove control.
   */
  onUntag?: (commentId: string, userId: string) => Promise<unknown>;
  /**
   * Re-send one tag's alert — finishes one that failed, or sends a reminder.
   * Omit it and tags show no Resend control.
   */
  onResendTag?: (commentId: string, userId: string) => Promise<unknown>;
}

export interface CommentThreadPanelProps {
  title: string;
  description: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Placeholder for the top composer — say what this channel is for. */
  placeholder: string;
  /** Placeholder for a reply box. */
  replyPlaceholder?: string;
  /** Shown when there is nothing at all. */
  emptyText: string;
  /** Shown when every thread is closed. */
  allResolvedText: string;
  /** Badge on an open thread, e.g. "Awaiting reply". */
  openLabel: string;
  threads: ThreadComment[];
  isLoading: boolean;
  isError?: boolean;
  errorText?: string | null;
  /** The viewer's profile id, for "You" and for the author-only controls. */
  myId: string | null;
  /** May close a thread they did not raise. */
  canResolveAny: boolean;
  /** May delete a comment they did not write. */
  canDeleteAny: boolean;
  handlers: CommentThreadHandlers;
  /**
   * Turns tagging ON. Omit it and the composer has no tag control at all.
   */
  peopleSearch?: (query: string) => Promise<TaggablePerson[]>;
}

/** "just now", "2h ago", "12 Sep" — a thread is read by recency. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** profiles.role is a snake_case key; render it as words. */
function roleLabel(role: string | null): string | null {
  if (!role) return null;
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ── Composer ────────────────────────────────────────────────────────────────

/**
 * The "@query" being typed immediately before the caret, if any.
 *
 * Only a single word is matched: the directory searches first name, last name
 * and email, so "@raj" is enough to find "MISS. RAJATHI S", and stopping at a
 * space is what lets an ordinary "@" in a sentence ("meet @ 4pm") close the
 * menu the moment the writer moves on.
 */
function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|[\s(])@([^\s@]{0,40})$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

function Composer({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
  peopleSearch,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (body: string, mentionIds?: string[]) => Promise<unknown>;
  onCancel?: () => void;
  peopleSearch?: (query: string) => Promise<TaggablePerson[]>;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  // Everyone picked from the menu. Who is ACTUALLY tagged is derived below from
  // whether their "@Name" is still in the text — deleting the name untags them,
  // with no separate list to keep in sync.
  const [picked, setPicked] = useState<TaggablePerson[]>([]);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  // The "@" position the writer dismissed with Escape, so moving the caret
  // does not immediately reopen the menu they just closed.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [results, setResults] = useState<TaggablePerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX_COMMENT_BODY;
  const tagged = picked.filter((p) => body.includes(`@${p.name}`));
  const menuOpen = !!peopleSearch && !!mention;

  const syncMention = (text: string, caret: number) => {
    if (!peopleSearch) return;
    const next = activeMention(text, caret);
    if (next && next.start === dismissedAt) {
      setMention(null);
      return;
    }
    setMention((cur) =>
      cur && next && cur.start === next.start && cur.query === next.query ? cur : next,
    );
  };

  const query = mention?.query ?? null;
  useEffect(() => {
    setHighlight(0);
    if (!peopleSearch || query === null || query.length < 2) {
      setResults([]);
      setFailed(false);
      setSearching(false);
      return;
    }
    // Debounced, and a stale answer is dropped: typing "ra" then "raj" quickly
    // must not let the slower "ra" response overwrite the "raj" one.
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await peopleSearch(query);
        if (!cancelled) {
          setResults(hits.slice(0, 8));
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, peopleSearch]);

  const pick = (person: TaggablePerson) => {
    const el = textareaRef.current;
    if (!mention || !el) return;
    const caret = el.selectionStart ?? body.length;
    const insert = `@${person.name} `;
    const next = body.slice(0, mention.start) + insert + body.slice(caret);
    const nextCaret = mention.start + insert.length;
    setBody(next);
    setPicked((cur) => (cur.some((p) => p.id === person.id) ? cur : [...cur, person]));
    setMention(null);
    // Put the caret after the inserted name once React has written the value.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };

  // The box is cleared only AFTER the write lands. Clearing on click would
  // throw away a paragraph the moment the network hiccups, and the error toast
  // would be the only trace it ever existed. The rejection is swallowed because
  // the caller's mutation has already explained it.
  const submit = async () => {
    if (!trimmed || tooLong || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed, tagged.length > 0 ? tagged.map((p) => p.id) : undefined);
      setBody('');
      setPicked([]);
      setMention(null);
      setDismissedAt(null);
    } catch {
      /* text stays put; the toast says why */
    } finally {
      setBusy(false);
    }
  };

  // What the highlight layer paints: the same text, with each tagged "@Name"
  // wrapped so it can carry a background. Longest names first, so "@Raj Kumar"
  // is not split by a shorter "@Raj".
  const highlighted = (() => {
    const names = tagged.map((p) => p.name).sort((x, y) => y.length - x.length);
    if (names.length === 0) return body;
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g')).map((part, i) =>
      part.startsWith('@') && names.includes(part.slice(1)) ? (
        <mark key={i} className="rounded bg-primary/15 text-transparent">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  })();

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Highlight layer. A <textarea> cannot style part of its own text, so
            this div sits exactly behind it — same border width, padding, font
            and wrapping — with its text transparent. Only the <mark>
            backgrounds show through the textarea (which is bg-transparent), so
            a tagged name reads as highlighted while the real, editable text is
            still the textarea's. Scroll is mirrored in onScroll below. */}
        {peopleSearch && (
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm text-transparent"
          >
            {highlighted}
            {/* A trailing newline in a textarea still takes a line; without this
                the layer is one line short and the last highlight drifts. */}
            {'\u200b'}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          rows={3}
          autoFocus={autoFocus}
          placeholder={peopleSearch ? `${placeholder} Type @ to tag team members.` : placeholder}
          value={body}
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            if (dismissedAt !== null && next.length < body.length) setDismissedAt(null);
            syncMention(next, e.target.selectionStart ?? next.length);
          }}
          // Caret moved by click or arrow keys — the "@word" under it may have changed.
          onSelect={(e) =>
            syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
          }
          onBlur={() => setMention(null)}
          onKeyDown={(e) => {
            if (menuOpen && mention) {
              if (e.key === 'Escape') {
                e.preventDefault();
                setDismissedAt(mention.start);
                setMention(null);
                return;
              }
              if (results.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight((h) => (h + 1) % results.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight((h) => (h - 1 + results.length) % results.length);
                  return;
                }
                // Enter picks while the menu is open; otherwise it stays a newline.
                if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
                  e.preventDefault();
                  pick(results[Math.min(highlight, results.length - 1)]);
                  return;
                }
              }
            }
            // Ctrl/Cmd+Enter posts. Plain Enter must stay a newline — these are
            // paragraphs, not chat lines.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
          className="relative text-sm"
        />

        {/* Suggestions open right under the text, WhatsApp-style, instead of a
            separate search box. onMouseDown + preventDefault keeps the textarea
            focused, so onBlur does not close the menu before the click lands. */}
        {menuOpen && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {query !== null && query.length < 2 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Keep typing a name to tag team members…
              </p>
            ) : failed ? (
              <p className="px-2 py-1.5 text-xs text-destructive">
                The team member directory could not be searched.
              </p>
            ) : searching && results.length === 0 ? (
              <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                No team members match &ldquo;{query}&rdquo;.
              </p>
            ) : (
              results.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(p);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left ${
                    i === highlight ? 'bg-accent text-accent-foreground' : ''
                  }`}
                >
                  <span className="text-sm">{p.name}</span>
                  {p.subtitle && (
                    <span className="text-[11px] text-muted-foreground">{p.subtitle}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {tooLong ? (
          <span className="mr-auto text-xs text-destructive">
            {trimmed.length} characters — the limit is {MAX_COMMENT_BODY}.
          </span>
        ) : tagged.length > 0 ? (
          <span className="mr-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <AtSign className="h-3 w-3" />
            Will notify {tagged.map((p) => p.name).join(', ')} — they can see and reply in this
            thread.
          </span>
        ) : null}
        {onCancel && (
          <Button variant="ghost" size="sm" className="h-8" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={submit}
          disabled={!trimmed || tooLong || busy}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ── One comment (root or reply) ─────────────────────────────────────────────

/**
 * Renders a comment with every "@Name" of a person actually tagged on it
 * highlighted. Only names in `mentions` are highlighted — an "@" someone typed
 * without picking a person from the menu tagged nobody, and styling it like a
 * tag would say otherwise.
 */
function MentionText({ body, mentions }: { body: string; mentions?: ThreadComment['mentions'] }) {
  const names = (mentions ?? []).map((m) => m.name).filter(Boolean);
  if (names.length === 0) return <>{body}</>;
  const escaped = names
    .sort((x, y) => y.length - x.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1)) ? (
          <span
            key={i}
            className="rounded bg-primary/10 px-0.5 font-medium text-primary"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Who is tagged on a comment. The author gets, per person:
 *  - Resend: a tag whose alert never went out is marked "not notified", and
 *    Resend finishes it; on a notified tag it sends a reminder.
 *  - ×: removing a tag revokes the access it granted, and the comment —
 *    including the "@Name" text — stays as written.
 */
function TagList({
  comment,
  isAuthor,
  onUntag,
  onResendTag,
}: {
  comment: ThreadComment;
  isAuthor: boolean;
  onUntag?: (commentId: string, userId: string) => Promise<unknown>;
  onResendTag?: (commentId: string, userId: string) => Promise<unknown>;
}) {
  // One action at a time per comment: "<userId>:untag" or "<userId>:resend".
  const [busy, setBusy] = useState<string | null>(null);
  const mentions = comment.mentions ?? [];
  if (mentions.length === 0) return null;

  const act = async (
    userId: string,
    kind: 'untag' | 'resend',
    fn?: (commentId: string, userId: string) => Promise<unknown>,
  ) => {
    if (!fn) return;
    setBusy(`${userId}:${kind}`);
    try {
      await fn(comment.id, userId);
    } catch {
      /* the toast says why; the tag stays as it was */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      <AtSign className="h-3 w-3" />
      <span>Tagged:</span>
      {mentions.map((m) => {
        // Only the author learns whether an alert went out — it is theirs to fix.
        const pending = isAuthor && m.notified === false;
        return (
          <Badge
            key={m.id}
            variant="secondary"
            className={`h-5 gap-0.5 px-1.5 text-[11px] font-normal ${
              pending ? 'border border-amber-500/60 text-amber-800 dark:text-amber-300' : ''
            }`}
          >
            {m.name}
            {pending && <span className="ml-0.5">· not notified</span>}
            {isAuthor && onResendTag && (
              <button
                type="button"
                className={`ml-1 rounded-sm underline-offset-2 hover:underline disabled:opacity-40 ${
                  pending ? 'font-medium' : 'opacity-70 hover:opacity-100'
                }`}
                title={
                  pending
                    ? `Send ${m.name} the alert that did not go out`
                    : `Remind ${m.name} about this comment`
                }
                disabled={busy !== null}
                onClick={() => act(m.id, 'resend', onResendTag)}
              >
                {busy === `${m.id}:resend` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : pending ? (
                  'Resend'
                ) : (
                  <RotateCcw className="h-3 w-3" aria-label={`Remind ${m.name}`} />
                )}
              </button>
            )}
            {isAuthor && onUntag && (
              <button
                type="button"
                className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 disabled:opacity-40"
                aria-label={`Untag ${m.name}`}
                title={`Untag ${m.name} — removes their access to this discussion`}
                disabled={busy !== null}
                onClick={() => act(m.id, 'untag', onUntag)}
              >
                {busy === `${m.id}:untag` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            )}
          </Badge>
        );
      })}
    </div>
  );
}

function CommentBody({
  comment,
  isMine,
  canDelete,
  onEdit,
  onRequestDelete,
  onUntag,
  onResendTag,
}: {
  comment: ThreadComment;
  isMine: boolean;
  canDelete: boolean;
  onEdit: (id: string, body: string) => Promise<unknown>;
  onRequestDelete: (comment: ThreadComment) => void;
  onUntag?: (commentId: string, userId: string) => Promise<unknown>;
  onResendTag?: (commentId: string, userId: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  const label = roleLabel(comment.author.role);

  const save = async () => {
    const next = draft.trim();
    if (!next || next === comment.body) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(comment.id, next);
      setEditing(false);
    } catch {
      /* the toast says why; keep the editor open with their text */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-foreground">
          {isMine ? 'You' : comment.author.name}
        </span>
        {label && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
            {label}
          </Badge>
        )}
        <span className="text-muted-foreground">{timeAgo(comment.created_at)}</span>
        {comment.updated_at !== comment.created_at && (
          <span className="text-muted-foreground">· edited</span>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={saving}
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-7" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          <MentionText body={comment.body} mentions={comment.mentions} />
        </p>
      )}

      {!editing && (
        <TagList
          comment={comment}
          isAuthor={isMine}
          onUntag={onUntag}
          onResendTag={onResendTag}
        />
      )}


      {!editing && (isMine || canDelete) && (
        <div className="flex gap-1">
          {isMine && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3" /> Edit
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => onRequestDelete(comment)}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── One thread ──────────────────────────────────────────────────────────────

function Thread({
  thread,
  myId,
  canResolveAny,
  canDeleteAny,
  openLabel,
  replyPlaceholder,
  handlers,
  onRequestDelete,
  peopleSearch,
}: {
  thread: ThreadComment;
  myId: string | null;
  canResolveAny: boolean;
  canDeleteAny: boolean;
  openLabel: string;
  replyPlaceholder: string;
  handlers: CommentThreadHandlers;
  onRequestDelete: (comment: ThreadComment) => void;
  peopleSearch?: (query: string) => Promise<TaggablePerson[]>;
}) {
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);

  const isMine = (authorId: string) => !!myId && authorId === myId;
  // Mirrors the guard trigger exactly: the person who raised it, or an admin.
  const canResolve = canResolveAny || isMine(thread.author_id);

  const toggleResolved = async () => {
    setResolving(true);
    try {
      await handlers.onResolve(thread.id, !thread.is_resolved);
    } catch {
      /* the toast says why */
    } finally {
      setResolving(false);
    }
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        thread.is_resolved ? 'border-dashed bg-muted/30' : 'bg-background'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <Badge
          variant={thread.is_resolved ? 'secondary' : 'outline'}
          className={`h-5 gap-1 px-1.5 text-[10px] ${
            thread.is_resolved ? '' : 'border-amber-500/50 text-amber-700 dark:text-amber-400'
          }`}
        >
          {thread.is_resolved ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              {thread.resolved_by_name ? `Resolved by ${thread.resolved_by_name}` : 'Resolved'}
            </>
          ) : (
            <>
              <ShieldAlert className="h-3 w-3" /> {openLabel}
            </>
          )}
        </Badge>

        {canResolve && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            disabled={resolving}
            onClick={toggleResolved}
          >
            {resolving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : thread.is_resolved ? (
              <RotateCcw className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {thread.is_resolved ? 'Reopen' : 'Mark resolved'}
          </Button>
        )}
      </div>

      <CommentBody
        comment={thread}
        isMine={isMine(thread.author_id)}
        canDelete={isMine(thread.author_id) || canDeleteAny}
        onEdit={handlers.onEdit}
        onRequestDelete={onRequestDelete}
        onUntag={handlers.onUntag}
        onResendTag={handlers.onResendTag}
      />

      {thread.replies.length > 0 && (
        <div className="mt-3 space-y-3 border-l-2 border-muted pl-3">
          {thread.replies.map((r) => (
            <CommentBody
              key={r.id}
              comment={r}
              isMine={isMine(r.author_id)}
              canDelete={isMine(r.author_id) || canDeleteAny}
              onEdit={handlers.onEdit}
              onRequestDelete={onRequestDelete}
              onUntag={handlers.onUntag}
              onResendTag={handlers.onResendTag}
            />
          ))}
        </div>
      )}

      <div className="mt-2">
        {replying ? (
          <Composer
            autoFocus
            placeholder={replyPlaceholder}
            submitLabel="Reply"
            onCancel={() => setReplying(false)}
            peopleSearch={peopleSearch}
            onSubmit={(body, mentionIds) =>
              handlers.onReply(thread.id, body, mentionIds).then((r) => {
                setReplying(false);
                return r;
              })
            }
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => setReplying(true)}
          >
            <CornerDownRight className="h-3 w-3" /> Reply
          </Button>
        )}
      </div>
    </div>
  );
}

// ── The panel ───────────────────────────────────────────────────────────────

export function CommentThreadPanel({
  title,
  description,
  icon: Icon = MessageSquare,
  placeholder,
  replyPlaceholder = 'Reply — say what you did about it.',
  emptyText,
  allResolvedText,
  openLabel,
  threads,
  isLoading,
  isError,
  errorText,
  myId,
  canResolveAny,
  canDeleteAny,
  handlers,
  peopleSearch,
}: CommentThreadPanelProps) {
  const [showResolved, setShowResolved] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ThreadComment | null>(null);

  const open = threads.filter((t) => !t.is_resolved);
  const resolved = threads.filter((t) => t.is_resolved);

  const threadProps = {
    myId,
    canResolveAny,
    canDeleteAny,
    openLabel,
    replyPlaceholder,
    handlers,
    onRequestDelete: setPendingDelete,
    peopleSearch,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {open.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
              {open.length} open
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Composer
          placeholder={placeholder}
          submitLabel="Post comment"
          onSubmit={handlers.onPost}
          peopleSearch={peopleSearch}
        />

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-4/5" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            {errorText ?? 'The comments could not be loaded.'}
          </p>
        )}

        {!isLoading && !isError && open.length === 0 && resolved.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
        )}

        {!isLoading && !isError && open.length === 0 && resolved.length > 0 && (
          <p className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {allResolvedText}
          </p>
        )}

        {open.length > 0 && (
          <div className="space-y-3">
            {open.map((t) => (
              <Thread key={t.id} thread={t} {...threadProps} />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-1.5 text-xs text-muted-foreground"
              onClick={() => setShowResolved((s) => !s)}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showResolved ? '' : '-rotate-90'}`}
              />
              {resolved.length} resolved
            </Button>
            {showResolved && (
              <div className="mt-2 space-y-3">
                {resolved.map((t) => (
                  <Thread key={t.id} thread={t} {...threadProps} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Not nested inside another dialog and not opened from a dialog's
          onOpenChange — the Radix pattern that traps pointer events. It is a
          panel-level dialog driven by one piece of state. */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && !pendingDelete.parent_id && pendingDelete.replies.length > 0
                ? `This removes the comment and all ${pendingDelete.replies.length} replies under it. It cannot be undone.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) handlers.onDelete(pendingDelete.id).catch(() => {});
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
