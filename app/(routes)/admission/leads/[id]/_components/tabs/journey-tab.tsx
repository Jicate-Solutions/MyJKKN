'use client';

// ════════════════════════════════════════════════════════════════════════════
// Journey Tab
// 5th tab on the lead detail page — wraps <LeadVoiceJourney> for the Tabs UI.
// Mirrors the CallsTab thin-wrapper pattern (calls-tab.tsx) so the tab bar
// stays uniform: each tab file just delegates to its real component.
// ════════════════════════════════════════════════════════════════════════════

import { LeadVoiceJourney } from '@/components/admission/leads/lead-voice-journey';

interface JourneyTabProps {
  leadId: string;
  institutionId: string;
}

export function JourneyTab({ leadId, institutionId }: JourneyTabProps) {
  return <LeadVoiceJourney leadId={leadId} institutionId={institutionId} />;
}
