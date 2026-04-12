'use client';

/**
 * consent-gate.tsx
 * Health Module — Consent Gate
 *
 * Wraps all health pages. On mount, checks if the current learner has
 * given health-data consent. If not, blocks the page with a full-screen
 * overlay that explains what data is collected and asks for agreement.
 *
 * Usage:
 *   <HealthConsentProvider learnerId={learnerId}>
 *     <YourHealthPage />
 *   </HealthConsentProvider>
 *
 *   // Inside any child component:
 *   const { hasConsented } = useHealthConsentContext();
 */

import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { useHealthConsent, useGiveConsent } from '@/hooks/health/use-health';
import { useAuth } from '@/hooks/use-auth';
import {
  Shield,
  ChevronDown,
  ChevronUp,
  Heart,
  Lock,
  Users,
  CheckCircle2,
} from 'lucide-react';

// ============================================================================
// Context
// ============================================================================

interface HealthConsentContextValue {
  hasConsented: boolean;
  isLoading: boolean;
  learnerId: string | null;
}

const HealthConsentContext = createContext<HealthConsentContextValue | undefined>(
  undefined
);

export function useHealthConsentContext(): HealthConsentContextValue {
  const ctx = useContext(HealthConsentContext);
  if (!ctx) {
    throw new Error(
      'useHealthConsentContext must be used within a HealthConsentProvider'
    );
  }
  return ctx;
}

// ============================================================================
// Data bullets used in the overlay
// ============================================================================

const WHAT_WE_COLLECT = [
  {
    icon: Heart,
    label: 'Mood & Sleep Data',
    detail: 'Daily mood check-ins and sleep quality ratings you submit',
  },
  {
    icon: Shield,
    label: 'Health Profile Info',
    detail: 'Blood group, BMI, allergies, emergency contact — filled in by you',
  },
  {
    icon: Users,
    label: 'Screening Results',
    detail: 'Outcomes from health camps or wellness screenings you attend',
  },
];

const DETAILED_EXPLANATION = [
  {
    heading: 'Who sees your data?',
    body: 'Only you and the counselor assigned to you have access to your individual records. No faculty member, HOD, or peer can view your personal health data.',
  },
  {
    heading: 'What does leadership see?',
    body: 'Institution leadership sees only anonymized, aggregated trends — for example, "42% of students reported good mood this week." Individual names are never exposed in reports.',
  },
  {
    heading: 'Can I withdraw consent?',
    body: 'Yes. You can withdraw consent at any time from your Health Profile settings. Withdrawing consent does not delete historical data but stops further collection.',
  },
  {
    heading: 'Is my data secure?',
    body: 'All health data is stored in an encrypted database with row-level security. Only authenticated queries with your learner ID can access your records.',
  },
];

// ============================================================================
// Consent Overlay
// ============================================================================

function ConsentOverlay({
  learnerId,
  onConsented,
}: {
  learnerId: string;
  onConsented: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { mutate: giveConsent, isPending } = useGiveConsent();

  function handleAgree() {
    giveConsent(learnerId, {
      onSuccess: () => {
        onConsented();
      },
    });
  }

  return (
    /* Full-screen backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-emerald-950/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* ── Header band ── */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Heart className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-100">
              JKKN Health
            </p>
            <h1 className="text-xl font-bold text-white leading-tight">
              Welcome to JKKN Health
            </h1>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5">

          {/* Intro */}
          <p className="text-sm text-slate-600 leading-relaxed">
            Before you start, we need a moment to explain what we collect and
            why — so you can make an informed choice.
          </p>

          {/* What we collect bullets */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              What we collect
            </p>
            {WHAT_WE_COLLECT.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
                  <Icon className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Privacy note */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-800 leading-relaxed">
              <span className="font-semibold">Your data is private.</span> Only
              you and your assigned counselor can see individual data. Leadership
              sees anonymized trends only.
            </p>
          </div>

          {/* Learn More expandable */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              aria-expanded={expanded}
            >
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-slate-400" />
                Learn More about your privacy
              </span>
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {expanded && (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-4">
                {DETAILED_EXPLANATION.map(({ heading, body }) => (
                  <div key={heading}>
                    <p className="text-xs font-semibold text-slate-700 mb-1">
                      {heading}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer / CTA ── */}
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex flex-col sm:flex-row items-center gap-3">
          <Button
            onClick={handleAgree}
            disabled={isPending}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-2.5 rounded-xl shadow-sm transition-all"
            size="lg"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                I Agree
              </span>
            )}
          </Button>
          <p className="text-center text-xs text-slate-400 leading-relaxed">
            By clicking &ldquo;I Agree&rdquo; you consent to JKKN Health
            collecting the data described above under version 1.0 of our health
            privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Loading Skeleton (while consent query resolves)
// ============================================================================

function ConsentLoadingSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
    </div>
  );
}

// ============================================================================
// Provider
// ============================================================================

interface HealthConsentProviderProps {
  children: ReactNode;
}

export function HealthConsentProvider({ children }: HealthConsentProviderProps) {
  const { profile } = useAuth();

  // Profile has learner_id field (set for student accounts)
  const learnerId = profile?.learner_id ?? null;

  const { data: consented, isLoading, refetch } = useHealthConsent(
    learnerId ?? undefined
  );

  const hasConsented = consented === true;

  function handleConsented() {
    refetch();
  }

  const contextValue: HealthConsentContextValue = {
    hasConsented,
    isLoading,
    learnerId,
  };

  return (
    <HealthConsentContext.Provider value={contextValue}>
      {/* Show spinner while we check consent status */}
      {isLoading && <ConsentLoadingSkeleton />}

      {/* If not yet consented (and not loading), block with the overlay */}
      {!isLoading && !hasConsented && learnerId && (
        <ConsentOverlay learnerId={learnerId} onConsented={handleConsented} />
      )}

      {/* Always render children (they're behind the overlay if no consent) */}
      {children}
    </HealthConsentContext.Provider>
  );
}
