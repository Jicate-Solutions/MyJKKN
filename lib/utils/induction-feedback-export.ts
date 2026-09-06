// lib/utils/induction-feedback-export.ts
// Builds the coordinator-side Excel export for an induction's per-session feedback
// from the flat (learner × session) rows of fn_induction_session_feedback_detail.
// Mirrors the shape of induction-poll-export.ts. Four sheets:
//   1. Responses      — the raw long-format log, one row per response.
//   2. By Learner     — one row per learner, one column per session (the matrix
//                       coordinators scan for who rated what).
//   3. Comments       — responses that carry free text. This is the sheet people
//                       actually read; ratings without words are noise here.
//   4. Session Summary— per session: n, average, the 1★–5★ histogram, and the
//                       self-vs-kiosk split (capture bias is load-bearing — a
//                       session rated mostly via the volunteer kiosk is not a
//                       like-for-like comparison with a self-rated one).
import XLSX from '@/lib/utils/excel-compat';
import type { SessionFeedbackDetailRow } from '@/lib/services/induction/induction-service';

/** Freshers usually have no register/roll number yet — they are assigned after
 *  admission closes — so the export must not key on one. */
function learnerKey(r: SessionFeedbackDetailRow): string {
  return r.learner_id;
}

function sessionLabel(r: SessionFeedbackDetailRow): string {
  const title = r.session_title?.trim() || 'Untitled session';
  return r.day_number == null ? title : `D${r.day_number}. ${title}`;
}

function methodLabel(r: SessionFeedbackDetailRow): string {
  return r.is_self ? 'Self (own login)' : 'Volunteer kiosk';
}

function ts(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '';
}

export async function exportSessionFeedbackToExcel(
  rows: SessionFeedbackDetailRow[],
  eventName: string,
): Promise<void> {
  // Session axis keyed by id, not title: two sessions in one induction can
  // legitimately share a title. Sorted EXPLICITLY rather than by trusting the
  // caller's row order — the RPC hands back programme order, but the browser passes
  // its filtered array, and a future re-sort (by rating, by learner) would otherwise
  // scramble the matrix columns and the summary sheet.
  const DAY_LAST = Number.MAX_SAFE_INTEGER;
  const sessions = [...new Map(rows.map((r) => [r.session_id, r])).values()]
    .sort((a, b) => {
      const day = (a.day_number ?? DAY_LAST) - (b.day_number ?? DAY_LAST);
      if (day !== 0) return day;
      const at = a.session_start ? Date.parse(a.session_start) : DAY_LAST;
      const bt = b.session_start ? Date.parse(b.session_start) : DAY_LAST;
      if (at !== bt) return at - bt;
      return (a.session_title ?? '').localeCompare(b.session_title ?? '');
    });
  // Disambiguate duplicate column headers so the matrix sheet can't collapse two
  // sessions into one column.
  const headerFor = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const s of sessions) {
    const base = sessionLabel(s);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    headerFor.set(s.session_id, n === 1 ? base : `${base} (${n})`);
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Responses (long format) ──
  const log = rows.map((r) => ({
    'Day': r.day_number ?? '',
    'Session': r.session_title ?? '',
    'Session Start': ts(r.session_start),
    'Register No': r.register_number ?? '',
    'Roll No': r.roll_number ?? '',
    'Learner Name': r.learner_name ?? '',
    'Gender': r.gender ?? '',
    'Department': r.department_name ?? '',
    'Program': r.program_name ?? '',
    'Degree': r.degree_name ?? '',
    'Institution': r.institution_name ?? '',
    'College Email': r.college_email ?? '',
    'Personal Email': r.student_email ?? '',
    'Mobile': r.student_mobile ?? '',
    'Rating': r.rating,
    'Comment': r.comment ?? '',
    'Captured By': methodLabel(r),
    'Entered By': r.submitted_by_name ?? '',
    'Submitted At': ts(r.submitted_at),
    'Last Updated': ts(r.updated_at),
  }));
  const wsLog = XLSX.utils.json_to_sheet(log);
  wsLog['!cols'] = [
    { wch: 6 }, { wch: 34 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 8 },
    { wch: 30 }, { wch: 32 }, { wch: 16 }, { wch: 34 }, { wch: 30 }, { wch: 30 }, { wch: 14 },
    { wch: 8 }, { wch: 60 }, { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLog, 'Responses');

  // ── Sheet 2: By Learner (matrix) ──
  const byLearner = new Map<string, SessionFeedbackDetailRow[]>();
  for (const r of rows) {
    const k = learnerKey(r);
    const list = byLearner.get(k);
    if (list) list.push(r); else byLearner.set(k, [r]);
  }
  const matrix = [...byLearner.values()].map((list) => {
    const first = list[0];
    const row: Record<string, string | number> = {
      'Register No': first.register_number ?? '',
      'Roll No': first.roll_number ?? '',
      'Learner Name': first.learner_name ?? '',
      'Gender': first.gender ?? '',
      'Department': first.department_name ?? '',
      'Program': first.program_name ?? '',
      'Institution': first.institution_name ?? '',
      'College Email': first.college_email ?? '',
      'Mobile': first.student_mobile ?? '',
    };
    for (const s of sessions) {
      const hit = list.find((r) => r.session_id === s.session_id);
      row[headerFor.get(s.session_id)!] = hit ? hit.rating : '';
    }
    row['Sessions Rated'] = list.length;
    row['Average Rating'] = Number(
      (list.reduce((a, r) => a + r.rating, 0) / list.length).toFixed(2),
    );
    row['Comments Left'] = list.filter((r) => (r.comment ?? '').trim() !== '').length;
    return row;
  });
  const wsMatrix = XLSX.utils.json_to_sheet(matrix);
  wsMatrix['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 30 }, { wch: 32 },
    { wch: 34 }, { wch: 30 }, { wch: 14 },
    ...sessions.map(() => ({ wch: 16 })),
    { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'By Learner');

  // ── Sheet 3: Comments only ──
  const comments = rows
    .filter((r) => (r.comment ?? '').trim() !== '')
    .map((r) => ({
      'Day': r.day_number ?? '',
      'Session': r.session_title ?? '',
      'Learner Name': r.learner_name ?? '',
      'Register No': r.register_number ?? '',
      'Department': r.department_name ?? '',
      'Program': r.program_name ?? '',
      'Rating': r.rating,
      'Comment': (r.comment ?? '').trim(),
      'Captured By': methodLabel(r),
      'Submitted At': ts(r.submitted_at),
    }));
  const wsComments = XLSX.utils.json_to_sheet(comments);
  wsComments['!cols'] = [
    { wch: 6 }, { wch: 34 }, { wch: 28 }, { wch: 14 }, { wch: 30 }, { wch: 32 },
    { wch: 8 }, { wch: 80 }, { wch: 16 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsComments, 'Comments');

  // ── Sheet 4: Session Summary ──
  const summary = sessions.map((s) => {
    const rs = rows.filter((r) => r.session_id === s.session_id);
    const dist = [1, 2, 3, 4, 5].map((n) => rs.filter((r) => r.rating === n).length);
    return {
      'Day': s.day_number ?? '',
      'Session': s.session_title ?? '',
      'Session Start': ts(s.session_start),
      'Responses': rs.length,
      'Average Rating': rs.length
        ? Number((rs.reduce((a, r) => a + r.rating, 0) / rs.length).toFixed(2))
        : '',
      '1 star': dist[0],
      '2 star': dist[1],
      '3 star': dist[2],
      '4 star': dist[3],
      '5 star': dist[4],
      'With Comment': rs.filter((r) => (r.comment ?? '').trim() !== '').length,
      'Self (own login)': rs.filter((r) => r.is_self).length,
      'Volunteer Kiosk': rs.filter((r) => !r.is_self).length,
    };
  });
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary['!cols'] = [
    { wch: 6 }, { wch: 34 }, { wch: 20 }, { wch: 11 }, { wch: 14 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 14 }, { wch: 18 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Session Summary');

  const slug = eventName.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60)
    || 'induction';
  await XLSX.writeFile(wb, `session_feedback_${slug}_${new Date().toISOString().split('T')[0]}.xlsx`);
}
