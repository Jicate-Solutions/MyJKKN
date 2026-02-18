'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, Building2, Calculator, CreditCard } from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

const plannedFeatures = [
  'Education loan partner management and onboarding',
  'Loan application tracking with status updates',
  'EMI calculator with partner-wise comparison',
  'Document checklist and verification workflow',
  'Collateral and eligibility assessment tools',
  'Partner-wise approval rate analytics',
  'Student loan consultation scheduling',
  'Bulk loan report generation and export',
];

function LoansComingSoon() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg w-full text-center p-8">
          <CardHeader className="pb-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Wallet className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Loan Connect & Financial Aid</CardTitle>
            <CardDescription className="text-base">
              <Badge variant="outline" className="mt-2 text-sm font-normal">
                Coming Soon
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Education loan partner integrations, student financing workflows,
              EMI calculations, and application tracking for seamless financial aid management.
            </p>

            <div className="text-left space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Planned Features
              </h3>
              <ul className="space-y-2">
                {plannedFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-center gap-6 pt-4 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Multi-partner</span>
              <span className="flex items-center gap-1"><Calculator className="h-3.5 w-3.5" /> EMI tools</span>
              <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Tracking</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoansPage() {
  return (
    <AdmissionErrorBoundary>
      <LoansComingSoon />
    </AdmissionErrorBoundary>
  );
}

/*
 * ============================================================================
 * LEGACY CODE - Previous mock implementation (kept for future reference)
 * ============================================================================
 *
 * This page previously contained a full mock UI with:
 * - mockLoanPartners: Array of 4 loan partners (HDFC Credila, SBI, Avanse, Axis)
 *   with interest rates, tenure ranges, collateral requirements
 * - mockApplications: Array of 3 student loan applications with status tracking
 * - EMI Calculator: calculateEMI function with slider-based inputs
 * - Tabs: Loan Partners, Applications, Compare Loans, Resources
 * - Dialog: Eligibility checker with partner-wise EMI comparison
 * - Features: Partner cards, application tracker, comparison table, document checklist
 *
 * To restore: check git history for this file before the "Coming Soon" conversion.
 */
