'use client';

// =====================================================================
// /hr/admin/policies/code-of-conduct — Wave 3 W3-M6b
// =====================================================================
// Backed by `hr.code_of_conduct` (scope=institution; classification=major).
// JSONB shape (spec §29):
//   - engagement_rules: 7 booleans/strings
//   - speech_presentations: { prior_approval_required, required_fields[], post_event_report_required }
//   - media_communications: 4 fields (handler_role, direct_press_authority, etc.)
//   - drugs_smoking_alcohol: 3 fields
//   - sexual_harassment_cmgi: { committee_name, chairperson, scope[], act_compliance }
//   - dos: string[]   (~22 items)
//   - donts: string[] (~10 items)
// =====================================================================

import { useState } from 'react';
import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

export const navMeta = {
  label: 'Code of Conduct',
  icon: 'BookOpen',
} as const;

interface CodeOfConductValue {
  engagement_rules: {
    whole_time_service_required: boolean;
    external_trade_or_other_institution_prohibited: boolean;
    private_coaching_for_remuneration_prohibited: boolean;
    honorary_work_requires_permission: boolean;
    enquiry_board_constituted_by: string;
    one_appeal_to_appellate_authority: boolean;
    appellate_decision_final: boolean;
  };
  speech_presentations: {
    prior_approval_required: boolean;
    required_fields: string[];
    post_event_report_required: boolean;
  };
  media_communications: {
    handler_role: string;
    direct_press_authority: string;
    authorization_required: boolean;
    social_sensitive_info_allowed: boolean;
  };
  drugs_smoking_alcohol: {
    disciplinary_action_applies: boolean;
    testing_on_suspicion: boolean;
    refusal_to_test_penalty: string;
  };
  sexual_harassment_cmgi: {
    committee_name: string;
    chairperson: string;
    scope: string[];
    act_compliance: boolean;
  };
  dos: string[];
  donts: string[];
}

const DEFAULT_VALUE: CodeOfConductValue = {
  engagement_rules: {
    whole_time_service_required: true,
    external_trade_or_other_institution_prohibited: true,
    private_coaching_for_remuneration_prohibited: true,
    honorary_work_requires_permission: true,
    enquiry_board_constituted_by: 'Director_or_Principal',
    one_appeal_to_appellate_authority: true,
    appellate_decision_final: true,
  },
  speech_presentations: {
    prior_approval_required: true,
    required_fields: ['date_venue', 'purpose_theme', 'outline', 'audience', 'reason'],
    post_event_report_required: true,
  },
  media_communications: {
    handler_role: 'General_Manager_Communications',
    direct_press_authority: 'Director_only',
    authorization_required: true,
    social_sensitive_info_allowed: false,
  },
  drugs_smoking_alcohol: {
    disciplinary_action_applies: true,
    testing_on_suspicion: true,
    refusal_to_test_penalty: 'termination',
  },
  sexual_harassment_cmgi: {
    committee_name: 'Committee for Managing Gender Issues',
    chairperson: 'Principal',
    scope: ['women', 'other_genders', 'awareness', 'sensitisation', 'counselling', 'education'],
    act_compliance: true,
  },
  dos: [],
  donts: [],
};

function asStr(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw : fallback;
}
function asBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}
function asStrArr(raw: unknown, fallback: string[]): string[] {
  return Array.isArray(raw) ? raw.map(String) : fallback;
}

function parseValue(raw: unknown): CodeOfConductValue {
  const obj = (raw || {}) as Partial<CodeOfConductValue>;
  const er = (obj.engagement_rules || {}) as Partial<CodeOfConductValue['engagement_rules']>;
  const sp = (obj.speech_presentations || {}) as Partial<
    CodeOfConductValue['speech_presentations']
  >;
  const mc = (obj.media_communications || {}) as Partial<
    CodeOfConductValue['media_communications']
  >;
  const dsa = (obj.drugs_smoking_alcohol || {}) as Partial<
    CodeOfConductValue['drugs_smoking_alcohol']
  >;
  const shc = (obj.sexual_harassment_cmgi || {}) as Partial<
    CodeOfConductValue['sexual_harassment_cmgi']
  >;
  return {
    engagement_rules: {
      whole_time_service_required: asBool(
        er.whole_time_service_required,
        DEFAULT_VALUE.engagement_rules.whole_time_service_required,
      ),
      external_trade_or_other_institution_prohibited: asBool(
        er.external_trade_or_other_institution_prohibited,
        DEFAULT_VALUE.engagement_rules.external_trade_or_other_institution_prohibited,
      ),
      private_coaching_for_remuneration_prohibited: asBool(
        er.private_coaching_for_remuneration_prohibited,
        DEFAULT_VALUE.engagement_rules.private_coaching_for_remuneration_prohibited,
      ),
      honorary_work_requires_permission: asBool(
        er.honorary_work_requires_permission,
        DEFAULT_VALUE.engagement_rules.honorary_work_requires_permission,
      ),
      enquiry_board_constituted_by: asStr(
        er.enquiry_board_constituted_by,
        DEFAULT_VALUE.engagement_rules.enquiry_board_constituted_by,
      ),
      one_appeal_to_appellate_authority: asBool(
        er.one_appeal_to_appellate_authority,
        DEFAULT_VALUE.engagement_rules.one_appeal_to_appellate_authority,
      ),
      appellate_decision_final: asBool(
        er.appellate_decision_final,
        DEFAULT_VALUE.engagement_rules.appellate_decision_final,
      ),
    },
    speech_presentations: {
      prior_approval_required: asBool(
        sp.prior_approval_required,
        DEFAULT_VALUE.speech_presentations.prior_approval_required,
      ),
      required_fields: asStrArr(
        sp.required_fields,
        DEFAULT_VALUE.speech_presentations.required_fields,
      ),
      post_event_report_required: asBool(
        sp.post_event_report_required,
        DEFAULT_VALUE.speech_presentations.post_event_report_required,
      ),
    },
    media_communications: {
      handler_role: asStr(mc.handler_role, DEFAULT_VALUE.media_communications.handler_role),
      direct_press_authority: asStr(
        mc.direct_press_authority,
        DEFAULT_VALUE.media_communications.direct_press_authority,
      ),
      authorization_required: asBool(
        mc.authorization_required,
        DEFAULT_VALUE.media_communications.authorization_required,
      ),
      social_sensitive_info_allowed: asBool(
        mc.social_sensitive_info_allowed,
        DEFAULT_VALUE.media_communications.social_sensitive_info_allowed,
      ),
    },
    drugs_smoking_alcohol: {
      disciplinary_action_applies: asBool(
        dsa.disciplinary_action_applies,
        DEFAULT_VALUE.drugs_smoking_alcohol.disciplinary_action_applies,
      ),
      testing_on_suspicion: asBool(
        dsa.testing_on_suspicion,
        DEFAULT_VALUE.drugs_smoking_alcohol.testing_on_suspicion,
      ),
      refusal_to_test_penalty: asStr(
        dsa.refusal_to_test_penalty,
        DEFAULT_VALUE.drugs_smoking_alcohol.refusal_to_test_penalty,
      ),
    },
    sexual_harassment_cmgi: {
      committee_name: asStr(
        shc.committee_name,
        DEFAULT_VALUE.sexual_harassment_cmgi.committee_name,
      ),
      chairperson: asStr(shc.chairperson, DEFAULT_VALUE.sexual_harassment_cmgi.chairperson),
      scope: asStrArr(shc.scope, DEFAULT_VALUE.sexual_harassment_cmgi.scope),
      act_compliance: asBool(
        shc.act_compliance,
        DEFAULT_VALUE.sexual_harassment_cmgi.act_compliance,
      ),
    },
    dos: asStrArr(obj.dos, DEFAULT_VALUE.dos),
    donts: asStrArr(obj.donts, DEFAULT_VALUE.donts),
  };
}

export default function CodeOfConductPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Policy — Code of Conduct">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Code of Conduct
            framing affects harassment governance and disciplinary triggers,
            and is classified as a major policy.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Policy — Code of Conduct">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Code of Conduct' },
          ]}
        />
        <PolicyEditorShell<CodeOfConductValue>
          policyKey="hr.code_of_conduct"
          pageTitle="Code of Conduct"
          pageBlurb="Foundational rules of engagement covering whole-time service, external work, speeches, media, drugs/smoking/alcohol, harassment governance (CMGI), and the institution's Do/Don't catalogue. Edits here flow into the auto-generated HR manual."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <ConductEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function ConductEditor({
  value,
  onChange,
  disabled,
}: {
  value: CodeOfConductValue;
  onChange: (next: CodeOfConductValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-8">
      <EngagementRulesSection
        value={value.engagement_rules}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, engagement_rules: next })}
      />
      <SpeechSection
        value={value.speech_presentations}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, speech_presentations: next })}
      />
      <MediaSection
        value={value.media_communications}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, media_communications: next })}
      />
      <DSASection
        value={value.drugs_smoking_alcohol}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, drugs_smoking_alcohol: next })}
      />
      <CMGISection
        value={value.sexual_harassment_cmgi}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, sexual_harassment_cmgi: next })}
      />
      <CatalogList
        title="Do's"
        help="Expected behaviours and obligations. Each entry is a single-sentence rule, surfaced in the auto-generated HR manual."
        items={value.dos}
        disabled={disabled}
        emptyLabel="No do-items yet."
        onChange={(next) => onChange({ ...value, dos: next })}
      />
      <CatalogList
        title="Don'ts"
        help="Prohibited behaviours. Each entry is a single-sentence rule. Triggers disciplinary review."
        items={value.donts}
        disabled={disabled}
        emptyLabel="No don't-items yet."
        onChange={(next) => onChange({ ...value, donts: next })}
      />
    </div>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engagement rules
// ---------------------------------------------------------------------------

function EngagementRulesSection({
  value,
  disabled,
  onChange,
}: {
  value: CodeOfConductValue['engagement_rules'];
  disabled: boolean;
  onChange: (next: CodeOfConductValue['engagement_rules']) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <Label className="text-sm font-semibold">Engagement rules</Label>
        <p className="text-xs text-muted-foreground">
          Core rules about service exclusivity and the appeal ladder.
        </p>
      </div>
      <ToggleRow
        label="Whole-time service required"
        help="When on, employees may not hold concurrent paid employment elsewhere."
        checked={value.whole_time_service_required}
        onChange={(v) => onChange({ ...value, whole_time_service_required: v })}
        disabled={disabled}
      />
      <ToggleRow
        label="External trade or other-institution work prohibited"
        help="When on, side businesses and parallel jobs in other institutions are barred."
        checked={value.external_trade_or_other_institution_prohibited}
        onChange={(v) =>
          onChange({ ...value, external_trade_or_other_institution_prohibited: v })
        }
        disabled={disabled}
      />
      <ToggleRow
        label="Private coaching for remuneration prohibited"
        help="When on, employees may not run paid tuition / coaching outside the institution."
        checked={value.private_coaching_for_remuneration_prohibited}
        onChange={(v) =>
          onChange({ ...value, private_coaching_for_remuneration_prohibited: v })
        }
        disabled={disabled}
      />
      <ToggleRow
        label="Honorary work requires permission"
        help="When on, even unpaid external work needs prior management permission."
        checked={value.honorary_work_requires_permission}
        onChange={(v) => onChange({ ...value, honorary_work_requires_permission: v })}
        disabled={disabled}
      />
      <div className="space-y-1 max-w-md">
        <Label className="text-xs">Enquiry board constituted by</Label>
        <Input
          value={value.enquiry_board_constituted_by}
          onChange={(e) =>
            onChange({ ...value, enquiry_board_constituted_by: e.target.value })
          }
          disabled={disabled}
          placeholder="Director_or_Principal"
        />
        <p className="text-xs text-muted-foreground">
          Role authorised to constitute disciplinary enquiry boards.
        </p>
      </div>
      <ToggleRow
        label="One appeal to appellate authority"
        help="When on, the appeal-ladder allows exactly one appeal to the appellate authority above the disciplinary authority."
        checked={value.one_appeal_to_appellate_authority}
        onChange={(v) => onChange({ ...value, one_appeal_to_appellate_authority: v })}
        disabled={disabled}
      />
      <ToggleRow
        label="Appellate decision final"
        help="When on, the appellate authority's decision is binding and final."
        checked={value.appellate_decision_final}
        onChange={(v) => onChange({ ...value, appellate_decision_final: v })}
        disabled={disabled}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Speech & presentations
// ---------------------------------------------------------------------------

function SpeechSection({
  value,
  disabled,
  onChange,
}: {
  value: CodeOfConductValue['speech_presentations'];
  disabled: boolean;
  onChange: (next: CodeOfConductValue['speech_presentations']) => void;
}) {
  const [draft, setDraft] = useState('');

  function addField() {
    const v = draft.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v || value.required_fields.includes(v)) {
      setDraft('');
      return;
    }
    onChange({ ...value, required_fields: [...value.required_fields, v] });
    setDraft('');
  }
  function removeField(f: string) {
    onChange({
      ...value,
      required_fields: value.required_fields.filter((x) => x !== f),
    });
  }

  return (
    <section className="space-y-4 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">Speech &amp; presentations</Label>
        <p className="text-xs text-muted-foreground">
          Rules for staff giving talks, lectures, or presentations representing the
          institution.
        </p>
      </div>
      <ToggleRow
        label="Prior approval required"
        help="When on, every external speech needs pre-approval before commitment."
        checked={value.prior_approval_required}
        onChange={(v) => onChange({ ...value, prior_approval_required: v })}
        disabled={disabled}
      />
      <ToggleRow
        label="Post-event report required"
        help="When on, a brief report (attendance, outcomes) must be filed after each event."
        checked={value.post_event_report_required}
        onChange={(v) => onChange({ ...value, post_event_report_required: v })}
        disabled={disabled}
      />
      <div className="space-y-2">
        <Label className="text-xs">
          Required fields on the approval request ({value.required_fields.length})
        </Label>
        <div className="flex flex-wrap gap-2">
          {value.required_fields.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-mono"
            >
              {f}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeField(f)}
                  className="rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${f}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {value.required_fields.length === 0 && (
            <p className="text-xs italic text-muted-foreground">No required fields.</p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addField();
                }
              }}
              placeholder="add required field (snake_case)"
              className="max-w-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addField}
              disabled={!draft.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Media communications
// ---------------------------------------------------------------------------

function MediaSection({
  value,
  disabled,
  onChange,
}: {
  value: CodeOfConductValue['media_communications'];
  disabled: boolean;
  onChange: (next: CodeOfConductValue['media_communications']) => void;
}) {
  return (
    <section className="space-y-4 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">Media communications</Label>
        <p className="text-xs text-muted-foreground">
          Who speaks to the press / social media on behalf of the institution.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Handler role</Label>
          <Input
            value={value.handler_role}
            onChange={(e) => onChange({ ...value, handler_role: e.target.value })}
            disabled={disabled}
            placeholder="General_Manager_Communications"
          />
          <p className="text-xs text-muted-foreground">
            Role that coordinates all official media requests.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Direct press authority</Label>
          <Input
            value={value.direct_press_authority}
            onChange={(e) =>
              onChange({ ...value, direct_press_authority: e.target.value })
            }
            disabled={disabled}
            placeholder="Director_only"
          />
          <p className="text-xs text-muted-foreground">
            Who alone may speak directly to journalists without going through the
            handler.
          </p>
        </div>
      </div>
      <ToggleRow
        label="Authorisation required"
        help="When on, every press or media interaction needs the handler's prior authorisation."
        checked={value.authorization_required}
        onChange={(v) => onChange({ ...value, authorization_required: v })}
        disabled={disabled}
      />
      <ToggleRow
        label="Sharing sensitive info on social allowed"
        help="When OFF (default), staff may not share institution-sensitive information on personal social channels."
        checked={value.social_sensitive_info_allowed}
        onChange={(v) => onChange({ ...value, social_sensitive_info_allowed: v })}
        disabled={disabled}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Drugs / smoking / alcohol
// ---------------------------------------------------------------------------

function DSASection({
  value,
  disabled,
  onChange,
}: {
  value: CodeOfConductValue['drugs_smoking_alcohol'];
  disabled: boolean;
  onChange: (next: CodeOfConductValue['drugs_smoking_alcohol']) => void;
}) {
  return (
    <section className="space-y-4 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">Drugs, smoking, alcohol</Label>
        <p className="text-xs text-muted-foreground">
          Substance-use rules on campus and during duty hours.
        </p>
      </div>
      <ToggleRow
        label="Disciplinary action applies"
        help="When on, violations trigger the disciplinary action ladder."
        checked={value.disciplinary_action_applies}
        onChange={(v) => onChange({ ...value, disciplinary_action_applies: v })}
        disabled={disabled}
      />
      <ToggleRow
        label="Testing on suspicion"
        help="When on, the institution may require drug/alcohol testing when there is reasonable suspicion."
        checked={value.testing_on_suspicion}
        onChange={(v) => onChange({ ...value, testing_on_suspicion: v })}
        disabled={disabled}
      />
      <div className="space-y-1 max-w-md">
        <Label className="text-xs">Refusal-to-test penalty</Label>
        <Input
          value={value.refusal_to_test_penalty}
          onChange={(e) =>
            onChange({ ...value, refusal_to_test_penalty: e.target.value })
          }
          disabled={disabled}
          placeholder="termination"
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CMGI
// ---------------------------------------------------------------------------

function CMGISection({
  value,
  disabled,
  onChange,
}: {
  value: CodeOfConductValue['sexual_harassment_cmgi'];
  disabled: boolean;
  onChange: (next: CodeOfConductValue['sexual_harassment_cmgi']) => void;
}) {
  const [draft, setDraft] = useState('');

  function addScope() {
    const v = draft.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v || value.scope.includes(v)) {
      setDraft('');
      return;
    }
    onChange({ ...value, scope: [...value.scope, v] });
    setDraft('');
  }
  function removeScope(s: string) {
    onChange({ ...value, scope: value.scope.filter((x) => x !== s) });
  }

  return (
    <section className="space-y-4 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">
          Sexual-harassment governance (CMGI)
        </Label>
        <p className="text-xs text-muted-foreground">
          Committee for Managing Gender Issues. Handles harassment complaints, awareness,
          and sensitisation.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Committee name</Label>
          <Input
            value={value.committee_name}
            onChange={(e) => onChange({ ...value, committee_name: e.target.value })}
            disabled={disabled}
            placeholder="Committee for Managing Gender Issues"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chairperson</Label>
          <Input
            value={value.chairperson}
            onChange={(e) => onChange({ ...value, chairperson: e.target.value })}
            disabled={disabled}
            placeholder="Principal"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Scope ({value.scope.length})</Label>
        <p className="text-xs text-muted-foreground">
          Categories this committee covers — gender groups + activity types
          (awareness, sensitisation, counselling, education).
        </p>
        <div className="flex flex-wrap gap-2">
          {value.scope.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-mono"
            >
              {s}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeScope(s)}
                  className="rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {value.scope.length === 0 && (
            <p className="text-xs italic text-muted-foreground">No scope entries.</p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addScope();
                }
              }}
              placeholder="add scope item (snake_case)"
              className="max-w-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addScope}
              disabled={!draft.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        )}
      </div>
      <ToggleRow
        label="Statutory act compliance"
        help="When on, the committee operates in compliance with the Sexual Harassment of Women at Workplace Act 2013 and equivalent regulations."
        checked={value.act_compliance}
        onChange={(v) => onChange({ ...value, act_compliance: v })}
        disabled={disabled}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Generic catalog editor (Do's / Don'ts) — full-sentence rules with reorder
// ---------------------------------------------------------------------------

function CatalogList({
  title,
  help,
  items,
  emptyLabel,
  disabled,
  onChange,
}: {
  title: string;
  help: string;
  items: string[];
  emptyLabel: string;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  }
  function update(idx: number, next: string) {
    onChange(items.map((it, i) => (i === idx ? next : it)));
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  return (
    <section className="space-y-3 border-t pt-6">
      <div>
        <Label className="text-sm font-semibold">
          {title} ({items.length})
        </Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div
            key={`${idx}-${it.slice(0, 12)}`}
            className="flex items-start gap-2 rounded border p-2"
          >
            <span className="text-xs text-muted-foreground w-6 pt-2">{idx + 1}.</span>
            <Textarea
              value={it}
              onChange={(e) => update(idx, e.target.value)}
              disabled={disabled}
              rows={1}
              className="flex-1 min-h-[2.5rem]"
            />
            {!disabled && (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  className="h-6 w-6 p-0"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Move down"
                  className="h-6 w-6 p-0"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(idx)}
                  aria-label="Remove"
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs italic text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
      {!disabled && (
        <div className="flex items-start gap-2 border-t pt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Add a new ${title.toLowerCase()} entry…`}
            rows={2}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={add}
            disabled={!draft.trim()}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      )}
    </section>
  );
}
