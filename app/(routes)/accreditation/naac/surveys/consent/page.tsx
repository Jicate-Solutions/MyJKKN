// app/(routes)/accreditation/naac/surveys/consent/page.tsx
// ============================================================================
// /accreditation/naac/surveys/consent — DPDPA 2023 consent form (PR-A8 c2).
//
// Required step before any learner/alumni data can be exported for NAAC 8.4
// (Learner Experience Survey) or equivalent NIRF perception sub-surveys.
//
// 4 data categories per v2.1 R4.4 decision:
//   1. Personally identifiable information (name, roll no, contact)
//   2. Academic records (grades, courses, programme)
//   3. Alumni outcomes (post-graduation status, employment, salary bands)
//   4. Parent contact (communications related to child's education)
//
// Inserts into accreditation_survey_consents with body_codes=['NAAC','NIRF']
// so one consent event grants both primary-body uses. Withdrawal writes
// withdrawn_at; export respects withdrawn_at IS NULL on the export pathway.
//
// Legal basis: "consent" per DPDPA 2023 §6. Purpose is locked at
// "accreditation_surveys". Scope captures which categories were granted.
// ============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Scale,
  ShieldCheck,
  BookOpen,
  UserCircle,
  Users as UsersIcon,
  Mail,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

interface DataCategory {
  key:
    | 'personally_identifiable_information'
    | 'academic_records'
    | 'alumni_outcomes'
    | 'parent_contact';
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultRequired: boolean; // whether ticked by default
}

const CONSENT_VERSION = '1.0-2026-04-19';

const DATA_CATEGORIES: DataCategory[] = [
  {
    key: 'personally_identifiable_information',
    label: 'Personally identifiable information',
    description:
      'Full name, roll number, contact email + phone, date of birth. Required to link survey responses back to your academic record for weighted scoring.',
    icon: UserCircle,
    defaultRequired: true,
  },
  {
    key: 'academic_records',
    label: 'Academic records',
    description:
      'Programme enrolled, semester, course list, grades, attendance. Used to segment survey responses by programme level (PG/UG/Diploma) and cadre.',
    icon: BookOpen,
    defaultRequired: true,
  },
  {
    key: 'alumni_outcomes',
    label: 'Alumni outcomes',
    description:
      'Post-graduation status — employment, higher studies, salary band, first employer name. Used only for alumni survey export; ignored for active learners.',
    icon: ShieldCheck,
    defaultRequired: false,
  },
  {
    key: 'parent_contact',
    label: 'Parent contact',
    description:
      'Parent/guardian name, phone, email. Used solely for accreditation-cycle communications (e.g. parent feedback survey). Never shared with third parties.',
    icon: UsersIcon,
    defaultRequired: false,
  },
];

export default function NAACConsentPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [granted, setGranted] = useState<Record<string, boolean>>(
    DATA_CATEGORIES.reduce<Record<string, boolean>>((acc, c) => {
      acc[c.key] = c.defaultRequired;
      return acc;
    }, {}),
  );
  const [agreedLegal, setAgreedLegal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load existing consent to let the user see/withdraw — if any
  const { data: existing, refetch } = useQuery({
    queryKey: ['accreditation', 'consent', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('accreditation_survey_consents')
        .select('*')
        .eq('user_id', user.id)
        .is('withdrawn_at', null)
        .order('consented_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  if (!user) {
    return (
      <ContentLayout title="NAAC Survey Consent (DPDPA 2023)">
        <Alert variant="destructive">
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>
            Please log in to provide or review your consent.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const handleSubmit = async () => {
    if (!agreedLegal) {
      toast.error('Please acknowledge the legal basis before submitting');
      return;
    }
    const scope = Object.entries(granted)
      .filter(([, v]) => v)
      .reduce<Record<string, boolean>>((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {});
    if (Object.keys(scope).length === 0) {
      toast.error('Grant at least one category to submit consent');
      return;
    }

    setSubmitting(true);
    try {
      const sb = createClientSupabaseClient() as any;
      const { error } = await sb.from('accreditation_survey_consents').insert({
        user_id: user.id,
        consent_version: CONSENT_VERSION,
        body_codes: ['NAAC', 'NIRF'],
        purpose: 'accreditation_surveys',
        legal_basis: 'DPDPA 2023 §6 — informed consent',
        scope,
        user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (error) throw error;
      toast.success('Consent recorded — thank you');
      await refetch();
      // Reset form — next consent will need to be re-granted
      setGranted(
        DATA_CATEGORIES.reduce<Record<string, boolean>>((acc, c) => {
          acc[c.key] = c.defaultRequired;
          return acc;
        }, {}),
      );
      setAgreedLegal(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record consent');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!existing?.id) return;
    setSubmitting(true);
    try {
      const sb = createClientSupabaseClient() as any;
      const { error } = await sb
        .from('accreditation_survey_consents')
        .update({ withdrawn_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
      toast.success('Consent withdrawn');
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to withdraw');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title="NAAC Survey Consent (DPDPA 2023)">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          {
            label: 'Surveys',
            href: '/accreditation/naac/surveys/consent',
          },
          {
            label: 'Consent',
            href: '/accreditation/naac/surveys/consent',
          },
        ]}
      />

      <div className="space-y-6 max-w-3xl">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Scale className="h-6 w-6 text-primary" />
              Consent for accreditation surveys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Under India's Digital Personal Data Protection Act 2023 (DPDPA),
              JKKN needs your informed consent before using your personal data
              for accreditation surveys (NAAC 8.4 Learner Experience Survey and
              NIRF perception sub-surveys).
            </p>
            <p>
              Your data is used <strong>only</strong> for accreditation cycles.
              It is never sold, never shared with advertisers, never used for
              marketing. You can withdraw consent at any time from this page,
              and any future export will exclude your record within 24 hours.
            </p>
          </CardContent>
        </Card>

        {existing && (
          <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>You already have an active consent on file</AlertTitle>
            <AlertDescription className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Version: {existing.consent_version}</Badge>
                <Badge variant="outline">
                  Granted: {new Date(existing.consented_at).toLocaleDateString()}
                </Badge>
                {(existing.body_codes as string[]).map((bc) => (
                  <Badge key={bc}>{bc}</Badge>
                ))}
              </div>
              <p className="text-xs">
                Categories granted:{' '}
                {Object.keys(existing.scope ?? {}).join(', ') || 'none'}
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleWithdraw}
                disabled={submitting}
              >
                Withdraw consent
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {DATA_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.key}
                  className="flex items-start gap-3 rounded-lg border p-4"
                >
                  <Checkbox
                    id={`cat-${cat.key}`}
                    checked={!!granted[cat.key]}
                    onCheckedChange={(v) =>
                      setGranted((prev) => ({ ...prev, [cat.key]: !!v }))
                    }
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor={`cat-${cat.key}`}
                      className="flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {cat.label}
                      {cat.defaultRequired && (
                        <Badge variant="secondary" className="text-[10px]">
                          recommended
                        </Badge>
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {cat.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="legal-agree"
                checked={agreedLegal}
                onCheckedChange={(v) => setAgreedLegal(!!v)}
                className="mt-1"
              />
              <Label
                htmlFor="legal-agree"
                className="text-sm cursor-pointer leading-relaxed"
              >
                I have read the purpose above and consent to JKKN using the data
                categories I ticked for accreditation-cycle surveys. I understand
                I can withdraw this consent any time from this page.
              </Label>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                Questions? <a href="mailto:iqac@jkkn.ac.in" className="underline">
                  iqac@jkkn.ac.in
                </a>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !agreedLegal}
              >
                {submitting ? 'Recording consent…' : 'Grant consent'}
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Legal basis: DPDPA 2023 §6 (informed consent). Consent version{' '}
              <code>{CONSENT_VERSION}</code>. Your IP address and browser are
              captured alongside the timestamp for audit.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
