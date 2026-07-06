// lib/utils/induction-poll-export.ts
// Builds the host-side Excel export for an induction session poll from the flat
// (learner x question) rows of fn_induction_session_poll_export. Three sheets:
//   1. Learner Responses — one row per learner, one column per question (the matrix
//      view the coordinators read), plus full learner details.
//   2. Response Log — the raw long-format rows with per-answer timestamps.
//   3. Option Summary — per-question option counts + percentages.
import XLSX from '@/lib/utils/excel-compat';
import type { PollExportRow } from '@/lib/services/induction/induction-poll-service';

export async function exportPollResponsesToExcel(rows: PollExportRow[], sessionTitle: string): Promise<void> {
  // Question axis in authoring order (rows repeat question meta per learner).
  const questions = [...new Map(rows.map((r) => [r.question_id, r])).values()]
    .sort((a, b) => a.question_position - b.question_position);

  // Rows arrive sorted by register number, so Map insertion order keeps that.
  const byLearner = new Map<string, PollExportRow[]>();
  for (const r of rows) {
    const list = byLearner.get(r.learner_id);
    if (list) list.push(r); else byLearner.set(r.learner_id, [r]);
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Learner Responses (matrix) ──
  const matrix = [...byLearner.values()].map((list) => {
    const first = list[0];
    const row: Record<string, string | number> = {
      'Register No': first.register_number ?? '',
      'Roll No': first.roll_number ?? '',
      'Learner Name': first.learner_name ?? '',
      'Gender': first.gender ?? '',
      'Personal Email': first.student_email ?? '',
      'College Email': first.college_email ?? '',
      'Mobile': first.student_mobile ?? '',
      'Institution': first.institution_name ?? '',
      'Degree': first.degree_name ?? '',
      'Program': first.program_name ?? '',
      'Batch': first.batch_name ?? '',
    };
    questions.forEach((q, i) => {
      const ans = list.find((r) => r.question_id === q.question_id);
      row[`Q${i + 1}. ${q.question_prompt}`] = ans ? ans.option_labels.join('; ') : '';
    });
    row['Questions Answered'] = list.length;
    row['Last Answered At'] = new Date(
      Math.max(...list.map((r) => new Date(r.answered_at).getTime()))
    ).toLocaleString();
    return row;
  });
  const wsMatrix = XLSX.utils.json_to_sheet(matrix);
  wsMatrix['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 14 },
    { wch: 32 }, { wch: 20 }, { wch: 30 }, { wch: 16 },
    ...questions.map(() => ({ wch: 40 })),
    { wch: 10 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Learner Responses');

  // ── Sheet 2: Response Log (long format) ──
  const log = rows.map((r) => ({
    'Register No': r.register_number ?? '',
    'Roll No': r.roll_number ?? '',
    'Learner Name': r.learner_name ?? '',
    'Institution': r.institution_name ?? '',
    'Program': r.program_name ?? '',
    'Question #': r.question_position + 1,
    'Question': r.question_prompt,
    'Type': r.question_kind === 'multi' ? 'Pick many' : 'Pick one',
    'Selected Option(s)': r.option_labels.join('; '),
    'Answered At': new Date(r.answered_at).toLocaleString(),
  }));
  const wsLog = XLSX.utils.json_to_sheet(log);
  wsLog['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 32 }, { wch: 30 },
    { wch: 10 }, { wch: 50 }, { wch: 10 }, { wch: 50 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLog, 'Response Log');

  // ── Sheet 3: Option Summary ──
  const summary: Record<string, string | number>[] = [];
  for (const [i, q] of questions.entries()) {
    const answers = rows.filter((r) => r.question_id === q.question_id);
    const counts = new Map<string, number>();
    for (const r of answers) for (const label of r.option_labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    for (const [label, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      summary.push({
        'Question #': i + 1,
        'Question': q.question_prompt,
        'Option': label,
        'Votes': count,
        '% of Responders': answers.length ? `${Math.round((count / answers.length) * 100)}%` : '0%',
      });
    }
  }
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 10 }, { wch: 50 }, { wch: 50 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Option Summary');

  const slug = sessionTitle.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'session';
  await XLSX.writeFile(wb, `poll_responses_${slug}_${new Date().toISOString().split('T')[0]}.xlsx`);
}
