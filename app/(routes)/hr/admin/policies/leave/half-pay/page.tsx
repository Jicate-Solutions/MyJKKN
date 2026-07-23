'use client';

// =====================================================================
// /hr/admin/policies/leave/half-pay — half-pay leave policy
// =====================================================================
// Wave 3 M5a — HR Policy Manual replacement.
// Policy key: hr.leave.half_pay
//
// Per Director lock (2026-05-15): half-pay applies to Engineering only.
// Dental row is seeded {"applies": false}. This page surfaces an
// "Not applicable to this institution" banner whenever the loaded row
// has `applies === false`, on top of the standard institution editor.
// =====================================================================

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

import { InstitutionPolicyEditor } from '../../_components/institution-policy-editor';

const POLICY_KEY = 'hr.leave.half_pay';

const DEFAULT_VALUE = {
  applies: true,
  days_per_year: 6,
  min_service_years_to_avail: 1,
  requires_principal_approval: true,
  commutable_to_full_pay_with_medical_cert: true,
  carry_forward_allowed: true,
  carry_forward_max_days: 30,
  encashable_at_retirement: true,
  eligible_for_teaching: true,
  eligible_for_non_teaching: true,
  notes: 'Half-pay leave: 50% salary; commutable to full pay against medical certificate.',
};

const SCHEMA_NOTES = [
  '`applies` — when false, half-pay leave is not offered at this institution. All other fields are ignored (Dental seed: applies=false per Director lock).',
  '`days_per_year` — annual entitlement when applicable (typical: 6).',
  '`min_service_years_to_avail` — minimum continuous service before staff become eligible.',
  '`commutable_to_full_pay_with_medical_cert` — when true, days can be promoted to full pay against a medical certificate.',
  '`carry_forward_allowed` + `carry_forward_max_days` — unused half-pay days can accumulate up to the cap.',
  '`encashable_at_retirement` — unused balance is paid out at retirement when true.',
];

// ---------------------------------------------------------------------------
// NotApplicableBanner — sniffs the currently-selected institution's row and
// shows a top banner whenever `applies === false`. Uses `select('*')` per
// M2 lesson (handles schema variation gracefully).
// ---------------------------------------------------------------------------

function NotApplicableBanner({ institutionId }: { institutionId: string }) {
  const [applies, setApplies] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!institutionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const supabase = createClientSupabaseClient();
        const { data } = await supabase
          .from('platform_policies')
          .select('*')
          .eq('policy_key', POLICY_KEY)
          .eq('scope_type', 'institution')
          .eq('scope_id', institutionId)
          .maybeSingle();

        if (cancelled) return;

        const value = (data?.value || {}) as Record<string, unknown>;
        setApplies(value.applies === false ? false : true);
      } catch {
        if (!cancelled) setApplies(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  if (loading) {
    return (
      <Alert className="mb-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Checking policy applicability...</AlertTitle>
      </Alert>
    );
  }

  if (applies === false) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Not applicable to this institution</AlertTitle>
        <AlertDescription>
          Half-pay leave does not apply at the currently selected institution
          (<code>{`{"applies": false}`}</code>). All other fields are ignored.
          Flip <code>applies</code> to <code>true</code> in the JSON below and
          publish to enable the policy here.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HalfPayLeavePolicyPage() {
  const { profile } = useAuth();
  const { institutions } = useInstitutionsWithAccess({ entityType: 'institution' });

  // Mirror the default selection used inside InstitutionPolicyEditor so the
  // banner reads the same institution row that the editor renders.
  const selectedInstitutionId =
    profile?.institution_id ?? (institutions.length > 0 ? institutions[0].id : '');

  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Half-pay leave">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'Leave' },
            { label: 'Half-pay leave' },
          ]}
        />
        {selectedInstitutionId ? (
          <NotApplicableBanner institutionId={selectedInstitutionId} />
        ) : null}
        <InstitutionPolicyEditor
          policyKey={POLICY_KEY}
          policyTitle="Half-pay leave"
          policyDescription="Annual half-pay leave entitlement; commutable to full pay against medical certificate. May not apply at every institution (Director lock 2026-05-15)."
          defaultValue={DEFAULT_VALUE}
          schemaNotes={SCHEMA_NOTES}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
