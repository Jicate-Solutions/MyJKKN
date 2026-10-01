'use client';

// components/shared/mention-composer.tsx
//
// The "@" tagging composer, and the matching read-side renderer. Extracted
// VERBATIM from comment-thread-panel.tsx (2026-09-24) so a third thread — the
// recruitment candidate discussion — could tag people without a second
// hand-maintained copy of the parsing, the menu, the keyboard handling and the
// highlight layer. comment-thread-panel.tsx now imports these.
//
// It owns no data and knows no table: `peopleSearch` says who may be tagged and
// `onSubmit` receives the body plus the ids of the people whose "@Name" is
// still in the text. Everything about WHO is notified, and what a tag grants,
// belongs to the caller.

import { useEffect, useRef, useState } from 'react';
import { AtSign, Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MAX_COMMENT_BODY } from '@/lib/services/shared/comment-threads';

/** Someone who can be tagged, as the tag picker lists them. */
export interface TaggablePerson {
  id: string;
  name: string;
  subtitle?: string | null;
}

/**
 * The "@query" being typed immediately before the caret, if any.
 *
 * Only a single word is matched: the directory searches first name, last name
 * and email, so "@raj" is enough to find "MISS. RAJATHI S", and stopping at a
 * space is what lets an ordinary "@" in a sentence ("meet @ 4pm") close the
 * menu the moment the writer moves on.
 */
export function activeMention(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|[\s(])@([^\s@]{0,40})$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

export function MentionComposer({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
  peopleSearch,
  maxLength = MAX_COMMENT_BODY,
  /** Tail of the "Will notify …" line — say what a tag does in THIS thread. */
  notifyHint = 'they can see and reply in this thread.',
  rows = 3,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (body: string, mentionIds?: string[]) => Promise<unknown>;
  onCancel?: () => void;
  peopleSearch?: (query: string) => Promise<TaggablePerson[]>;
  maxLength?: number;
  notifyHint?: string;
  rows?: number;
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
  const tooLong = trimmed.length > maxLength;
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
            {'​'}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          rows={rows}
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
            {trimmed.length} characters — the limit is {maxLength}.
          </span>
        ) : tagged.length > 0 ? (
          <span className="mr-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <AtSign className="h-3 w-3" />
            Will notify {tagged.map((p) => p.name).join(', ')} — {notifyHint}
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

/**
 * Renders a posted comment with every "@Name" of a person actually tagged on it
 * highlighted. Only names in `names` are highlighted — an "@" someone typed
 * without picking a person from the menu tagged nobody, and styling it like a
 * tag would say otherwise.
 */
export function MentionText({ body, names }: { body: string; names: string[] }) {
  const present = names.filter(Boolean);
  if (present.length === 0) return <>{body}</>;
  const escaped = present
    .slice()
    .sort((x, y) => y.length - x.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') && present.includes(part.slice(1)) ? (
          <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
