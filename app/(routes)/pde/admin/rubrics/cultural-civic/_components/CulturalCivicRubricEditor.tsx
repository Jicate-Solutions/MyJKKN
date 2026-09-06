'use client';

// =====================================================================
// PDE Phase 9 — Cultural & Civic Literacy Rubric Editor (NEP 2020-aligned)
// =====================================================================
// Edits 4 platform_policies rows under pde.rubrics.cultural_civic.*
// (scope=global):
//   - indian_language_proficiency   (Tamil = JKKN primary)
//   - local_community_project       (panchayat / SHG / village outreach)
//   - tradition_attunement          (classical + folk forms; IKS)
//   - civic_engagement              (voter ed / RTI / governance)
//
// Pattern mirrors /pde/admin/policies/scoring/_components/ScoringPolicyEditor.tsx
// — collapsible Card per rubric, direct UPDATE on save. No drafts, no
// publish step. Global-scope only; per-institution overrides land later
// via the same row's institution-scoped sibling.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Database, Plus, RotateCcw, Save, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoringBand {
  pass_threshold: number;
  distinction_threshold: number;
}

interface LanguageRubric {
  approved_languages: string[];
  primary_language_for_jkkn: string;
  evidence_required: string;
  skill_dimensions: string[];
  validator_role: string;
  min_proficiency_level: string;
  scoring_band: ScoringBand;
}

interface CommunityProjectRubric {
  evidence_required: string;
  min_duration_weeks: number;
  approved_contexts: string[];
  validator_role: string;
  deliverables: string[];
  scoring_band: ScoringBand;
}

interface TraditionRubric {
  evidence_required: string;
  approved_domains: string[];
  min_engagement_hours: number;
  validator_role: string;
  deliverables: string[];
  scoring_band: ScoringBand;
}

interface CivicEngagementRubric {
  evidence_required: string;
  approved_activities: string[];
  min_activities: number;
  min_total_hours: number;
  validator_role: string;
  deliverables: string[];
  scoring_band: ScoringBand;
}

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

interface RubricState {
  language: LanguageRubric;
  community: CommunityProjectRubric;
  tradition: TraditionRubric;
  civic: CivicEngagementRubric;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLICY_KEYS = {
  LANGUAGE: 'pde.rubrics.cultural_civic.indian_language_proficiency',
  COMMUNITY: 'pde.rubrics.cultural_civic.local_community_project',
  TRADITION: 'pde.rubrics.cultural_civic.tradition_attunement',
  CIVIC: 'pde.rubrics.cultural_civic.civic_engagement',
} as const;

const APPROVED_LANGUAGES = [
  'tamil',
  'hindi',
  'sanskrit',
  'telugu',
  'malayalam',
  'kannada',
  'english',
  'bengali',
  'marathi',
  'gujarati',
  'urdu',
] as const;

const APPROVED_COMMUNITY_CONTEXTS = [
  'village_outreach',
  'ngo_partnership',
  'panchayat_collaboration',
  'local_govt_internship',
  'self_help_group_engagement',
  'cooperative_society_work',
  'rural_school_volunteering',
] as const;

const APPROVED_TRADITION_DOMAINS = [
  'classical_music',
  'classical_dance',
  'traditional_craft',
  'folk_art',
  'ancient_text_study',
  'regional_history',
  'yoga_or_martial_arts',
  'culinary_heritage',
  'traditional_agriculture',
] as const;

const APPROVED_CIVIC_ACTIVITIES = [
  'voter_education_drive',
  'rti_filing',
  'local_governance_observation',
  'policy_advocacy',
  'election_volunteer',
  'constitutional_literacy_program',
  'public_meeting_attendance',
  'legal_aid_camp',
] as const;

const VALIDATOR_ROLES = [
  { value: 'faculty', label: 'Faculty (any)' },
  { value: 'language_faculty', label: 'Language Faculty' },
  { value: 'domain_faculty_or_certified_practitioner', label: 'Domain Faculty or Certified Practitioner' },
  { value: 'community_partner', label: 'Community Partner' },
  { value: 'department_head', label: 'Department Head' },
] as const;

const DEFAULT_STATE: RubricState = {
  language: {
    approved_languages: ['tamil', 'hindi', 'sanskrit', 'telugu', 'malayalam', 'kannada'],
    primary_language_for_jkkn: 'tamil',
    evidence_required: 'graded_assessment',
    skill_dimensions: ['reading_fluency', 'writing_clarity', 'spoken_articulation', 'comprehension'],
    validator_role: 'language_faculty',
    min_proficiency_level: 'B2_or_equivalent',
    scoring_band: { pass_threshold: 70, distinction_threshold: 90 },
  },
  community: {
    evidence_required: 'project_report_with_community_endorsement',
    min_duration_weeks: 8,
    approved_contexts: ['village_outreach', 'ngo_partnership', 'panchayat_collaboration', 'local_govt_internship', 'self_help_group_engagement'],
    validator_role: 'faculty',
    deliverables: ['project_proposal', 'execution_log', 'community_endorsement_signed', 'impact_metrics', 'reflection_essay'],
    scoring_band: { pass_threshold: 70, distinction_threshold: 90 },
  },
  tradition: {
    evidence_required: 'demonstration_or_curated_artifact',
    approved_domains: ['classical_music', 'classical_dance', 'traditional_craft', 'folk_art', 'ancient_text_study', 'regional_history', 'yoga_or_martial_arts'],
    min_engagement_hours: 60,
    validator_role: 'domain_faculty_or_certified_practitioner',
    deliverables: ['public_demonstration_or_artifact', 'reflection_on_lineage', 'mentor_endorsement'],
    scoring_band: { pass_threshold: 65, distinction_threshold: 85 },
  },
  civic: {
    evidence_required: 'documented_participation',
    approved_activities: ['voter_education_drive', 'rti_filing', 'local_governance_observation', 'policy_advocacy', 'election_volunteer', 'constitutional_literacy_program'],
    min_activities: 2,
    min_total_hours: 40,
    validator_role: 'faculty',
    deliverables: ['activity_log', 'reflection_essay', 'supervisor_endorsement'],
    scoring_band: { pass_threshold: 70, distinction_threshold: 90 },
  },
};

// ---------------------------------------------------------------------------
// Parsers (defensive — tolerate partial / malformed JSON)
// ---------------------------------------------------------------------------

function asNum(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function asStr(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

function asStrArr(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const filtered = raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return filtered.length > 0 ? filtered : fallback;
}

function parseBand(raw: unknown, fallback: ScoringBand): ScoringBand {
  const obj = (raw || {}) as Partial<ScoringBand>;
  return {
    pass_threshold: asNum(obj.pass_threshold, fallback.pass_threshold),
    distinction_threshold: asNum(obj.distinction_threshold, fallback.distinction_threshold),
  };
}

function parseLanguage(raw: unknown): LanguageRubric {
  const obj = (raw || {}) as Partial<LanguageRubric>;
  const def = DEFAULT_STATE.language;
  return {
    approved_languages: asStrArr(obj.approved_languages, def.approved_languages),
    primary_language_for_jkkn: asStr(obj.primary_language_for_jkkn, def.primary_language_for_jkkn),
    evidence_required: asStr(obj.evidence_required, def.evidence_required),
    skill_dimensions: asStrArr(obj.skill_dimensions, def.skill_dimensions),
    validator_role: asStr(obj.validator_role, def.validator_role),
    min_proficiency_level: asStr(obj.min_proficiency_level, def.min_proficiency_level),
    scoring_band: parseBand(obj.scoring_band, def.scoring_band),
  };
}

function parseCommunity(raw: unknown): CommunityProjectRubric {
  const obj = (raw || {}) as Partial<CommunityProjectRubric>;
  const def = DEFAULT_STATE.community;
  return {
    evidence_required: asStr(obj.evidence_required, def.evidence_required),
    min_duration_weeks: asNum(obj.min_duration_weeks, def.min_duration_weeks),
    approved_contexts: asStrArr(obj.approved_contexts, def.approved_contexts),
    validator_role: asStr(obj.validator_role, def.validator_role),
    deliverables: asStrArr(obj.deliverables, def.deliverables),
    scoring_band: parseBand(obj.scoring_band, def.scoring_band),
  };
}

function parseTradition(raw: unknown): TraditionRubric {
  const obj = (raw || {}) as Partial<TraditionRubric>;
  const def = DEFAULT_STATE.tradition;
  return {
    evidence_required: asStr(obj.evidence_required, def.evidence_required),
    approved_domains: asStrArr(obj.approved_domains, def.approved_domains),
    min_engagement_hours: asNum(obj.min_engagement_hours, def.min_engagement_hours),
    validator_role: asStr(obj.validator_role, def.validator_role),
    deliverables: asStrArr(obj.deliverables, def.deliverables),
    scoring_band: parseBand(obj.scoring_band, def.scoring_band),
  };
}

function parseCivic(raw: unknown): CivicEngagementRubric {
  const obj = (raw || {}) as Partial<CivicEngagementRubric>;
  const def = DEFAULT_STATE.civic;
  return {
    evidence_required: asStr(obj.evidence_required, def.evidence_required),
    approved_activities: asStrArr(obj.approved_activities, def.approved_activities),
    min_activities: asNum(obj.min_activities, def.min_activities),
    min_total_hours: asNum(obj.min_total_hours, def.min_total_hours),
    validator_role: asStr(obj.validator_role, def.validator_role),
    deliverables: asStrArr(obj.deliverables, def.deliverables),
    scoring_band: parseBand(obj.scoring_band, def.scoring_band),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CulturalCivicRubricEditor() {
  const [rows, setRows] = useState<Map<string, PolicyRowRaw>>(new Map());
  const [loaded, setLoaded] = useState<RubricState | null>(null);
  const [working, setWorking] = useState<RubricState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openCard, setOpenCard] = useState<string>('language');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: fetchErr } = await supabase
        .from('platform_policies')
        .select('id, policy_key, value')
        .in('policy_key', [
          POLICY_KEYS.LANGUAGE,
          POLICY_KEYS.COMMUNITY,
          POLICY_KEYS.TRADITION,
          POLICY_KEYS.CIVIC,
        ])
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const map = new Map<string, PolicyRowRaw>();
      const raw = (data || []) as unknown as PolicyRowRaw[];
      for (const r of raw) map.set(r.policy_key, r);
      setRows(map);

      const next: RubricState = {
        language: parseLanguage(map.get(POLICY_KEYS.LANGUAGE)?.value),
        community: parseCommunity(map.get(POLICY_KEYS.COMMUNITY)?.value),
        tradition: parseTradition(map.get(POLICY_KEYS.TRADITION)?.value),
        civic: parseCivic(map.get(POLICY_KEYS.CIVIC)?.value),
      };
      setLoaded(next);
      setWorking(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!loaded || !working) return false;
    return JSON.stringify(loaded) !== JSON.stringify(working);
  }, [loaded, working]);

  const bandsValid = useMemo(() => {
    if (!working) return true;
    const r = [working.language.scoring_band, working.community.scoring_band, working.tradition.scoring_band, working.civic.scoring_band];
    return r.every((b) => b.pass_threshold >= 0 && b.pass_threshold <= 100 && b.distinction_threshold >= 0 && b.distinction_threshold <= 100 && b.pass_threshold <= b.distinction_threshold);
  }, [working]);

  const primaryLangValid = useMemo(() => {
    if (!working) return true;
    return working.language.approved_languages.includes(working.language.primary_language_for_jkkn);
  }, [working]);

  const canSave = dirty && bandsValid && primaryLangValid && !saving;

  function revert() {
    if (loaded) setWorking(loaded);
  }

  async function save() {
    if (!working || !canSave) return;
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const updatedBy = user?.id ?? null;

      const upd = (key: string, value: unknown) =>
        supabase
          .from('platform_policies')
          .update({
            value: value as never,
            updated_by: updatedBy,
            updated_at: now,
          })
          .eq('policy_key', key)
          .eq('scope_type', 'global') as unknown as Promise<{ error: unknown }>;

      const results = await Promise.all([
        upd(POLICY_KEYS.LANGUAGE, working.language),
        upd(POLICY_KEYS.COMMUNITY, working.community),
        upd(POLICY_KEYS.TRADITION, working.tradition),
        upd(POLICY_KEYS.CIVIC, working.civic),
      ]);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) {
        const msg =
          typeof firstErr.error === 'object' &&
          firstErr.error !== null &&
          'message' in firstErr.error
            ? String((firstErr.error as { message: unknown }).message)
            : String(firstErr.error);
        throw new Error(msg);
      }

      setLoaded(working);
      toast.success('Rubrics updated. Takes effect on next demonstration submission. Zero deploy required.');
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load rubrics</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (rows.size < 4) {
    return (
      <Alert className="mt-6">
        <Database className="h-4 w-4" />
        <AlertTitle>Rubrics not seeded</AlertTitle>
        <AlertDescription>
          Expected 4 rows under <code>pde.rubrics.cultural_civic.*</code>,
          found {rows.size}. Apply migration{' '}
          <code>20260518_pde_cultural_civic_rubrics.sql</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!working) return null;

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>Cultural & Civic Literacy (Phase 9, NEP 2020-aligned)</AlertTitle>
        <AlertDescription>
          These four rubrics define the cultural &amp; civic literacy slice
          of every PDE student&apos;s score. Tamil is JKKN&apos;s primary
          approved language; community contexts include panchayat / SHG /
          village outreach; tradition domains span classical (Bharatanatyam,
          Carnatic, Tamil literature) and folk forms. Edits take effect on
          the next demonstration submission. No deploy required.
        </AlertDescription>
      </Alert>

      {/* ----- Indian Language Proficiency ----- */}
      <CollapsibleCard
        cardKey="language"
        title="Indian Language Proficiency"
        subtitle="NEP 2020 §4.6-4.7 — mother-tongue + IKS"
        policyKey={POLICY_KEYS.LANGUAGE}
        open={openCard === 'language'}
        onToggle={() => setOpenCard(openCard === 'language' ? '' : 'language')}
      >
        <div className="space-y-1">
          <Label className="text-xs">Approved languages</Label>
          <MultiCheckbox
            options={APPROVED_LANGUAGES as unknown as string[]}
            selected={working.language.approved_languages}
            onChange={(next) =>
              setWorking({ ...working, language: { ...working.language, approved_languages: next } })
            }
            disabled={saving}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Primary language for JKKN</Label>
          <Select
            value={working.language.primary_language_for_jkkn}
            onValueChange={(v) =>
              setWorking({ ...working, language: { ...working.language, primary_language_for_jkkn: v } })
            }
            disabled={saving}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {working.language.approved_languages.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!primaryLangValid && (
            <p className="text-xs text-destructive">
              Primary language must be in the approved-languages list.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Skill dimensions (assessed)</Label>
          <ChipInput
            items={working.language.skill_dimensions}
            onChange={(next) =>
              setWorking({ ...working, language: { ...working.language, skill_dimensions: next } })
            }
            disabled={saving}
            placeholder="e.g., reading_fluency"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Validator role</Label>
            <ValidatorRoleSelect
              value={working.language.validator_role}
              onChange={(v) =>
                setWorking({ ...working, language: { ...working.language, validator_role: v } })
              }
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Min proficiency level</Label>
            <Input
              value={working.language.min_proficiency_level}
              onChange={(e) =>
                setWorking({
                  ...working,
                  language: { ...working.language, min_proficiency_level: e.target.value },
                })
              }
              disabled={saving}
              placeholder="e.g., B2_or_equivalent"
            />
          </div>
        </div>

        <BandEditor
          band={working.language.scoring_band}
          onChange={(band) =>
            setWorking({ ...working, language: { ...working.language, scoring_band: band } })
          }
          disabled={saving}
        />
      </CollapsibleCard>

      {/* ----- Local Community Project ----- */}
      <CollapsibleCard
        cardKey="community"
        title="Local Community Project"
        subtitle="NEP 2020 §11.8 — community service credit"
        policyKey={POLICY_KEYS.COMMUNITY}
        open={openCard === 'community'}
        onToggle={() => setOpenCard(openCard === 'community' ? '' : 'community')}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Min duration (weeks)</Label>
            <Input
              type="number"
              min={1}
              max={52}
              value={working.community.min_duration_weeks}
              onChange={(e) =>
                setWorking({
                  ...working,
                  community: { ...working.community, min_duration_weeks: clampInt(e.target.value, 1, 52, 8) },
                })
              }
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Validator role</Label>
            <ValidatorRoleSelect
              value={working.community.validator_role}
              onChange={(v) =>
                setWorking({ ...working, community: { ...working.community, validator_role: v } })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Approved contexts</Label>
          <MultiCheckbox
            options={APPROVED_COMMUNITY_CONTEXTS as unknown as string[]}
            selected={working.community.approved_contexts}
            onChange={(next) =>
              setWorking({ ...working, community: { ...working.community, approved_contexts: next } })
            }
            disabled={saving}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Required deliverables</Label>
          <ChipInput
            items={working.community.deliverables}
            onChange={(next) =>
              setWorking({ ...working, community: { ...working.community, deliverables: next } })
            }
            disabled={saving}
            placeholder="e.g., reflection_essay"
          />
        </div>

        <BandEditor
          band={working.community.scoring_band}
          onChange={(band) =>
            setWorking({ ...working, community: { ...working.community, scoring_band: band } })
          }
          disabled={saving}
        />
      </CollapsibleCard>

      {/* ----- Tradition Attunement ----- */}
      <CollapsibleCard
        cardKey="tradition"
        title="Tradition Attunement"
        subtitle="NEP 2020 §4.6 (IKS) — classical + folk forms"
        policyKey={POLICY_KEYS.TRADITION}
        open={openCard === 'tradition'}
        onToggle={() => setOpenCard(openCard === 'tradition' ? '' : 'tradition')}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Min engagement hours</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={working.tradition.min_engagement_hours}
              onChange={(e) =>
                setWorking({
                  ...working,
                  tradition: {
                    ...working.tradition,
                    min_engagement_hours: clampInt(e.target.value, 1, 500, 60),
                  },
                })
              }
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Validator role</Label>
            <ValidatorRoleSelect
              value={working.tradition.validator_role}
              onChange={(v) =>
                setWorking({ ...working, tradition: { ...working.tradition, validator_role: v } })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Approved domains</Label>
          <MultiCheckbox
            options={APPROVED_TRADITION_DOMAINS as unknown as string[]}
            selected={working.tradition.approved_domains}
            onChange={(next) =>
              setWorking({ ...working, tradition: { ...working.tradition, approved_domains: next } })
            }
            disabled={saving}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Required deliverables</Label>
          <ChipInput
            items={working.tradition.deliverables}
            onChange={(next) =>
              setWorking({ ...working, tradition: { ...working.tradition, deliverables: next } })
            }
            disabled={saving}
            placeholder="e.g., mentor_endorsement"
          />
        </div>

        <BandEditor
          band={working.tradition.scoring_band}
          onChange={(band) =>
            setWorking({ ...working, tradition: { ...working.tradition, scoring_band: band } })
          }
          disabled={saving}
        />
      </CollapsibleCard>

      {/* ----- Civic Engagement ----- */}
      <CollapsibleCard
        cardKey="civic"
        title="Civic Engagement"
        subtitle="NEP 2020 §4.23 — fundamental duties + constitutional values"
        policyKey={POLICY_KEYS.CIVIC}
        open={openCard === 'civic'}
        onToggle={() => setOpenCard(openCard === 'civic' ? '' : 'civic')}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Min activities</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={working.civic.min_activities}
              onChange={(e) =>
                setWorking({
                  ...working,
                  civic: { ...working.civic, min_activities: clampInt(e.target.value, 1, 20, 2) },
                })
              }
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Min total hours</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={working.civic.min_total_hours}
              onChange={(e) =>
                setWorking({
                  ...working,
                  civic: { ...working.civic, min_total_hours: clampInt(e.target.value, 1, 500, 40) },
                })
              }
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Validator role</Label>
            <ValidatorRoleSelect
              value={working.civic.validator_role}
              onChange={(v) =>
                setWorking({ ...working, civic: { ...working.civic, validator_role: v } })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Approved activities</Label>
          <MultiCheckbox
            options={APPROVED_CIVIC_ACTIVITIES as unknown as string[]}
            selected={working.civic.approved_activities}
            onChange={(next) =>
              setWorking({ ...working, civic: { ...working.civic, approved_activities: next } })
            }
            disabled={saving}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Required deliverables</Label>
          <ChipInput
            items={working.civic.deliverables}
            onChange={(next) =>
              setWorking({ ...working, civic: { ...working.civic, deliverables: next } })
            }
            disabled={saving}
            placeholder="e.g., supervisor_endorsement"
          />
        </div>

        <BandEditor
          band={working.civic.scoring_band}
          onChange={(band) =>
            setWorking({ ...working, civic: { ...working.civic, scoring_band: band } })
          }
          disabled={saving}
        />
      </CollapsibleCard>

      {/* ----- Save bar ----- */}
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={revert}
          disabled={!dirty || saving}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Revert
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!canSave}>
          <Save className="h-3.5 w-3.5 mr-1" />
          {saving ? 'Saving…' : 'Save rubrics'}
        </Button>
      </div>

      {dirty && !bandsValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Scoring bands invalid: each band must have 0 ≤ pass ≤ distinction ≤ 100.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CollapsibleCard({
  cardKey,
  title,
  subtitle,
  policyKey,
  open,
  onToggle,
  children,
}: {
  cardKey: string;
  title: string;
  subtitle: string;
  policyKey: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={onToggle}
        role="button"
        aria-expanded={open}
        aria-controls={`card-${cardKey}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {title}
            </CardTitle>
            <CardDescription>
              {subtitle} · Key: <code className="text-xs">{policyKey}</code>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent id={`card-${cardKey}`} className="space-y-6">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function MultiCheckbox({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <label
            key={opt}
            className="flex items-center gap-2 rounded-md border p-2 text-sm"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => {
                if (v) {
                  if (!checked) onChange([...selected, opt]);
                } else {
                  onChange(selected.filter((x) => x !== opt));
                }
              }}
              disabled={disabled}
            />
            <span className="cursor-pointer">{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function ChipInput({
  items,
  onChange,
  disabled,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  placeholder?: string;
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {items.map((it) => (
          <Badge key={it} variant="secondary" className="gap-1">
            {it}
            <button
              type="button"
              onClick={() => onChange(items.filter((x) => x !== it))}
              disabled={disabled}
              className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 disabled:opacity-50"
              aria-label={`Remove ${it}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No items yet.</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="max-w-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={disabled || !draft.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

function ValidatorRoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  // Allow free-form values from DB (older rubrics) — render unknown as a passthrough item.
  const hasValue = VALIDATOR_ROLES.some((r) => r.value === value);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!hasValue && value && (
          <SelectItem value={value}>{value} (custom)</SelectItem>
        )}
        {VALIDATOR_ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BandEditor({
  band,
  onChange,
  disabled,
}: {
  band: ScoringBand;
  onChange: (band: ScoringBand) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs">Pass threshold (0 – 100)</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={band.pass_threshold}
          onChange={(e) =>
            onChange({ ...band, pass_threshold: clampInt(e.target.value, 0, 100, band.pass_threshold) })
          }
          disabled={disabled}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Distinction threshold (0 – 100)</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={band.distinction_threshold}
          onChange={(e) =>
            onChange({
              ...band,
              distinction_threshold: clampInt(e.target.value, 0, 100, band.distinction_threshold),
            })
          }
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampInt(raw: string, lo: number, hi: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
