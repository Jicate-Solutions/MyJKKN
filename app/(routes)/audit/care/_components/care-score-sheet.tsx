// app/(routes)/audit/care/_components/care-score-sheet.tsx
// The pillar-grouped scoring sheet (0–4 anchored buttons + per-item evidence
// note). Shared by the owner page (per-item save) and the participant page
// (local state, single submit) — the parent owns persistence.
//
// FRAMEWORK-AWARE (additive for CARRE v2.0): the sheet auto-detects CARE
// (4 pillars, 20 items) vs CARRE (5 pillars incl. Respect, 25 items) from the
// item CODE PREFIX — `CARRE-*` codes never collide with `CARE-*`. A CARRE
// audit additionally shows the evidence anchor matched to the cycle's setting
// (ACAD/CLIN/ADMIN/EVENT) via the optional `settingCode` prop. CARE audits
// render exactly as before (no prop change at their call sites).

'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  PILLAR_LABELS as CARE_PILLAR_LABELS,
  PILLAR_ORDER as CARE_PILLAR_ORDER,
  pillarFromCode as carePillarFromCode,
} from '@/lib/services/audit/care-scoring-service';
import {
  PILLAR_LABELS as CARRE_PILLAR_LABELS,
  PILLAR_ORDER as CARRE_PILLAR_ORDER,
  CLASSROOM_PILLAR_ORDER,
  CLASSROOM_SCORE_ANCHORS,
  SCORE_ANCHORS,
  classroomPillarFromCode,
  pillarFromCode as carrePillarFromCode,
} from '@/lib/services/audit/carre-scoring-service';

/** The union of the CARE (C/A/R/E) and CARRE (C/A/R/RS/E) pillar keys. */
type AnyPillar = 'C' | 'A' | 'R' | 'RS' | 'E';

/**
 * Loose parameter shape both snapshots satisfy: CARE evidence anchors are
 * `{ label, required }`, CARRE anchors are `{ setting, label }`.
 */
export interface ScoreSheetParameter {
  code: string;
  name: string;
  description: string;
  parameter_group: number;
  framework_mapping: Record<string, string>;
  evidence_required: Array<{ setting?: string; label: string; required?: boolean }>;
}

export interface SheetValue {
  score?: number;
  evidence_note?: string;
}

/**
 * Live machine evidence for one item (fn_carre_item_evidence). `cap` is a
 * DOCTRINE cap (e.g. 2 when the measured stream shows zero activity) — the
 * sheet enforces it softly: scoring above the cap asks for a logged reason,
 * which rides the score row's evidence note. The write RPCs are untouched;
 * the human number stays sovereign.
 */
export interface LiveEvidence {
  evidence: string;
  cap: number | null;
}

const PILLAR_QUESTIONS: Record<AnyPillar, string> = {
  C: 'Does every participant know what this is, what success looks like, and why it matters?',
  A: 'Is effort acknowledged frequently, specifically, and informally — not just outcomes, formally?',
  R: 'Are there visible, attainable, distributed ways to be seen for progress and achievement?',
  RS: 'Are people treated with dignity — corrected privately, safe to speak, addressed respectfully, with their time and a working channel for disrespect?',
  E: 'Do participants have real choices, real ownership, and real authority within the initiative?',
};

const PILLAR_COLORS: Record<AnyPillar, string> = {
  C: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  A: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
  R: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  RS: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
  E: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

/** Strip the `CARE-`, `CARRE-`, or `CP-` prefix for the compact code label. */
function shortCode(code: string): string {
  return code.replace(/^(?:CARR?E|CP)-/, '');
}

/** Pick the evidence anchor for this setting; fall back to the first anchor. */
function evidenceHint(
  item: ScoreSheetParameter,
  settingCode: string | undefined,
): string | undefined {
  const ev = item.evidence_required;
  if (!Array.isArray(ev) || ev.length === 0) return undefined;
  if (settingCode) {
    const matched = ev.find((e) => e.setting === settingCode);
    if (matched) return matched.label;
  }
  return ev[0]?.label;
}

export function CareScoreSheet({
  parameters,
  values,
  onScore,
  onNote,
  settingCode,
  evidenceByCode,
  disabled = false,
}: {
  parameters: ScoreSheetParameter[];
  values: Record<string, SheetValue>;
  onScore: (code: string, score: number) => void;
  /** Called on note blur — parents persist then (owner) or buffer (participant). */
  onNote: (code: string, note: string) => void;
  /** CARRE only: the audit's setting (ACAD/CLIN/ADMIN/EVENT) — selects the anchor. */
  settingCode?: string;
  /** CARRE owner view only: live evidence + doctrine caps per item code. */
  evidenceByCode?: Record<string, LiveEvidence>;
  disabled?: boolean;
}) {
  // Framework auto-detection from the frozen catalog's code prefix. Three
  // catalogs share this sheet and their prefixes never collide:
  //   CARE-*  (v1, 4 pillars, 20 items) · CARRE-* (v2, 5 pillars, 25 items)
  //   CP-*    (Classroom Practice, 13 items, no Recognition pillar)
  const isClassroom = parameters.some((p) => p.code.startsWith('CP-'));
  const isCarre = !isClassroom && parameters.some((p) => p.code.startsWith('CARRE-'));
  const order: AnyPillar[] = isClassroom
    ? [...CLASSROOM_PILLAR_ORDER]
    : isCarre
      ? [...CARRE_PILLAR_ORDER]
      : [...CARE_PILLAR_ORDER];
  const labels = (isClassroom || isCarre
    ? CARRE_PILLAR_LABELS
    : CARE_PILLAR_LABELS) as Record<string, string>;
  const pillarFromCode: (code: string) => AnyPillar | null = isClassroom
    ? classroomPillarFromCode
    : isCarre
      ? carrePillarFromCode
      : carePillarFromCode;
  // Classroom Practice scores frequency (never→always); CARE/CARRE score
  // maturity (absent→measured). The buttons must say which one is being asked.
  const anchors = isClassroom ? CLASSROOM_SCORE_ANCHORS : SCORE_ANCHORS;

  const byPillar = order
    .map((pillar) => ({
      pillar,
      items: parameters
        .filter((p) => pillarFromCode(p.code) === pillar)
        .sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {byPillar.map(({ pillar, items }) => {
        const scored = items.filter((i) => values[i.code]?.score !== undefined);
        const total = scored.reduce((sum, i) => sum + (values[i.code]!.score ?? 0), 0);
        return (
          <div key={pillar} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('text-xs font-semibold', PILLAR_COLORS[pillar])}>
                {pillar} — {labels[pillar]}
              </Badge>
              <span className="text-xs text-muted-foreground italic">
                {PILLAR_QUESTIONS[pillar]}
              </span>
              <span className="ml-auto text-xs font-medium tabular-nums">
                {scored.length === items.length
                  ? `${total}/${items.length * 4}`
                  : `${scored.length}/${items.length} scored`}
              </span>
            </div>
            <div className="rounded-md border divide-y">
              {items.map((item) => (
                <ScoreItem
                  key={item.code}
                  item={item}
                  value={values[item.code]}
                  evidence={evidenceHint(item, settingCode)}
                  live={evidenceByCode?.[item.code]}
                  anchors={anchors}
                  onScore={(s) => onScore(item.code, s)}
                  onNote={(n) => onNote(item.code, n)}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreItem({
  item,
  value,
  evidence,
  live,
  anchors,
  onScore,
  onNote,
  disabled,
}: {
  item: ScoreSheetParameter;
  value: SheetValue | undefined;
  evidence: string | undefined;
  live: LiveEvidence | undefined;
  /** The 0–4 scale in play: frequency for Classroom Practice, maturity otherwise. */
  anchors: Record<number, { label: string; hint: string }>;
  onScore: (score: number) => void;
  onNote: (note: string) => void;
  disabled: boolean;
}) {
  const [note, setNote] = useState(value?.evidence_note ?? '');
  const [noteOpen, setNoteOpen] = useState(!!value?.evidence_note);
  // Cap-override flow: the above-cap score being attempted, pending a reason.
  const [overrideScore, setOverrideScore] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const cap = live?.cap ?? null;

  function attemptScore(s: number) {
    if (cap !== null && s > cap) {
      setOverrideScore(s);
      return;
    }
    setOverrideScore(null);
    onScore(s);
  }

  function confirmOverride() {
    if (overrideScore === null || !overrideReason.trim()) return;
    const overrideNote = `CAP OVERRIDE (scored ${overrideScore}, doctrine cap ${cap}): ${overrideReason.trim()}`;
    const merged = note.trim() ? `${overrideNote}\n${note.trim()}` : overrideNote;
    onScore(overrideScore);
    onNote(merged);
    setNote(merged);
    setNoteOpen(true);
    setOverrideScore(null);
    setOverrideReason('');
  }

  return (
    <div className="p-3 space-y-2" data-care-item={item.code}>
      <div className="flex items-start gap-3">
        <span className="font-mono text-[11px] text-muted-foreground w-16 flex-shrink-0 pt-0.5">
          {shortCode(item.code)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{item.name}</div>
          <p className="text-xs text-muted-foreground">{item.description}</p>
          {evidence && (
            <p className="text-[11px] text-muted-foreground mt-1">
              <span className="font-medium">Evidence to look for:</span> {evidence}
            </p>
          )}
          {live && (
            <p className="text-[11px] mt-1 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
              <span className="font-medium">Live evidence:</span> {live.evidence}
              {cap !== null && (
                <Badge
                  variant="outline"
                  className="ml-2 text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  Doctrine cap: {cap}
                </Badge>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-16">
        {[0, 1, 2, 3, 4].map((s) => {
          const anchor = anchors[s]!;
          const active = value?.score === s;
          const aboveCap = cap !== null && s > cap;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              title={
                aboveCap
                  ? `${anchor.hint} — above the doctrine cap (${cap}); scoring it will ask for a logged reason.`
                  : anchor.hint
              }
              onClick={() => attemptScore(s)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : aboveCap
                    ? 'border-dashed border-amber-400/70 text-muted-foreground hover:border-amber-500 hover:text-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
              )}
            >
              <span className="tabular-nums font-semibold">{s}</span>
              <span className="ml-1 hidden sm:inline">{anchor.label}</span>
            </button>
          );
        })}
        {!disabled && (
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-1 self-center"
          >
            {noteOpen ? 'Hide note' : value?.evidence_note ? 'Edit note' : '+ Evidence note'}
          </button>
        )}
      </div>

      {overrideScore !== null && !disabled && (
        <div className="pl-16">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-xs text-amber-900 dark:text-amber-200">
              <span className="font-semibold">
                Scoring {overrideScore} — above the doctrine cap of {cap}.
              </span>{' '}
              The measured evidence does not support this score. You can still
              give it — the human number is sovereign — but record the observed,
              nameable practice that justifies it. Your reason is logged with the
              score.
            </p>
            <Textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={2}
              placeholder="What did you personally observe that the measured stream misses?"
              className="text-xs bg-background"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmOverride}
                disabled={!overrideReason.trim()}
                className="rounded-md border border-amber-500 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
              >
                Score {overrideScore} with this reason
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverrideScore(null);
                  setOverrideReason('');
                }}
                className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(noteOpen || (disabled && value?.evidence_note)) && (
        <div className="pl-16">
          {disabled ? (
            <p className="text-xs text-muted-foreground border-l-2 pl-2">{value?.evidence_note}</p>
          ) : (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => onNote(note)}
              rows={2}
              placeholder="What evidence supports this score? Score what exists and is verifiable, not what is intended."
              className="text-xs"
            />
          )}
        </div>
      )}
    </div>
  );
}
