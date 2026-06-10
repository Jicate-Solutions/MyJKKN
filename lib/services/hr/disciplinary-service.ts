/**
 * HR Disciplinary Case Service — T6.2
 *
 * Manages FORMAL disciplinary proceedings — the multi-stage process between
 * a third memo and an actual termination.
 *
 * Stage state machine:
 *   initiated → enquiry → hearing → decision → closed
 *
 * Outcome enum (set on decision stage, immutable once set):
 *   warning | suspension | termination | exonerated
 *
 * Cross-references:
 *   - hr_memos: evidence.memo_ids is an array of memo UUIDs. Service exposes
 *     listEvidenceMemos(caseId) which JOINs against hr_memos for display.
 *   - hr_offboarding_cases: on outcome='termination' the service writes an
 *     additive row with separation_type='termination'. NO schema change to
 *     hr_offboarding_cases.
 *
 * Static class. SupabaseClient passed as first arg (mirrors OnboardingService,
 * OffboardingService).
 *
 * Spec: hr-module-decomposition-2026-05-09.md (T6.2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DisciplinaryStage =
  | 'initiated'
  | 'enquiry'
  | 'hearing'
  | 'decision'
  | 'closed';

export type DisciplinaryStatus = 'active' | 'closed';

export type DisciplinaryOutcome =
  | 'warning'
  | 'suspension'
  | 'termination'
  | 'exonerated';

export type DisciplinaryEventType =
  | 'initiated'
  | 'enquiry_started'
  | 'enquiry_finding'
  | 'hearing_scheduled'
  | 'hearing_held'
  | 'decision'
  | 'note'
  | 'stage_change'
  | 'evidence_added';

export interface DisciplinaryEvidence {
  memo_ids?: string[];
  attachments?: Array<{ name: string; url: string }>;
  notes?: string;
  [key: string]: unknown;
}

export interface DisciplinaryCase {
  id: string;
  staff_id: string;
  case_number: string;
  alleged_misconduct: string;
  initiated_at: string;
  initiated_by: string | null;
  status: DisciplinaryStatus;
  current_stage: DisciplinaryStage;
  evidence: DisciplinaryEvidence;
  outcome: DisciplinaryOutcome | null;
  outcome_date: string | null;
  outcome_note: string | null;
  suspension_start_date: string | null;
  suspension_end_date: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisciplinaryEvent {
  id: string;
  case_id: string;
  event_type: DisciplinaryEventType;
  occurred_at: string;
  description: string;
  recorded_by: string | null;
  attachments: Array<{ name: string; url: string }>;
  created_at: string;
}

export interface DisciplinaryWitness {
  id: string;
  case_id: string;
  witness_name: string;
  witness_role: string | null;
  witness_statement: string;
  recorded_at: string;
  recorded_by: string | null;
  created_at: string;
}

export interface InitiateCaseInput {
  staffId: string;
  allegedMisconduct: string;
  evidenceMemoIds?: string[];
  evidenceNotes?: string;
  organizationId?: string | null;
  initiatedBy?: string | null;
}

export interface RecordDecisionInput {
  caseId: string;
  outcome: DisciplinaryOutcome;
  outcomeNote: string;
  recordedBy?: string | null;
  /** Required when outcome='suspension'. */
  suspensionStartDate?: string;
  /** Required when outcome='suspension'. */
  suspensionEndDate?: string;
}

export interface RecordDecisionResult {
  case: DisciplinaryCase;
  offboardingCaseId: string | null;
}

// ---------------------------------------------------------------------------
// Stage progression rules
// ---------------------------------------------------------------------------

const NEXT_STAGE: Record<DisciplinaryStage, DisciplinaryStage | null> = {
  initiated: 'enquiry',
  enquiry: 'hearing',
  hearing: 'decision',
  decision: 'closed',
  closed: null,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HRDisciplinaryService {
  constructor(private readonly supabase: SupabaseClient) {}

  // -------------------------------------------------------------------------
  // Case-number generator — DC-{YEAR}-{COUNTER}
  // -------------------------------------------------------------------------
  private async generateCaseNumber(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `DC-${year}-`;

    const { data, error } = await this.supabase
      .from('hr_disciplinary_cases')
      .select('case_number')
      .like('case_number', `${prefix}%`)
      .order('case_number', { ascending: false })
      .limit(1);

    if (error) {
      // Fall back to timestamp-based suffix if select fails
      return `${prefix}${Date.now()}`;
    }

    let nextNum = 1;
    if (data && data.length > 0) {
      const last = data[0].case_number as string;
      const suffix = last.slice(prefix.length);
      const parsed = parseInt(suffix, 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  // -------------------------------------------------------------------------
  // List + filter
  // -------------------------------------------------------------------------
  async listCases(opts?: {
    stage?: DisciplinaryStage;
    status?: DisciplinaryStatus;
    staffId?: string;
    limit?: number;
  }): Promise<DisciplinaryCase[]> {
    let query = this.supabase
      .from('hr_disciplinary_cases')
      .select('*')
      .order('initiated_at', { ascending: false })
      .limit(opts?.limit ?? 200);

    if (opts?.stage) query = query.eq('current_stage', opts.stage);
    if (opts?.status) query = query.eq('status', opts.status);
    if (opts?.staffId) query = query.eq('staff_id', opts.staffId);

    const { data, error } = await query;
    if (error) throw new Error(`listCases failed: ${error.message}`);
    return (data ?? []) as DisciplinaryCase[];
  }

  async getCase(caseId: string): Promise<DisciplinaryCase | null> {
    const { data, error } = await this.supabase
      .from('hr_disciplinary_cases')
      .select('*')
      .eq('id', caseId)
      .maybeSingle();
    if (error) throw new Error(`getCase failed: ${error.message}`);
    return (data as DisciplinaryCase) ?? null;
  }

  async listEvents(caseId: string): Promise<DisciplinaryEvent[]> {
    const { data, error } = await this.supabase
      .from('hr_disciplinary_events')
      .select('*')
      .eq('case_id', caseId)
      .order('occurred_at', { ascending: true });
    if (error) throw new Error(`listEvents failed: ${error.message}`);
    return (data ?? []) as DisciplinaryEvent[];
  }

  async listWitnesses(caseId: string): Promise<DisciplinaryWitness[]> {
    const { data, error } = await this.supabase
      .from('hr_disciplinary_witnesses')
      .select('*')
      .eq('case_id', caseId)
      .order('recorded_at', { ascending: true });
    if (error) throw new Error(`listWitnesses failed: ${error.message}`);
    return (data ?? []) as DisciplinaryWitness[];
  }

  // -------------------------------------------------------------------------
  // Evidence — cross-reference with hr_memos
  // -------------------------------------------------------------------------
  async listEvidenceMemos(caseId: string): Promise<
    Array<{ id: string; memo_type: string; reason: string; issued_at: string; status: string }>
  > {
    const c = await this.getCase(caseId);
    if (!c) return [];
    const memoIds = Array.isArray(c.evidence?.memo_ids) ? c.evidence.memo_ids : [];
    if (memoIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('hr_memos')
      .select('id, memo_type, reason, issued_at, status')
      .in('id', memoIds);
    if (error) return []; // hr_memos may be absent on fresh deploys
    return (data ?? []) as Array<{
      id: string;
      memo_type: string;
      reason: string;
      issued_at: string;
      status: string;
    }>;
  }

  // -------------------------------------------------------------------------
  // Initiate — creates a new case in stage='initiated'
  // -------------------------------------------------------------------------
  async initiateCase(input: InitiateCaseInput): Promise<DisciplinaryCase> {
    const caseNumber = await this.generateCaseNumber();
    const evidence: DisciplinaryEvidence = {
      memo_ids: input.evidenceMemoIds ?? [],
      notes: input.evidenceNotes ?? '',
    };

    const { data, error } = await this.supabase
      .from('hr_disciplinary_cases')
      .insert({
        staff_id: input.staffId,
        case_number: caseNumber,
        alleged_misconduct: input.allegedMisconduct,
        initiated_by: input.initiatedBy ?? null,
        status: 'active',
        current_stage: 'initiated',
        evidence,
        organization_id: input.organizationId ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(`initiateCase insert failed: ${error.message}`);

    const created = data as DisciplinaryCase;

    // Audit event
    await this.supabase.from('hr_disciplinary_events').insert({
      case_id: created.id,
      event_type: 'initiated',
      description: `Case ${created.case_number} initiated. Alleged misconduct: ${input.allegedMisconduct}`,
      recorded_by: input.initiatedBy ?? null,
    });

    return created;
  }

  // -------------------------------------------------------------------------
  // Stage progression
  // -------------------------------------------------------------------------
  async advanceStage(
    caseId: string,
    description: string,
    recordedBy?: string | null,
  ): Promise<DisciplinaryCase> {
    const current = await this.getCase(caseId);
    if (!current) throw new Error(`advanceStage: case ${caseId} not found`);
    if (current.status === 'closed') {
      throw new Error('advanceStage: cannot advance a closed case');
    }
    if (current.current_stage === 'decision') {
      throw new Error(
        'advanceStage: case is at decision stage. Use recordDecision() to set outcome.',
      );
    }

    const next = NEXT_STAGE[current.current_stage];
    if (!next) {
      throw new Error(
        `advanceStage: no next stage from ${current.current_stage}`,
      );
    }

    const { data, error } = await this.supabase
      .from('hr_disciplinary_cases')
      .update({ current_stage: next })
      .eq('id', caseId)
      .select('*')
      .single();
    if (error) throw new Error(`advanceStage update failed: ${error.message}`);

    // Audit event — stage_change + the specific stage's event type
    const stageEventType: DisciplinaryEventType =
      next === 'enquiry'
        ? 'enquiry_started'
        : next === 'hearing'
          ? 'hearing_scheduled'
          : 'stage_change';

    await this.supabase.from('hr_disciplinary_events').insert([
      {
        case_id: caseId,
        event_type: 'stage_change',
        description: `Stage advanced: ${current.current_stage} → ${next}. ${description}`,
        recorded_by: recordedBy ?? null,
      },
      {
        case_id: caseId,
        event_type: stageEventType,
        description,
        recorded_by: recordedBy ?? null,
      },
    ]);

    return data as DisciplinaryCase;
  }

  // -------------------------------------------------------------------------
  // Add evidence (memo references + free notes/attachments)
  // -------------------------------------------------------------------------
  async addEvidenceMemo(
    caseId: string,
    memoId: string,
    recordedBy?: string | null,
  ): Promise<DisciplinaryCase> {
    const current = await this.getCase(caseId);
    if (!current) throw new Error(`addEvidenceMemo: case ${caseId} not found`);

    const existingMemoIds = Array.isArray(current.evidence?.memo_ids)
      ? current.evidence.memo_ids
      : [];
    if (existingMemoIds.includes(memoId)) return current; // idempotent

    const nextEvidence: DisciplinaryEvidence = {
      ...current.evidence,
      memo_ids: [...existingMemoIds, memoId],
    };

    const { data, error } = await this.supabase
      .from('hr_disciplinary_cases')
      .update({ evidence: nextEvidence })
      .eq('id', caseId)
      .select('*')
      .single();
    if (error) throw new Error(`addEvidenceMemo update: ${error.message}`);

    await this.supabase.from('hr_disciplinary_events').insert({
      case_id: caseId,
      event_type: 'evidence_added',
      description: `Memo ${memoId} added as evidence`,
      recorded_by: recordedBy ?? null,
    });

    return data as DisciplinaryCase;
  }

  // -------------------------------------------------------------------------
  // Witnesses
  // -------------------------------------------------------------------------
  async addWitness(
    caseId: string,
    witness: {
      name: string;
      role?: string;
      statement: string;
      recordedBy?: string | null;
    },
  ): Promise<DisciplinaryWitness> {
    const { data, error } = await this.supabase
      .from('hr_disciplinary_witnesses')
      .insert({
        case_id: caseId,
        witness_name: witness.name,
        witness_role: witness.role ?? null,
        witness_statement: witness.statement,
        recorded_by: witness.recordedBy ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`addWitness failed: ${error.message}`);
    return data as DisciplinaryWitness;
  }

  // -------------------------------------------------------------------------
  // Ad-hoc note
  // -------------------------------------------------------------------------
  async addNote(
    caseId: string,
    description: string,
    recordedBy?: string | null,
  ): Promise<DisciplinaryEvent> {
    const { data, error } = await this.supabase
      .from('hr_disciplinary_events')
      .insert({
        case_id: caseId,
        event_type: 'note',
        description,
        recorded_by: recordedBy ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(`addNote failed: ${error.message}`);
    return data as DisciplinaryEvent;
  }

  // -------------------------------------------------------------------------
  // Record decision — set outcome + close case + forward-compat write to
  // hr_offboarding_cases when outcome='termination'
  // -------------------------------------------------------------------------
  async recordDecision(input: RecordDecisionInput): Promise<RecordDecisionResult> {
    const current = await this.getCase(input.caseId);
    if (!current) throw new Error(`recordDecision: case ${input.caseId} not found`);
    if (current.status === 'closed') {
      throw new Error('recordDecision: case is already closed');
    }
    if (current.outcome) {
      throw new Error(
        `recordDecision: outcome already set to '${current.outcome}'. Outcomes are immutable.`,
      );
    }

    if (input.outcome === 'suspension') {
      if (!input.suspensionStartDate || !input.suspensionEndDate) {
        throw new Error(
          'recordDecision: suspensionStartDate and suspensionEndDate are required when outcome=suspension',
        );
      }
    }

    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await this.supabase
      .from('hr_disciplinary_cases')
      .update({
        outcome: input.outcome,
        outcome_date: now,
        outcome_note: input.outcomeNote,
        current_stage: 'closed',
        status: 'closed',
        suspension_start_date:
          input.outcome === 'suspension' ? input.suspensionStartDate ?? null : null,
        suspension_end_date:
          input.outcome === 'suspension' ? input.suspensionEndDate ?? null : null,
      })
      .eq('id', input.caseId)
      .select('*')
      .single();
    if (updErr) throw new Error(`recordDecision update: ${updErr.message}`);

    // Audit event
    await this.supabase.from('hr_disciplinary_events').insert({
      case_id: input.caseId,
      event_type: 'decision',
      description: `Decision: ${input.outcome}. ${input.outcomeNote}`,
      recorded_by: input.recordedBy ?? null,
    });

    // Forward-compat: termination → write hr_offboarding_cases row
    let offboardingCaseId: string | null = null;
    if (input.outcome === 'termination') {
      offboardingCaseId = await this.createOffboardingForTermination(
        updated as DisciplinaryCase,
        input.recordedBy ?? null,
      );
    }

    return {
      case: updated as DisciplinaryCase,
      offboardingCaseId,
    };
  }

  // -------------------------------------------------------------------------
  // Forward-compat write to hr_offboarding_cases (additive — no schema change)
  // -------------------------------------------------------------------------
  // Best-effort: on failure (e.g. unique-open-case index hit because an
  // offboarding case is already open), we log but do NOT block the disciplinary
  // decision. HR can manually link/unlink if needed.
  private async createOffboardingForTermination(
    discCase: DisciplinaryCase,
    recordedBy: string | null,
  ): Promise<string | null> {
    // Resolve institution_id for the staff if disc case doesn't carry one
    let institutionId: string | null = discCase.organization_id;
    if (!institutionId) {
      const { data: staffRow } = await this.supabase
        .from('staff')
        .select('institution_id')
        .eq('id', discCase.staff_id)
        .maybeSingle();
      institutionId = (staffRow?.institution_id as string | undefined) ?? null;
    }

    // Skip if any offboarding case already open for this staff
    const { data: existing } = await this.supabase
      .from('hr_offboarding_cases')
      .select('id, status, separation_type')
      .eq('staff_id', discCase.staff_id)
      .eq('status', 'open')
      .limit(1);

    if (existing && existing.length > 0) {
      // Already open — record a disciplinary event noting the link skip
      await this.supabase.from('hr_disciplinary_events').insert({
        case_id: discCase.id,
        event_type: 'note',
        description: `Offboarding case ${existing[0].id} (${existing[0].separation_type}) already open — termination outcome did not auto-create a new offboarding case. HR should reconcile manually.`,
        recorded_by: recordedBy,
      });
      return null;
    }

    const reason = `Auto-created from disciplinary case ${discCase.case_number}. Alleged misconduct: ${discCase.alleged_misconduct}. HR decision: ${discCase.outcome_note ?? 'termination'}.`;

    const { data: created, error: insErr } = await this.supabase
      .from('hr_offboarding_cases')
      .insert({
        staff_id: discCase.staff_id,
        institution_id: institutionId,
        initiated_by: recordedBy,
        reason,
        current_step_index: 1,
        status: 'open',
        separation_type: 'termination',
        metadata: {
          auto_created_by: 'hr-disciplinary-service',
          disciplinary_case_id: discCase.id,
          disciplinary_case_number: discCase.case_number,
          decided_at: discCase.outcome_date,
        },
      })
      .select('id')
      .single();

    if (insErr) {
      await this.supabase.from('hr_disciplinary_events').insert({
        case_id: discCase.id,
        event_type: 'note',
        description: `Failed to auto-create offboarding case on termination outcome: ${insErr.message}. HR should create the offboarding case manually.`,
        recorded_by: recordedBy,
      });
      return null;
    }

    // Link back: audit event
    await this.supabase.from('hr_disciplinary_events').insert({
      case_id: discCase.id,
      event_type: 'note',
      description: `Termination outcome triggered offboarding case ${created.id}. The /hr/admin/offboarding workflow takes over from here.`,
      recorded_by: recordedBy,
    });

    return created.id as string;
  }
}
