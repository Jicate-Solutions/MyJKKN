import type { CallDisposition, CallOutcome, InterestLevel } from '@/lib/services/telephony/telephony-service';

// ═══════════════════════════════════════════════════════════════════════════
// STAGE SUGGESTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

interface StageSuggestion {
  suggestedStage: string;
  label: string;
  confidence: 'high' | 'medium';
}

/**
 * Given the current funnel stage, call outcome, and interest level,
 * suggest the next stage the lead should move to.
 * Returns null if no suggestion makes sense.
 *
 * Rules: only suggest PROGRESSION (never regression).
 */
export function getStageSuggestion(
  currentStage: string | null,
  outcome: CallOutcome | undefined,
  interest: InterestLevel | undefined
): StageSuggestion | null {
  const stage = currentStage || 'new';
  if (!outcome) return null;

  // Connected + interest-based suggestions
  if (outcome === 'connected') {
    if (interest === 'hot') {
      if (stage === 'new') return { suggestedStage: 'interested', label: 'Interested', confidence: 'high' };
      if (stage === 'contacted') return { suggestedStage: 'interested', label: 'Interested', confidence: 'high' };
      if (stage === 'interested') return { suggestedStage: 'qualified', label: 'Qualified', confidence: 'medium' };
      if (stage === 'follow_up_scheduled') return { suggestedStage: 'qualified', label: 'Qualified', confidence: 'medium' };
    }

    if (interest === 'warm') {
      if (stage === 'new') return { suggestedStage: 'contacted', label: 'Contacted', confidence: 'high' };
      if (stage === 'contacted') return { suggestedStage: 'follow_up_scheduled', label: 'Follow-up Scheduled', confidence: 'medium' };
    }

    if (interest === 'cold') {
      if (stage === 'new') return { suggestedStage: 'contacted', label: 'Contacted', confidence: 'high' };
    }

    if (interest === 'not_interested') {
      return { suggestedStage: 'lost', label: 'Lost', confidence: 'medium' };
    }

    // Connected but no interest selected yet
    if (stage === 'new') return { suggestedStage: 'contacted', label: 'Contacted', confidence: 'high' };
  }

  // Not connected outcomes
  if (outcome === 'not_answered' || outcome === 'busy' || outcome === 'voicemail') {
    if (stage === 'new') return { suggestedStage: 'not_reachable', label: 'Not Reachable', confidence: 'medium' };
  }

  // Wrong number — don't suggest, needs manual data correction
  if (outcome === 'wrong_number') {
    return null;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTCOME → LEGACY DISPOSITION MAPPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps the new (outcome + interest) pair to the legacy CallDisposition type
 * for backward compatibility with existing analytics and reports.
 */
export function mapOutcomeToDisposition(
  outcome: CallOutcome,
  interest?: InterestLevel
): CallDisposition {
  if (outcome === 'not_answered') return 'not_reachable';
  if (outcome === 'busy') return 'busy';
  if (outcome === 'wrong_number') return 'wrong_number';
  if (outcome === 'voicemail') return 'not_reachable';

  // Connected
  if (interest === 'hot' || interest === 'warm') return 'interested';
  if (interest === 'not_interested') return 'not_interested';
  if (interest === 'cold') return 'callback';
  return 'other';
}
