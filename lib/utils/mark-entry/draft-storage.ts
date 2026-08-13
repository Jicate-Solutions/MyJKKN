/**
 * Local draft for CIA mark entry.
 *
 * Entry spans a long session with 50–60 learners and an unreliable network, so
 * every keystroke is mirrored to localStorage — no network, so it survives an
 * outage, a crash, a closed tab or a sleeping laptop.
 *
 * Three behaviours that are load-bearing (ported verbatim from the COE screen,
 * where each one was a bug first):
 *   - Written ONLY after the user types (dirty flag). Otherwise freshly loaded
 *     database values masquerade as a draft and the banner cries wolf.
 *   - NEVER auto-applied over database values. Always offered back through a
 *     banner with Restore / Discard.
 *   - Cleared on a SUCCESSFUL save; deliberately KEPT on a failed or partial one.
 */

import type { MarkEntryDraft } from '@/types/mark-entry';

const PREFIX = 'myjkkn:me-draft';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DraftKeyParts {
  examSessionId: string;
  settingId: string;
  ciaRound: number;
  courseCode: string;
}

export function draftKey({ examSessionId, settingId, ciaRound, courseCode }: DraftKeyParts): string {
  return `${PREFIX}:${examSessionId}:${settingId}:${ciaRound}:${courseCode}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

export function readDraft(parts: DraftKeyParts): MarkEntryDraft | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(draftKey(parts));
    if (!raw) return null;
    const draft = JSON.parse(raw) as MarkEntryDraft;
    // Expire silently — a three-week-old draft is noise, not a rescue.
    if (Date.now() - new Date(draft.saved_at).getTime() > MAX_AGE_MS) {
      window.localStorage.removeItem(draftKey(parts));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeDraft(parts: DraftKeyParts, draft: Omit<MarkEntryDraft, 'saved_at'>): void {
  if (!isBrowser()) return;
  try {
    const payload: MarkEntryDraft = { ...draft, saved_at: new Date().toISOString() };
    window.localStorage.setItem(draftKey(parts), JSON.stringify(payload));
  } catch {
    // Quota or private-mode failure — entry must not break because the mirror did.
  }
}

export function clearDraft(parts: DraftKeyParts): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(draftKey(parts));
  } catch {
    /* ignore */
  }
}

/** "13-08-2026 02:15" — the format the restore banner shows. */
export function formatDraftTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
