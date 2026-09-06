// components/proof-record/record-sections.tsx
//
// Verified Skills Record — shared presentational sections, rendered by BOTH
// the learner's own /my-proof page and the public /proof/[token] page (pure
// components, server-safe: no hooks, no client state).
//
// Design language: an evidence ledger. Every section opens with an eyebrow
// naming the SYSTEM OF RECORD behind it — the structure encodes the spec's
// layer→source table, not decoration. The one loud element is the JKKN
// verified seal (brand green #0b6d41), earned per layer; when a layer hasn't
// earned it the seal is simply absent — absence never accuses.
//
// Terminology (blocking CI gate): learners · Senior Learners · sessions.

import type { ReactNode } from 'react';
import { BadgeCheck } from 'lucide-react';
import {
  CountedAttendance,
  ExcusedNote,
  countedPresent,
} from '@/components/attendance/counted-attendance';
import type {
  ProofAttendance,
  ProofEngagement,
  ProofLearnerHeader,
  ProofMarksLayer,
  ProofSelfClaims,
} from '@/types/proof-record';

export const BRAND_GREEN = '#0b6d41';

export function VerifiedSeal({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
      style={{ color: BRAND_GREEN, borderColor: BRAND_GREEN, backgroundColor: `${BRAND_GREEN}14` }}
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
      {compact ? 'Verified' : 'JKKN-verified'}
    </span>
  );
}

function SectionShell({
  eyebrow,
  title,
  verified,
  action,
  children,
}: {
  /** Names the system of record backing this layer — structure as information. */
  eyebrow: string;
  title: string;
  verified?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 flex items-center gap-2 text-base font-semibold">
            {title}
            {verified ? <VerifiedSeal /> : null}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

export function RecordHeader({ learner }: { learner: ProofLearnerHeader }) {
  return (
    <header>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Verified Skills Record
      </p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{learner.name ?? 'Learner'}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {[learner.register_number, learner.program, learner.institution]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </header>
  );
}

// ── Layer 1: Attendance ──────────────────────────────────────────────────────

export function AttendanceSection({
  attendance,
  action,
}: {
  attendance: ProofAttendance;
  action?: ReactNode;
}) {
  const { overall, courses } = attendance;
  // The overall figure sums the SAME per-course numbers printed below it,
  // protected days included — so the fraction an employer reads at the top of
  // this section and the per-course rows underneath it obey one rule.
  const overallCounted = {
    attended: overall.present,
    excused: overall.protected ?? 0,
    total: overall.total,
    pct: overall.pct,
  };
  return (
    <SectionShell
      eyebrow="Evidence · session-by-session attendance record"
      title="Presence"
      verified={attendance.verified}
      action={action}
    >
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-3xl font-bold tabular-nums" style={{ color: BRAND_GREEN }}>
            {countedPresent(overallCounted)}
            <span className="text-lg font-medium text-muted-foreground"> / {overall.total}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {overallCounted.excused > 0 ? 'sessions counted' : 'sessions present'}
            {overall.pct !== null ? ` · ${overall.pct}%` : ''}
          </p>
          <ExcusedNote value={overallCounted} />
        </div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Each session was marked in-session by a Senior Learner and is
          cross-checkable against the learner&apos;s own same-day check-ins.
        </p>
      </div>
      {courses.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[430px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Course</th>
                <th className="py-1.5 pr-3 text-right font-medium">Counted</th>
                <th className="py-1.5 pr-3 text-right font-medium">%</th>
                <th className="py-1.5 text-right font-medium">First — last session</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c, i) => (
                <tr key={`${c.course_code ?? 'course'}-${i}`} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">
                    <span className="font-medium">{c.course_code ?? '—'}</span>
                    {c.course_name ? (
                      <span className="text-muted-foreground"> · {c.course_name}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    <CountedAttendance
                      value={{
                        attended: c.present,
                        excused: c.protected ?? 0,
                        total: c.total,
                        pct: null,
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.pct ?? '—'}</td>
                  <td className="py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                    {c.first_session ?? '—'} — {c.last_session ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </SectionShell>
  );
}

// ── Layer 2: Engagement ──────────────────────────────────────────────────────

export function EngagementSection({
  engagement,
  action,
}: {
  engagement: ProofEngagement;
  action?: ReactNode;
}) {
  return (
    <SectionShell
      eyebrow="Evidence · timestamped post-session check-ins"
      title="Engagement & consistency"
      verified={engagement.verified}
      action={action}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="check-ins" value={engagement.total_checkins} />
        <Stat label="days active" value={engagement.active_days} />
        <Stat label="courses covered" value={engagement.courses_covered} />
        <Stat label="honest concerns raised" value={engagement.concerns_raised} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Every check-in is a timestamped act by the learner
        {engagement.first_day && engagement.last_day
          ? ` between ${engagement.first_day} and ${engagement.last_day}`
          : ''}
        . Counts only — what a learner says in feedback stays private, always.
        {engagement.rating_levels_used >= 4
          ? ' This learner uses the full rating range — a discriminating rater, not a straight-liner.'
          : ''}
      </p>
    </SectionShell>
  );
}

// ── Layer 3: Marks (integrity-gated) ─────────────────────────────────────────

const MARKS_STATUS_COPY: Record<Exclude<ProofMarksLayer['status'], 'verified'>, string> = {
  unverified:
    'Internal-assessment entries exist, but their entry pattern has not yet passed the exam-audit provenance check — so no verified stamp. The marks below are shown as stored.',
  pending:
    'The weekly exam audit has not yet graded this program’s entry pattern. Marks appear here without a stamp until it does.',
  empty:
    'No internal-assessment entries are on record yet. This section fills in as marks are entered in the exam system.',
  unavailable: 'The exam system could not be reached just now. Marks will appear when it is back.',
};

export function MarksSection({
  marks,
  action,
  publicView = false,
}: {
  marks: ProofMarksLayer;
  action?: ReactNode;
  /** Employer view: only provenance-passing marks render at all. */
  publicView?: boolean;
}) {
  // On the shared page, marks that have not passed provenance are omitted
  // entirely — the record never presents an unverified number to an employer.
  if (publicView && marks.status !== 'verified') return null;

  return (
    <SectionShell
      eyebrow="Evidence · exam-system entries passing the provenance audit"
      title="Marks & academics"
      verified={marks.status === 'verified'}
      action={action}
    >
      {marks.status !== 'verified' ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {MARKS_STATUS_COPY[marks.status]}
        </p>
      ) : null}
      {marks.sessions.length > 0 ? (
        <div className="mt-3 space-y-4">
          {marks.sessions.map((s, si) => (
            <div key={`${s.session_name ?? 'session'}-${si}`}>
              {s.session_name ? (
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.session_name}
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Course</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Internal marks</th>
                      <th className="py-1.5 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.courses.map((c, ci) => (
                      <tr key={`${c.course_code ?? 'c'}-${ci}`} className="border-b last:border-0">
                        <td className="py-1.5 pr-3">
                          <span className="font-medium">{c.course_code ?? '—'}</span>
                          {c.course_name ? (
                            <span className="text-muted-foreground"> · {c.course_name}</span>
                          ) : null}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {c.total ?? '—'}
                          {c.max ? ` / ${c.max}` : ''}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{c.pct ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </SectionShell>
  );
}

// ── Layer 4: Durable skills (phase 2 placeholder) ────────────────────────────

export function DurableSkillsSection() {
  return (
    <SectionShell eyebrow="Evidence · rated group work (coming)" title="Durable skills">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Skill ratings appear here once a skill has been independently rated by
        at least three people across at least two different activities. No
        single opinion ever becomes a learner&apos;s label — this section stays
        empty until the evidence floor is met.
      </p>
    </SectionShell>
  );
}

// ── Layer 5: Self-claims (labeled) ───────────────────────────────────────────

export function SelfClaimsSection({
  selfClaims,
  action,
}: {
  selfClaims: ProofSelfClaims;
  action?: ReactNode;
}) {
  return (
    <SectionShell eyebrow={selfClaims.label} title="In the learner's own words" action={action}>
      {selfClaims.items.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nothing added yet. Anything a learner adds here is clearly labeled
          self-reported — the label is the honesty.
        </p>
      ) : null}
    </SectionShell>
  );
}
