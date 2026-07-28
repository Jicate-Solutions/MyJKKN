'use client';

// Events — NAAC evidence criteria tag field (Wave 3, 2026-07-26).
// The WRITER for the events → quality-evidence-spine emitter (PR #2408's
// emit_event_naac_evidence): tags saved here land in events.naac_criteria
// (text[], GIN-indexed) via the existing EventBaseService.updateEvent path,
// and every completed event (status post_event/archived, IQAC status not
// rejected) auto-emits one evidence row per resolved code.
//
// OPTIONS SOURCE — curated constant, NOT a live sh_accreditation_metrics
// fetch, deliberately:
//   1. RLS on sh_accreditation_metrics gates SELECT behind
//      sh_has_management_access() OR sh_is_staff() (20260205000002) — event
//      organizers / sports in-charges who edit tournaments may fail both,
//      and a live fetch would render an EMPTY option list for exactly the
//      people who tag events.
//   2. The catalog holds 60+ NAAC rows; only a handful are event-shaped.
// Every code below is verified against in-repo catalog seeds (live or landing
// with PR #2408); the emitter resolves exact-then-raw+'.1' and SKIPS unknown
// codes, so this list can only under-emit, never mis-emit.

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Event-relevant NAAC catalog codes with plain-language labels.
 * Code provenance (sh_accreditation_metrics seeds):
 *   6.1.1 — 20260417000003 (Learners Council activity)
 *   6.2 / 6.6 — PR #2408's 20260726110000 (cultural / community)
 *   6.3.1 / 6.3.2 — 20260709034000 (induction → mentoring & wellbeing)
 *   6.4.1 — 20260709033000 (cross-cutting issues re-key)
 *   6.5.1 — 20260709033000 (sports re-key)
 *   7.3.f — 20260709023000 (stakeholder satisfaction survey facet)
 */
export const EVENT_NAAC_CRITERIA_OPTIONS: ReadonlyArray<{
  code: string;
  label: string;
}> = [
  { code: '6.5.1', label: 'Sports participation & achievements (6.5.1)' },
  { code: '6.2', label: 'Cultural festival or celebration (6.2)' },
  { code: '6.6', label: 'Community-focused activity (6.6)' },
  { code: '6.1.1', label: 'Learners Council activity (6.1.1)' },
  { code: '6.3.1', label: 'Fresher induction / orientation (6.3.1)' },
  { code: '6.3.2', label: 'Mentoring practice (6.3.2)' },
  { code: '6.4.1', label: 'Gender / ethics / sustainability themes (6.4.1)' },
  { code: '7.3.f', label: 'Stakeholder feedback collected & acted on (7.3.f)' },
];

const OPTION_LABEL_BY_CODE = new Map(
  EVENT_NAAC_CRITERIA_OPTIONS.map((o) => [o.code, o.label])
);

/**
 * Multi-select checkbox group writing events.naac_criteria. Codes already on
 * the event that are NOT in the curated list (e.g. the retro-seeded 5.4/8.4
 * tags) are preserved verbatim — toggling curated options never drops them.
 */
export function NaacCriteriaField({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (code: string, checked: boolean) => {
    if (checked) {
      onChange(value.includes(code) ? value : [...value, code]);
    } else {
      onChange(value.filter((c) => c !== code));
    }
  };

  const uncurated = value.filter((c) => !OPTION_LABEL_BY_CODE.has(c));

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <Label className="text-sm font-semibold">NAAC evidence criteria</Label>
        <p className="text-xs text-muted-foreground">
          Tag what this event proves — tagged events emit accreditation
          evidence automatically once completed.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EVENT_NAAC_CRITERIA_OPTIONS.map((opt) => (
          <label
            key={opt.code}
            className="flex cursor-pointer items-start gap-2 text-sm"
          >
            <Checkbox
              className="mt-0.5"
              checked={value.includes(opt.code)}
              disabled={disabled}
              onCheckedChange={(checked) => toggle(opt.code, checked === true)}
            />
            <span className="leading-tight">{opt.label}</span>
          </label>
        ))}
      </div>
      {uncurated.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Also tagged (kept as-is): {uncurated.join(', ')}
        </p>
      )}
    </div>
  );
}

/** Read-only chips for the event admin detail view. Unknown codes render raw. */
export function NaacCriteriaChips({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <>
      {codes.map((code) => (
        <Badge
          key={code}
          variant="outline"
          className="gap-1 text-[10px] font-normal"
          title="NAAC evidence tag — emits accreditation evidence once the event completes"
        >
          NAAC {OPTION_LABEL_BY_CODE.get(code) ?? code}
        </Badge>
      ))}
    </>
  );
}
