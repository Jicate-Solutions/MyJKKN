'use client';

// Read-only renderer for the BDS (DCI / Dr. MGR) syllabus body. BDS stores its
// content in bds_content + exam_scheme (not the Anna course_content/units), so
// the standard ContentEditor cannot render it. This card displays the whole
// dental syllabus — Goal, multi-facet Objectives, grouped Competencies, teaching
// hours/methodology, the MUST/DESIRABLE/NICE theory grid, practicals, the exam
// scheme matrix, and grouped textbooks. Editing is not yet wired; the data is
// authored via the import SQL and shown here for review.

import type { ReactNode } from 'react';
import { BookOpen, GraduationCap, ListChecks, FlaskConical, ClipboardList, Award } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type StrList = string[] | null | undefined;
interface GridRow { topic?: string; must_know?: StrList; desirable_to_know?: StrList; nice_to_know?: StrList }
interface CompGroup { group?: string; items?: StrList }
interface BdsContent {
  goal?: string;
  objectives?: Record<string, StrList>;
  competencies?: CompGroup[];
  teaching_hours?: { lecture?: number | null; practical?: number | null; total?: number | null };
  teaching_methodology?: StrList;
  theory_syllabus?: GridRow[];
  practicals?: Array<{ title?: string; hours?: number }>;
  record_log_book?: string;
}

const OBJ_LABELS: Record<string, string> = {
  knowledge: 'Knowledge & Understanding',
  skills: 'Skills',
  attitude: 'Attitude',
  integration: 'Integration',
  infection_control: 'Infection Control',
  computer_proficiency: 'Computer Proficiency',
};

function has(list: StrList): list is string[] {
  return Array.isArray(list) && list.length > 0;
}

function Bullets({ items }: { items: StrList }) {
  if (!has(items)) return <span className="text-xs text-muted-foreground/60">—</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 border-b pb-1">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function BdsContentCard({
  content,
  examScheme,
  textbooks,
}: {
  content: BdsContent | null | undefined;
  examScheme: any;
  textbooks: any;
}) {
  const c = content ?? {};
  const th = c.teaching_hours ?? {};
  const objectives = c.objectives ?? {};
  const grid = Array.isArray(c.theory_syllabus) ? c.theory_syllabus : [];
  const es = examScheme ?? {};
  const components = Array.isArray(es.components) ? es.components : [];
  const qp = es.question_pattern ?? null;
  const pe = es.practical_exam ?? null;
  const ia = es.internal_assessment ?? null;
  const bookGroups = Array.isArray(textbooks?.groups) ? textbooks.groups : [];
  const refGroups = Array.isArray(textbooks?.reference_groups) ? textbooks.reference_groups : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-green-600" /> Dental Syllabus (BDS / DCI)
        </CardTitle>
        <CardDescription>
          Read-only view of the DCI competency body. Editing via the form is not yet available — content is authored through the import SQL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Goal */}
        {c.goal && (
          <Section icon={<Award className="h-3.5 w-3.5 text-muted-foreground" />} title="Goal">
            <p className="text-xs leading-relaxed">{c.goal}</p>
          </Section>
        )}

        {/* Teaching hours */}
        {(th.lecture != null || th.practical != null || th.total != null) && (
          <div className="flex flex-wrap gap-2">
            {th.lecture != null && <Badge label="Lecture" value={`${th.lecture} hrs`} />}
            {th.practical != null && <Badge label="Practical / Clinical" value={`${th.practical} hrs`} />}
            {th.total != null && <Badge label="Total" value={`${th.total} hrs`} />}
          </div>
        )}

        {/* Objectives */}
        {Object.keys(objectives).length > 0 && (
          <Section icon={<ListChecks className="h-3.5 w-3.5 text-muted-foreground" />} title="Objectives">
            <div className="space-y-3">
              {Object.entries(objectives).filter(([, v]) => has(v)).map(([k, v]) => (
                <div key={k}>
                  <div className="mb-1 text-xs font-semibold">{OBJ_LABELS[k] ?? k}</div>
                  <Bullets items={v} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Competencies */}
        {has((c.competencies ?? []).map((g) => g.group).filter(Boolean) as string[]) && (
          <Section icon={<ListChecks className="h-3.5 w-3.5 text-muted-foreground" />} title="Competencies">
            <div className="space-y-3">
              {(c.competencies ?? []).map((g, i) => (
                <div key={i}>
                  <div className="mb-1 text-xs font-semibold">{g.group}</div>
                  <Bullets items={g.items} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Teaching methodology */}
        {has(c.teaching_methodology) && (
          <Section icon={<ListChecks className="h-3.5 w-3.5 text-muted-foreground" />} title="Teaching Methodology">
            <Bullets items={c.teaching_methodology} />
          </Section>
        )}

        {/* Theory syllabus grid */}
        {grid.length > 0 && (
          <Section icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />} title={`Theory Syllabus — ${grid.length} topics`}>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="w-40 border-b p-2 font-semibold">Topic</th>
                    <th className="border-b p-2 font-semibold">Must Know</th>
                    <th className="border-b p-2 font-semibold">Desirable to Know</th>
                    <th className="border-b p-2 font-semibold">Nice to Know</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="border-b p-2 font-medium">{r.topic}</td>
                      <td className="border-b p-2"><Bullets items={r.must_know} /></td>
                      <td className="border-b p-2"><Bullets items={r.desirable_to_know} /></td>
                      <td className="border-b p-2"><Bullets items={r.nice_to_know} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Practicals */}
        {Array.isArray(c.practicals) && c.practicals.length > 0 && (
          <Section icon={<FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />} title="Practicals">
            <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed">
              {c.practicals.map((p, i) => (
                <li key={i}>{p.title}{p.hours != null ? <span className="text-muted-foreground"> — {p.hours} hrs</span> : null}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* Exam scheme */}
        {(components.length > 0 || qp || pe) && (
          <Section icon={<ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />} title="Examination Scheme">
            {es.no_theory_exam && (
              <div className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                No Theory Examination
              </div>
            )}
            {components.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="border-b p-2 font-semibold">Stream</th>
                      <th className="border-b p-2 font-semibold">Examination</th>
                      <th className="border-b p-2 font-semibold">Internal</th>
                      <th className="border-b p-2 font-semibold">Viva</th>
                      <th className="border-b p-2 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((cp: any, i: number) => (
                      <tr key={i}>
                        <td className="border-b p-2 font-medium">{cp.stream}</td>
                        <td className="border-b p-2 tabular-nums">{cp.examination ?? '—'}</td>
                        <td className="border-b p-2 tabular-nums">{cp.internal_assessment ?? '—'}</td>
                        <td className="border-b p-2 tabular-nums">{cp.viva ?? '—'}</td>
                        <td className="border-b p-2 font-semibold tabular-nums">{cp.total ?? '—'}</td>
                      </tr>
                    ))}
                    {es.grand_total != null && (
                      <tr className="bg-muted/30">
                        <td className="p-2 font-semibold" colSpan={4}>Grand Total</td>
                        <td className="p-2 font-semibold tabular-nums">{es.grand_total}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {qp && has(qp.sections?.map((s: any) => s.name || s.type)) && (
              <div className="mt-2">
                <div className="mb-1 text-xs font-semibold">Theory Question Pattern{qp.duration_hours || qp.duration ? ` (${qp.duration_hours ? qp.duration_hours + ' hrs' : qp.duration})` : ''}</div>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {qp.sections.map((s: any, i: number) => (
                    <li key={i}>{s.name || s.type}: {s.count ?? s.questions} × {s.marks_each} = {s.total} marks{s.note ? <span className="text-muted-foreground"> ({s.note})</span> : null}</li>
                  ))}
                </ul>
              </div>
            )}
            {pe && Array.isArray(pe.items) && pe.items.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-xs font-semibold">Practical Examination{pe.type ? ` — ${pe.type}` : ''}</div>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {pe.items.map((it: any, i: number) => (
                    <li key={i}>{it.name}{it.count != null && it.marks_each != null ? ` — ${it.count} × ${it.marks_each} = ${it.total}` : it.marks != null ? ` — ${it.marks} marks` : it.total != null ? ` — ${it.total} marks` : ''}</li>
                  ))}
                </ul>
                {pe.viva?.max != null && <div className="mt-1 text-xs">Viva: {pe.viva.max} marks{pe.viva.notes ? <span className="text-muted-foreground"> ({pe.viva.notes})</span> : null}</div>}
              </div>
            )}
            {ia?.frequency && <p className="mt-2 text-xs text-muted-foreground">Internal assessment: {ia.frequency}</p>}
          </Section>
        )}

        {/* Textbooks */}
        {(bookGroups.length > 0 || refGroups.length > 0) && (
          <Section icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />} title="Books">
            <div className="space-y-3">
              {[...bookGroups, ...refGroups].map((g: any, i: number) => (
                <div key={i}>
                  <div className="mb-1 text-xs font-semibold">{g.group}</div>
                  <Bullets items={g.books} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {c.record_log_book && (
          <p className="border-t pt-3 text-xs text-muted-foreground"><span className="font-semibold">Record / Log book: </span>{c.record_log_book}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-2.5 py-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
