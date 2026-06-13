'use client';

// =====================================================================
// PDE Phase 8 — Social & Leadership Trust Rubric Editor
// =====================================================================
// Edits 4 platform_policies rows under pde.rubrics.social_leadership.*
// (all scope=global, data_type=object):
//
//   - pde.rubrics.social_leadership.peer_mentor
//   - pde.rubrics.social_leadership.team_project_lead
//   - pde.rubrics.social_leadership.committee_role
//   - pde.rubrics.social_leadership.community_organizer
//
// Each rubric is an Accordion section with editable fields. Save → 4
// parallel UPDATEs on platform_policies. Pattern mirrors
// ScoringPolicyEditor.tsx (Cluster A) and PolicyEditorShell, adapted for
// per-rubric collapsible cards.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, RotateCcw, Save, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export type ValidatorRole = 'faculty' | 'faculty_coordinator' | 'faculty_advisor';

const VALIDATOR_ROLES: ValidatorRole[] = [
  'faculty',
  'faculty_coordinator',
  'faculty_advisor',
];

export interface ScoringBand {
  pass_threshold: number;
  distinction_threshold: number;
}

export interface PeerMentorRubric {
  evidence_required: string;
  min_mentees: number;
  min_duration_weeks: number;
  validator_role: ValidatorRole;
  feedback_collected_from: string[];
  scoring_band: ScoringBand;
}

export interface TeamProjectLeadRubric {
  evidence_required: string;
  min_team_size: number;
  min_duration_weeks: number;
  validator_role: ValidatorRole;
  feedback_collected_from: string[];
  deliverables: string[];
  scoring_band: ScoringBand;
}

export interface CommitteeRoleRubric {
  evidence_required: string;
  approved_committees: string[];
  min_meetings_attended: number;
  min_duration_months: number;
  validator_role: ValidatorRole;
  scoring_band: ScoringBand;
}

export interface CommunityOrganizerRubric {
  evidence_required: string;
  min_participants_organized: number;
  validator_role: ValidatorRole;
  deliverables: string[];
  supported_contexts: string[];
  scoring_band: ScoringBand;
}

interface PolicyRowRaw {
  id: string;
  policy_key: string;
  value: unknown;
}

interface RubricState {
  peerMentor: PeerMentorRubric;
  teamProjectLead: TeamProjectLeadRubric;
  committeeRole: CommitteeRoleRubric;
  communityOrganizer: CommunityOrganizerRubric;
}

const DEFAULT_STATE: RubricState = {
  peerMentor: {
    evidence_required: 'mentee_endorsement_signed',
    min_mentees: 2,
    min_duration_weeks: 12,
    validator_role: 'faculty_coordinator',
    feedback_collected_from: ['mentees', 'faculty_observer'],
    scoring_band: { pass_threshold: 70, distinction_threshold: 90 },
  },
  teamProjectLead: {
    evidence_required: 'team_artifact_with_role_attribution',
    min_team_size: 4,
    min_duration_weeks: 8,
    validator_role: 'faculty',
    feedback_collected_from: ['teammates', 'faculty'],
    deliverables: ['working_artifact', 'team_retrospective', 'individual_contribution_log'],
    scoring_band: { pass_threshold: 70, distinction_threshold: 90 },
  },
  committeeRole: {
    evidence_required: 'committee_minutes_with_role',
    approved_committees: [
      'student_council',
      'department_committee',
      'iqac',
      'hostel_committee',
      'cultural_committee',
      'sports_committee',
    ],
    min_meetings_attended: 6,
    min_duration_months: 6,
    validator_role: 'faculty_advisor',
    scoring_band: { pass_threshold: 65, distinction_threshold: 85 },
  },
  communityOrganizer: {
    evidence_required: 'event_or_drive_with_impact_metrics',
    min_participants_organized: 10,
    validator_role: 'faculty',
    deliverables: ['event_report', 'participant_feedback', 'impact_metrics'],
    supported_contexts: ['campus_drive', 'off_campus_outreach', 'online_community'],
    scoring_band: { pass_threshold: 70, distinction_threshold: 90 },
  },
};

const POLICY_KEYS = {
  PEER_MENTOR: 'pde.rubrics.social_leadership.peer_mentor',
  TEAM_PROJECT_LEAD: 'pde.rubrics.social_leadership.team_project_lead',
  COMMITTEE_ROLE: 'pde.rubrics.social_leadership.committee_role',
  COMMUNITY_ORGANIZER: 'pde.rubrics.social_leadership.community_organizer',
} as const;

// Catalogues for multi-select / checkbox UI.
const FEEDBACK_SOURCES_PEER = ['mentees', 'faculty_observer', 'self_reflection'];
const FEEDBACK_SOURCES_TEAM = ['teammates', 'faculty', 'external_reviewer'];
const SUPPORTED_CONTEXTS = ['campus_drive', 'off_campus_outreach', 'online_community'];
const COMMITTEE_CATALOGUE = [
  'student_council',
  'department_committee',
  'iqac',
  'hostel_committee',
  'cultural_committee',
  'sports_committee',
  'placement_committee',
  'naac_committee',
];

// ---------------------------------------------------------------------------
// Parsers (defensive — DB values may drift)
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
  const out = raw.filter((v): v is string => typeof v === 'string');
  return out.length > 0 ? out : fallback;
}
function asValidatorRole(raw: unknown, fallback: ValidatorRole): ValidatorRole {
  return VALIDATOR_ROLES.includes(raw as ValidatorRole)
    ? (raw as ValidatorRole)
    : fallback;
}
function parseBand(raw: unknown, fallback: ScoringBand): ScoringBand {
  const obj = (raw || {}) as Partial<ScoringBand>;
  return {
    pass_threshold: asNum(obj.pass_threshold, fallback.pass_threshold),
    distinction_threshold: asNum(obj.distinction_threshold, fallback.distinction_threshold),
  };
}

function parsePeerMentor(raw: unknown): PeerMentorRubric {
  const obj = (raw || {}) as Partial<PeerMentorRubric>;
  const d = DEFAULT_STATE.peerMentor;
  return {
    evidence_required: asStr(obj.evidence_required, d.evidence_required),
    min_mentees: asNum(obj.min_mentees, d.min_mentees),
    min_duration_weeks: asNum(obj.min_duration_weeks, d.min_duration_weeks),
    validator_role: asValidatorRole(obj.validator_role, d.validator_role),
    feedback_collected_from: asStrArr(obj.feedback_collected_from, d.feedback_collected_from),
    scoring_band: parseBand(obj.scoring_band, d.scoring_band),
  };
}

function parseTeamProjectLead(raw: unknown): TeamProjectLeadRubric {
  const obj = (raw || {}) as Partial<TeamProjectLeadRubric>;
  const d = DEFAULT_STATE.teamProjectLead;
  return {
    evidence_required: asStr(obj.evidence_required, d.evidence_required),
    min_team_size: asNum(obj.min_team_size, d.min_team_size),
    min_duration_weeks: asNum(obj.min_duration_weeks, d.min_duration_weeks),
    validator_role: asValidatorRole(obj.validator_role, d.validator_role),
    feedback_collected_from: asStrArr(obj.feedback_collected_from, d.feedback_collected_from),
    deliverables: asStrArr(obj.deliverables, d.deliverables),
    scoring_band: parseBand(obj.scoring_band, d.scoring_band),
  };
}

function parseCommitteeRole(raw: unknown): CommitteeRoleRubric {
  const obj = (raw || {}) as Partial<CommitteeRoleRubric>;
  const d = DEFAULT_STATE.committeeRole;
  return {
    evidence_required: asStr(obj.evidence_required, d.evidence_required),
    approved_committees: asStrArr(obj.approved_committees, d.approved_committees),
    min_meetings_attended: asNum(obj.min_meetings_attended, d.min_meetings_attended),
    min_duration_months: asNum(obj.min_duration_months, d.min_duration_months),
    validator_role: asValidatorRole(obj.validator_role, d.validator_role),
    scoring_band: parseBand(obj.scoring_band, d.scoring_band),
  };
}

function parseCommunityOrganizer(raw: unknown): CommunityOrganizerRubric {
  const obj = (raw || {}) as Partial<CommunityOrganizerRubric>;
  const d = DEFAULT_STATE.communityOrganizer;
  return {
    evidence_required: asStr(obj.evidence_required, d.evidence_required),
    min_participants_organized: asNum(obj.min_participants_organized, d.min_participants_organized),
    validator_role: asValidatorRole(obj.validator_role, d.validator_role),
    deliverables: asStrArr(obj.deliverables, d.deliverables),
    supported_contexts: asStrArr(obj.supported_contexts, d.supported_contexts),
    scoring_band: parseBand(obj.scoring_band, d.scoring_band),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SocialLeadershipRubricEditor() {
  const [rows, setRows] = useState<Map<string, PolicyRowRaw>>(new Map());
  const [loaded, setLoaded] = useState<RubricState | null>(null);
  const [working, setWorking] = useState<RubricState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data, error: fetchErr } = await supabase
        .from('platform_policies')
        .select('id, policy_key, value')
        .in('policy_key', [
          POLICY_KEYS.PEER_MENTOR,
          POLICY_KEYS.TEAM_PROJECT_LEAD,
          POLICY_KEYS.COMMITTEE_ROLE,
          POLICY_KEYS.COMMUNITY_ORGANIZER,
        ])
        .eq('scope_type', 'global');
      if (fetchErr) throw fetchErr;

      const map = new Map<string, PolicyRowRaw>();
      const raw = (data || []) as unknown as PolicyRowRaw[];
      for (const r of raw) map.set(r.policy_key, r);
      setRows(map);

      const next: RubricState = {
        peerMentor: parsePeerMentor(map.get(POLICY_KEYS.PEER_MENTOR)?.value),
        teamProjectLead: parseTeamProjectLead(map.get(POLICY_KEYS.TEAM_PROJECT_LEAD)?.value),
        committeeRole: parseCommitteeRole(map.get(POLICY_KEYS.COMMITTEE_ROLE)?.value),
        communityOrganizer: parseCommunityOrganizer(
          map.get(POLICY_KEYS.COMMUNITY_ORGANIZER)?.value,
        ),
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
    return [
      working.peerMentor.scoring_band,
      working.teamProjectLead.scoring_band,
      working.committeeRole.scoring_band,
      working.communityOrganizer.scoring_band,
    ].every(
      (b) =>
        b.pass_threshold >= 0 &&
        b.pass_threshold <= 100 &&
        b.distinction_threshold >= 0 &&
        b.distinction_threshold <= 100 &&
        b.distinction_threshold >= b.pass_threshold,
    );
  }, [working]);

  const canSave = dirty && bandsValid && !saving;

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
        upd(POLICY_KEYS.PEER_MENTOR, working.peerMentor),
        upd(POLICY_KEYS.TEAM_PROJECT_LEAD, working.teamProjectLead),
        upd(POLICY_KEYS.COMMITTEE_ROLE, working.committeeRole),
        upd(POLICY_KEYS.COMMUNITY_ORGANIZER, working.communityOrganizer),
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
          Expected 4 rows under <code>pde.rubrics.social_leadership.*</code>,
          found {rows.size}. Apply migration{' '}
          <code>20260518_pde_social_leadership_rubrics.sql</code>.
        </AlertDescription>
      </Alert>
    );
  }

  if (!working) return null;

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>PDE Phase 8 — Social & Leadership Trust</AlertTitle>
        <AlertDescription>
          These four rubrics define the durable-value category AI cannot
          replicate: working with humans, leading peers, holding committee
          positions, organizing communities. Editing thresholds here takes
          effect on the next demonstration submission. No deploy required.
        </AlertDescription>
      </Alert>

      <Accordion type="multiple" defaultValue={['peer_mentor']} className="space-y-4">
        {/* ----- Peer Mentor ----- */}
        <Card>
          <AccordionItem value="peer_mentor" className="border-0">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex flex-col items-start text-left">
                <CardTitle className="text-base">Peer mentor</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Key: <code>pde.rubrics.social_leadership.peer_mentor</code>
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4">
                <TextField
                  label="Evidence required"
                  value={working.peerMentor.evidence_required}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      peerMentor: { ...working.peerMentor, evidence_required: v },
                    })
                  }
                  disabled={saving}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberField
                    label="Min mentees"
                    value={working.peerMentor.min_mentees}
                    onChange={(v) =>
                      setWorking({
                        ...working,
                        peerMentor: { ...working.peerMentor, min_mentees: v },
                      })
                    }
                    disabled={saving}
                  />
                  <NumberField
                    label="Min duration (weeks)"
                    value={working.peerMentor.min_duration_weeks}
                    onChange={(v) =>
                      setWorking({
                        ...working,
                        peerMentor: { ...working.peerMentor, min_duration_weeks: v },
                      })
                    }
                    disabled={saving}
                  />
                </div>
                <ValidatorRoleField
                  value={working.peerMentor.validator_role}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      peerMentor: { ...working.peerMentor, validator_role: v },
                    })
                  }
                  disabled={saving}
                />
                <CheckboxGroupField
                  label="Feedback collected from"
                  options={FEEDBACK_SOURCES_PEER}
                  selected={working.peerMentor.feedback_collected_from}
                  onChange={(arr) =>
                    setWorking({
                      ...working,
                      peerMentor: { ...working.peerMentor, feedback_collected_from: arr },
                    })
                  }
                  disabled={saving}
                />
                <ScoringBandField
                  band={working.peerMentor.scoring_band}
                  onChange={(b) =>
                    setWorking({
                      ...working,
                      peerMentor: { ...working.peerMentor, scoring_band: b },
                    })
                  }
                  disabled={saving}
                />
                <p className="text-xs italic text-muted-foreground">
                  A student earns this rubric by sustained 1:1 mentorship of{' '}
                  <strong>{working.peerMentor.min_mentees}+ juniors</strong> over{' '}
                  <strong>{working.peerMentor.min_duration_weeks}+ weeks</strong>, with
                  signed endorsements from each mentee. Validator: {working.peerMentor.validator_role.replace(/_/g, ' ')}.
                </p>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ----- Team Project Lead ----- */}
        <Card>
          <AccordionItem value="team_project_lead" className="border-0">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex flex-col items-start text-left">
                <CardTitle className="text-base">Team project lead</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Key: <code>pde.rubrics.social_leadership.team_project_lead</code>
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4">
                <TextField
                  label="Evidence required"
                  value={working.teamProjectLead.evidence_required}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      teamProjectLead: { ...working.teamProjectLead, evidence_required: v },
                    })
                  }
                  disabled={saving}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberField
                    label="Min team size"
                    value={working.teamProjectLead.min_team_size}
                    onChange={(v) =>
                      setWorking({
                        ...working,
                        teamProjectLead: { ...working.teamProjectLead, min_team_size: v },
                      })
                    }
                    disabled={saving}
                  />
                  <NumberField
                    label="Min duration (weeks)"
                    value={working.teamProjectLead.min_duration_weeks}
                    onChange={(v) =>
                      setWorking({
                        ...working,
                        teamProjectLead: { ...working.teamProjectLead, min_duration_weeks: v },
                      })
                    }
                    disabled={saving}
                  />
                </div>
                <ValidatorRoleField
                  value={working.teamProjectLead.validator_role}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      teamProjectLead: { ...working.teamProjectLead, validator_role: v },
                    })
                  }
                  disabled={saving}
                />
                <CheckboxGroupField
                  label="Feedback collected from"
                  options={FEEDBACK_SOURCES_TEAM}
                  selected={working.teamProjectLead.feedback_collected_from}
                  onChange={(arr) =>
                    setWorking({
                      ...working,
                      teamProjectLead: { ...working.teamProjectLead, feedback_collected_from: arr },
                    })
                  }
                  disabled={saving}
                />
                <ChipInputField
                  label="Deliverables"
                  help="Press Enter to add. Each is a required artifact for this rubric."
                  value={working.teamProjectLead.deliverables}
                  onChange={(arr) =>
                    setWorking({
                      ...working,
                      teamProjectLead: { ...working.teamProjectLead, deliverables: arr },
                    })
                  }
                  disabled={saving}
                />
                <ScoringBandField
                  band={working.teamProjectLead.scoring_band}
                  onChange={(b) =>
                    setWorking({
                      ...working,
                      teamProjectLead: { ...working.teamProjectLead, scoring_band: b },
                    })
                  }
                  disabled={saving}
                />
                <p className="text-xs italic text-muted-foreground">
                  Student leads a team of{' '}
                  <strong>{working.teamProjectLead.min_team_size}+ members</strong> for{' '}
                  <strong>{working.teamProjectLead.min_duration_weeks}+ weeks</strong> producing
                  a working artifact plus retrospective plus per-member contribution log.
                </p>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ----- Committee Role ----- */}
        <Card>
          <AccordionItem value="committee_role" className="border-0">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex flex-col items-start text-left">
                <CardTitle className="text-base">Committee role</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Key: <code>pde.rubrics.social_leadership.committee_role</code>
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4">
                <TextField
                  label="Evidence required"
                  value={working.committeeRole.evidence_required}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      committeeRole: { ...working.committeeRole, evidence_required: v },
                    })
                  }
                  disabled={saving}
                />
                <CheckboxGroupField
                  label="Approved committees"
                  options={COMMITTEE_CATALOGUE}
                  selected={working.committeeRole.approved_committees}
                  onChange={(arr) =>
                    setWorking({
                      ...working,
                      committeeRole: { ...working.committeeRole, approved_committees: arr },
                    })
                  }
                  disabled={saving}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberField
                    label="Min meetings attended"
                    value={working.committeeRole.min_meetings_attended}
                    onChange={(v) =>
                      setWorking({
                        ...working,
                        committeeRole: { ...working.committeeRole, min_meetings_attended: v },
                      })
                    }
                    disabled={saving}
                  />
                  <NumberField
                    label="Min duration (months)"
                    value={working.committeeRole.min_duration_months}
                    onChange={(v) =>
                      setWorking({
                        ...working,
                        committeeRole: { ...working.committeeRole, min_duration_months: v },
                      })
                    }
                    disabled={saving}
                  />
                </div>
                <ValidatorRoleField
                  value={working.committeeRole.validator_role}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      committeeRole: { ...working.committeeRole, validator_role: v },
                    })
                  }
                  disabled={saving}
                />
                <ScoringBandField
                  band={working.committeeRole.scoring_band}
                  onChange={(b) =>
                    setWorking({
                      ...working,
                      committeeRole: { ...working.committeeRole, scoring_band: b },
                    })
                  }
                  disabled={saving}
                />
                <p className="text-xs italic text-muted-foreground">
                  Student holds a named role on an approved committee for{' '}
                  <strong>{working.committeeRole.min_duration_months}+ months</strong> and
                  attends <strong>{working.committeeRole.min_meetings_attended}+ meetings</strong>.
                  Validator: {working.committeeRole.validator_role.replace(/_/g, ' ')}.
                </p>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ----- Community Organizer ----- */}
        <Card>
          <AccordionItem value="community_organizer" className="border-0">
            <AccordionTrigger className="px-6 hover:no-underline">
              <div className="flex flex-col items-start text-left">
                <CardTitle className="text-base">Community organizer</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Key: <code>pde.rubrics.social_leadership.community_organizer</code>
                </CardDescription>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4">
                <TextField
                  label="Evidence required"
                  value={working.communityOrganizer.evidence_required}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      communityOrganizer: { ...working.communityOrganizer, evidence_required: v },
                    })
                  }
                  disabled={saving}
                />
                <NumberField
                  label="Min participants organized"
                  value={working.communityOrganizer.min_participants_organized}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      communityOrganizer: {
                        ...working.communityOrganizer,
                        min_participants_organized: v,
                      },
                    })
                  }
                  disabled={saving}
                />
                <ValidatorRoleField
                  value={working.communityOrganizer.validator_role}
                  onChange={(v) =>
                    setWorking({
                      ...working,
                      communityOrganizer: { ...working.communityOrganizer, validator_role: v },
                    })
                  }
                  disabled={saving}
                />
                <ChipInputField
                  label="Deliverables"
                  help="Press Enter to add. Each is a required artifact for this rubric."
                  value={working.communityOrganizer.deliverables}
                  onChange={(arr) =>
                    setWorking({
                      ...working,
                      communityOrganizer: { ...working.communityOrganizer, deliverables: arr },
                    })
                  }
                  disabled={saving}
                />
                <CheckboxGroupField
                  label="Supported contexts"
                  options={SUPPORTED_CONTEXTS}
                  selected={working.communityOrganizer.supported_contexts}
                  onChange={(arr) =>
                    setWorking({
                      ...working,
                      communityOrganizer: { ...working.communityOrganizer, supported_contexts: arr },
                    })
                  }
                  disabled={saving}
                />
                <ScoringBandField
                  band={working.communityOrganizer.scoring_band}
                  onChange={(b) =>
                    setWorking({
                      ...working,
                      communityOrganizer: { ...working.communityOrganizer, scoring_band: b },
                    })
                  }
                  disabled={saving}
                />
                <p className="text-xs italic text-muted-foreground">
                  Student organizes an event, drive, or sustained online community
                  involving <strong>{working.communityOrganizer.min_participants_organized}+ participants</strong>
                  , submitting a quantified impact report.
                </p>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>

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
            Every rubric&apos;s distinction threshold must be ≥ its pass threshold,
            and both must be between 0 and 100.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
        }}
        disabled={disabled}
      />
    </div>
  );
}

function ValidatorRoleField({
  value,
  onChange,
  disabled,
}: {
  value: ValidatorRole;
  onChange: (v: ValidatorRole) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1 max-w-xs">
      <Label className="text-xs">Validator role</Label>
      <Select value={value} onValueChange={(v) => onChange(v as ValidatorRole)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VALIDATOR_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {r.replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CheckboxGroupField({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (arr: string[]) => void;
  disabled: boolean;
}) {
  function toggle(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter((o) => o !== opt));
    else onChange([...selected, opt]);
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(opt)}
              onCheckedChange={() => toggle(opt)}
              disabled={disabled}
            />
            <span>{opt.replace(/_/g, ' ')}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ChipInputField({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  value: string[];
  onChange: (arr: string[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (!v) return;
    if (value.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...value, v]);
    setDraft('');
  }
  function remove(chip: string) {
    onChange(value.filter((c) => c !== chip));
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {value.map((chip) => (
          <Badge key={chip} variant="secondary" className="gap-1">
            {chip}
            <button
              type="button"
              onClick={() => remove(chip)}
              disabled={disabled}
              className="ml-1 hover:text-destructive disabled:opacity-50"
              aria-label={`Remove ${chip}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Type and press Enter…"
        disabled={disabled}
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function ScoringBandField({
  band,
  onChange,
  disabled,
}: {
  band: ScoringBand;
  onChange: (b: ScoringBand) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2 border-t pt-4">
      <Label className="text-xs">Scoring band (0 – 100)</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Pass threshold</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={band.pass_threshold}
            onChange={(e) => {
              const n = Number(e.target.value);
              const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
              onChange({ ...band, pass_threshold: clamped });
            }}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Distinction threshold</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={band.distinction_threshold}
            onChange={(e) => {
              const n = Number(e.target.value);
              const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
              onChange({ ...band, distinction_threshold: clamped });
            }}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
