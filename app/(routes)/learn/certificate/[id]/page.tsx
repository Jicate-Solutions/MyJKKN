'use client';

import { use, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCertificate } from '@/hooks/pde/use-pde';
import { downloadCertificatePDF } from '@/lib/utils/certificate-pdf';
import type { CertificateData } from '@/lib/utils/certificate-pdf';
import type { FinksDimension } from '@/types/pde';
import {
  Download,
  Award,
  ArrowLeft,
  GraduationCap,
  Clock,
  Target,
  Printer,
  Copy,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';

// ── Fink's Labels ────────────────────────────────────────────────────────────

const FINKS_LABELS: Record<string, string> = {
  foundational_knowledge: 'Foundational Knowledge',
  application: 'Application',
  integration: 'Integration',
  human_dimension: 'Human Dimension',
  caring: 'Caring',
  learning_how_to_learn: 'Learning How to Learn',
};

// ── Certificate HTML Preview ─────────────────────────────────────────────────

function CertificatePreview({
  certificateNumber,
  learnerName,
  courseName,
  completionDate,
  finalScore,
  completionHours,
  finksProfile,
}: {
  certificateNumber: string;
  learnerName: string;
  courseName: string;
  completionDate: string;
  finalScore: number;
  completionHours: number;
  finksProfile?: Record<string, number> | null;
}) {
  return (
    <div
      className="bg-[#fbfbee] rounded-lg border-4 border-double border-[#0b6d41] p-8 md:p-12 max-w-4xl mx-auto aspect-[1.414/1] flex flex-col print:border-0 print:rounded-none"
    >
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-3">
          <GraduationCap className="h-8 w-8 text-[#0b6d41]" />
          <h1 className="text-2xl md:text-3xl font-bold text-[#0b6d41] tracking-wide">
            JKKN Institutions
          </h1>
          <GraduationCap className="h-8 w-8 text-[#0b6d41]" />
        </div>
        <p className="text-xs text-gray-500 tracking-widest uppercase">
          India&apos;s First Human-AI AGI Collab Campus
        </p>
      </div>

      {/* Yellow decorative line */}
      <div className="flex items-center gap-2 my-3">
        <div className="flex-1 h-0.5 bg-[#ffde59]" />
        <Award className="h-5 w-5 text-[#ffde59]" />
        <div className="flex-1 h-0.5 bg-[#ffde59]" />
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800 tracking-wider uppercase">
          Certificate of Completion
        </h2>
        <p className="text-sm text-gray-500">Principal-Driven Education Programme</p>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-4">
        <p className="text-sm text-gray-500">This is to certify that</p>
        <p className="text-2xl md:text-3xl font-bold text-gray-900 border-b-2 border-[#ffde59] pb-2 px-8">
          {learnerName}
        </p>
        <p className="text-sm text-gray-500">has successfully completed the course</p>
        <p className="text-lg md:text-xl font-semibold text-[#0b6d41]">
          {courseName}
        </p>

        {/* Details grid */}
        <div className="grid grid-cols-3 gap-6 text-center pt-3 w-full max-w-md">
          <div>
            <p className="text-xs text-gray-400 uppercase">Completed</p>
            <p className="text-sm font-medium text-gray-700">{completionDate}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Score</p>
            <p className="text-sm font-medium text-gray-700">{finalScore}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Duration</p>
            <p className="text-sm font-medium text-gray-700">{completionHours} hours</p>
          </div>
        </div>

        {/* Fink's Profile (simple bar display for HTML) */}
        {finksProfile && Object.keys(finksProfile).length > 0 && (
          <div className="w-full max-w-md pt-3 space-y-1">
            <p className="text-xs font-semibold text-[#0b6d41] uppercase tracking-wider">
              Fink&apos;s Taxonomy Profile
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(finksProfile).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-24 text-right truncate">
                    {FINKS_LABELS[key] || key}
                  </span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0b6d41] rounded-full"
                      style={{ width: `${Math.min(value, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-6">{value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-end justify-between pt-2">
        <div className="text-center">
          <div className="w-28 border-b border-gray-400 mb-1" />
          <p className="text-xs text-gray-400">Course Coordinator</p>
        </div>
        <div className="text-center space-y-0.5">
          <p className="text-[7px] font-mono text-gray-400">
            {certificateNumber}
          </p>
        </div>
        <div className="text-center">
          <div className="w-28 border-b border-gray-400 mb-1" />
          <p className="text-xs text-gray-400">Principal</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function PDECertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: certificateId } = use(params);
  const router = useRouter();
  const { data: certificate, isLoading } = useCertificate(certificateId);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || 'https://myjkkn.com';

  const verificationUrl = certificate
    ? `${appUrl}/verify/${certificate.certificate_number}`
    : '';

  const completionDate = useMemo(() => {
    if (!certificate?.issued_at) return 'N/A';
    return new Date(certificate.issued_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [certificate?.issued_at]);

  const handleDownloadPDF = useCallback(async () => {
    if (!certificate) return;
    setIsDownloading(true);
    try {
      const certData: CertificateData = {
        certificateNumber: certificate.certificate_number,
        learnerName: (certificate as Record<string, unknown>).learner_name as string || 'Learner',
        courseName: (certificate as Record<string, unknown>).course_name as string || 'Course',
        courseCode: (certificate as Record<string, unknown>).course_code as string | undefined,
        completionDate,
        finalScore: certificate.final_score || 0,
        completionHours: certificate.completion_hours || 0,
        finksProfile: certificate.finks_profile || undefined,
        verificationUrl,
      };
      await downloadCertificatePDF(certData);
      toast.success('Certificate downloaded');
    } catch (error) {
      console.error('[learn/certificate] PDF download failed:', error);
      toast.error('Failed to download certificate');
    } finally {
      setIsDownloading(false);
    }
  }, [certificate, completionDate, verificationUrl]);

  const handleCopyLink = useCallback(async () => {
    if (!verificationUrl) return;
    try {
      await navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      toast.success('Verification link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [verificationUrl]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (isLoading) {
    return (
      <ContentLayout title="Loading Certificate...">
        <div className="max-w-4xl mx-auto space-y-4 mt-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!certificate) {
    return (
      <ContentLayout title="Certificate Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <Award className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Certificate not found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This certificate does not exist or has been removed.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Certificate">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn' },
          { label: 'Certificate' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
            >
              <Download className="h-4 w-4 mr-2" />
              {isDownloading ? 'Generating...' : 'Download PDF'}
            </Button>
          </div>
        </div>

        {/* Certificate Preview */}
        <CertificatePreview
          certificateNumber={certificate.certificate_number}
          learnerName={
            (certificate as Record<string, unknown>).learner_name as string || 'Learner'
          }
          courseName={
            (certificate as Record<string, unknown>).course_name as string || 'Course'
          }
          completionDate={completionDate}
          finalScore={certificate.final_score || 0}
          completionHours={certificate.completion_hours || 0}
          finksProfile={certificate.finks_profile}
        />

        {/* Certificate Info Card */}
        <Card className="max-w-4xl mx-auto print:hidden">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase mb-1">Certificate No.</p>
                <p className="font-mono font-medium text-xs">{certificate.certificate_number}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase mb-1">Type</p>
                <Badge variant="secondary" className="text-xs">
                  {certificate.certificate_type.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase mb-1">Issued</p>
                <p className="font-medium">{completionDate}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase mb-1">Agency Index</p>
                <p className="font-medium">
                  {certificate.agency_index != null ? `${certificate.agency_index}%` : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
