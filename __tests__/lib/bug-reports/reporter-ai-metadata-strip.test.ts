import { describe, it, expect } from 'vitest';
import { stripAiMetadata } from '@/lib/api/bug-reports/handlers/report';

// ---------------------------------------------------------------------------
// GET /api/bug-reports/[id] serves BOTH the admin detail page and the
// reporter's own /my-bug-reports/[id], and it returns the whole
// bug_reports_with_details row. The reporter's SCREEN has never rendered the AI
// keys, but until the strip landed the raw briefing — severity, root cause, fix
// steps — and the duplicate verdict travelled inside their page data. That was
// 8 reports' worth; the hourly producer makes it every open report.
//
// The route picks the branch from the caller's profile role, which needs a
// logged-in session to exercise end to end, and no test account owns a bug
// report that carries AI text. So the strip itself is pinned here: it is a pure
// function, and these are the cases that actually matter.
// ---------------------------------------------------------------------------

const row = {
  id: 'b1',
  display_id: 'BUG-006275',
  description: 'Attendance page shows No Classes Found',
  metadata: {
    userAgent: 'Mozilla/5.0',
    screenResolution: '1920x1080',
    viewport: '1920x947',
    ai_triage: {
      summary: 'A faculty member assigned four hours sees No Classes Found',
      severity: 'high',
      root_cause: 'timetable_entries filtered by a stale academic session',
      fix_steps: ['check the session filter', 'widen the date window']
    },
    ai_duplicate_check: { verdict: 'distinct', canonical_display_id: null },
    ai_reverify: { outcome: 'still_broken' }
  }
};

describe('reporter-facing bug report — AI metadata strip', () => {
  it('removes every ai_ key and keeps the technical details the reporter page shows', () => {
    const safe = stripAiMetadata(row) as typeof row;
    const keys = Object.keys(safe.metadata);
    expect(keys.sort()).toEqual(['screenResolution', 'userAgent', 'viewport']);
    expect(JSON.stringify(safe)).not.toContain('stale academic session');
    expect(JSON.stringify(safe)).not.toContain('fix_steps');
  });

  it('strips any FUTURE ai_ key, not just the three that exist today', () => {
    const withNewKey = {
      metadata: { userAgent: 'x', ai_something_invented_later: { secret: 'leak' } }
    };
    const safe = stripAiMetadata(withNewKey) as typeof withNewKey;
    expect(Object.keys(safe.metadata)).toEqual(['userAgent']);
  });

  it('leaves the original row untouched — the admin branch returns it unchanged', () => {
    stripAiMetadata(row);
    expect((row.metadata as any).ai_triage.severity).toBe('high');
  });

  it('survives a row with no metadata, null metadata, or an array', () => {
    expect(stripAiMetadata({ id: 'a' } as any)).toEqual({ id: 'a' });
    expect(stripAiMetadata({ metadata: null } as any)).toEqual({ metadata: null });
    const arr = { metadata: ['ai_triage'] } as any;
    expect(stripAiMetadata(arr)).toEqual(arr);
  });

  it('keeps a key that merely CONTAINS ai_ but does not start with it', () => {
    const r = { metadata: { retained_ai_note: 'keep me', ai_triage: { x: 1 } } } as any;
    expect(Object.keys(stripAiMetadata(r).metadata)).toEqual(['retained_ai_note']);
  });
});
