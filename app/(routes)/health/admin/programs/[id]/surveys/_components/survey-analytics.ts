// Survey report maths — shared by the on-screen report and the Excel export
// (survey-report-excel.ts).

import {
  lt,
  type HealthSurvey,
  type HealthSurveyResponse,
  type SurveyRespondentType,
} from '@/types/health-surveys';

const TYPES: SurveyRespondentType[] = ['student', 'staff', 'public'];

export interface OptionStat {
  id: string;
  text: string;
  count: number;
  pct: number;
  constructive: boolean;
}

export interface QuestionStat {
  id: string;
  label: string;
  answered: number;
  constructiveRate: number;
  options: OptionStat[];
  byType: Record<SurveyRespondentType, number | null>; // constructive % per type
}

export interface SurveyAnalytics {
  total: number;
  avgScorePct: number;
  byType: { type: SurveyRespondentType; count: number; avgScorePct: number }[];
  byInstitution: { name: string; count: number; avgScorePct: number }[];
  byLanguage: { language: string; count: number }[];
  scoreDistribution: { constructive: number; people: number }[];
  questions: QuestionStat[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((1000 * n) / d) / 10 : 0);
const avg = (xs: number[]) =>
  xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : 0;

function scoreOf(r: HealthSurveyResponse): number {
  return r.score_pct != null
    ? Number(r.score_pct)
    : pct(r.constructive_count, r.total_questions);
}

export function questionLabel(survey: HealthSurvey, i: number): string {
  return lt(survey.questions[i]?.title, 'en') || `Q${i + 1}`;
}

export function computeAnalytics(
  survey: HealthSurvey,
  responses: HealthSurveyResponse[]
): SurveyAnalytics {
  const total = responses.length;

  const byType = TYPES.map((type) => {
    const rows = responses.filter((r) => r.respondent_type === type);
    return { type, count: rows.length, avgScorePct: avg(rows.map(scoreOf)) };
  }).filter((x) => x.count > 0);

  const instMap = new Map<string, number[]>();
  for (const r of responses) {
    const name = r.institution_name?.trim() || 'Not specified';
    instMap.set(name, [...(instMap.get(name) ?? []), scoreOf(r)]);
  }
  const byInstitution = Array.from(instMap.entries())
    .map(([name, scores]) => ({ name, count: scores.length, avgScorePct: avg(scores) }))
    .sort((a, b) => b.count - a.count);

  const langMap = new Map<string, number>();
  for (const r of responses) langMap.set(r.language, (langMap.get(r.language) ?? 0) + 1);
  const byLanguage = Array.from(langMap.entries()).map(([language, count]) => ({ language, count }));

  const n = survey.questions.length;
  const scoreDistribution = Array.from({ length: n + 1 }, (_, k) => ({
    constructive: k,
    people: responses.filter((r) => r.constructive_count === k).length,
  }));

  const questions: QuestionStat[] = survey.questions.map((q, i) => {
    const answeredRows = responses.filter((r) => r.answers?.[q.id]);
    const answered = answeredRows.length;
    const options = q.options.map((o) => {
      const count = answeredRows.filter((r) => r.answers[q.id] === o.id).length;
      return {
        id: o.id,
        text: lt(o.text, 'en'),
        count,
        pct: pct(count, answered),
        constructive: o.id === q.constructive,
      };
    });
    const byTypeRate = {} as Record<SurveyRespondentType, number | null>;
    for (const t of TYPES) {
      const rows = answeredRows.filter((r) => r.respondent_type === t);
      byTypeRate[t] = rows.length
        ? pct(rows.filter((r) => r.answers[q.id] === q.constructive).length, rows.length)
        : null;
    }
    return {
      id: q.id,
      label: questionLabel(survey, i),
      answered,
      constructiveRate: pct(
        answeredRows.filter((r) => r.answers[q.id] === q.constructive).length,
        answered
      ),
      options,
      byType: byTypeRate,
    };
  });

  return {
    total,
    avgScorePct: avg(responses.map(scoreOf)),
    byType,
    byInstitution,
    byLanguage,
    scoreDistribution,
    questions,
  };
}

/** "Q1: A ✓ | Q2: C ✗ | …" — the single Response column the report asks for. */
export function responseSummary(survey: HealthSurvey, r: HealthSurveyResponse): string {
  return survey.questions
    .map((q, i) => {
      const a = r.answers?.[q.id];
      if (!a) return `Q${i + 1}: -`;
      return `Q${i + 1}: ${a} ${a === q.constructive ? '✓' : '✗'}`;
    })
    .join(' | ');
}
