'use client';

import { use, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { useMyEnrollments } from '@/hooks/vac/use-vac';
import { useCASELearnerProgress } from '@/hooks/vac/use-case';
import type { VACEnrollmentWithDetails } from '@/types/vac';
import type { CASELearnerProgress } from '@/types/case';
import {
  Download,
  Award,
  ArrowLeft,
  GraduationCap,
  Clock,
  BookOpen,
  ShieldCheck,
  Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Certificate Design Component ───────────────────────────────────────────

function CertificateView({
  enrollment,
  userName,
  isSeniorLearner,
}: {
  enrollment: VACEnrollmentWithDetails;
  userName: string;
  isSeniorLearner: boolean;
}) {
  const completionDate = enrollment.completed_at
    ? new Date(enrollment.completed_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'N/A';

  return (
    <div
      id="certificate-content"
      className="bg-white dark:bg-white text-gray-900 rounded-lg border-4 border-double border-amber-600 p-8 md:p-12 max-w-3xl mx-auto aspect-[1.414/1] flex flex-col print:border-0 print:rounded-none"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <GraduationCap className="h-10 w-10 text-amber-600" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-amber-800 tracking-wide">
              JKKN Educational Institutions
            </h1>
            <p className="text-xs text-gray-500 tracking-widest uppercase">
              Centre of Excellence
            </p>
          </div>
          <GraduationCap className="h-10 w-10 text-amber-600" />
        </div>
      </div>

      {/* Decorative line */}
      <div className="flex items-center gap-2 my-4">
        <div className="flex-1 h-px bg-amber-300" />
        <Award className="h-6 w-6 text-amber-500" />
        <div className="flex-1 h-px bg-amber-300" />
      </div>

      {/* Title */}
      <div className="text-center space-y-1 my-2">
        <h2 className="text-xl md:text-2xl font-serif font-bold text-gray-800 tracking-wider uppercase">
          Certificate of Completion
        </h2>
        <p className="text-sm text-gray-500">Value-Added Course Programme</p>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-4">
        <p className="text-sm text-gray-600">This is to certify that</p>
        <p className="text-2xl md:text-3xl font-serif font-bold text-gray-900 border-b-2 border-amber-300 pb-2 px-8">
          {userName}
        </p>
        <p className="text-sm text-gray-600 max-w-md leading-relaxed">
          has successfully completed the value-added course
        </p>
        <div className="space-y-1">
          <p className="text-lg md:text-xl font-semibold text-amber-800">
            {enrollment.course_name}
          </p>
          <p className="text-sm text-gray-500 font-mono">
            {enrollment.course_code}
          </p>
        </div>

        {/* Course details grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center pt-4 w-full max-w-lg">
          <div>
            <p className="text-xs text-gray-400 uppercase">Duration</p>
            <p className="text-sm font-medium">{enrollment.course_duration} hours</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Track</p>
            <p className="text-sm font-medium">{enrollment.course_track}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Completed On</p>
            <p className="text-sm font-medium">{completionDate}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Fee</p>
            <p className="text-sm font-medium">
              {enrollment.course_fee > 0
                ? `INR ${enrollment.course_fee.toLocaleString('en-IN')}`
                : 'Free'}
            </p>
          </div>
        </div>

        {/* Senior Learner endorsement */}
        {isSeniorLearner && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mt-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <div className="text-left">
              <p className="text-sm font-semibold text-amber-800">
                Senior Learner Endorsement
              </p>
              <p className="text-xs text-amber-600">
                All 6 CASE tracks completed - Qualified for Senior Learner status
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Decorative line */}
      <div className="flex items-center gap-2 my-2">
        <div className="flex-1 h-px bg-amber-300" />
        <div className="h-2 w-2 rounded-full bg-amber-400" />
        <div className="flex-1 h-px bg-amber-300" />
      </div>

      {/* Footer */}
      <div className="flex items-end justify-between pt-4">
        <div className="text-center">
          <div className="w-32 border-b border-gray-400 mb-1" />
          <p className="text-xs text-gray-500">Course Coordinator</p>
        </div>
        <div className="text-center">
          {/* QR code placeholder */}
          <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded flex items-center justify-center mb-1">
            <span className="text-[8px] text-gray-400">QR</span>
          </div>
          <p className="text-[8px] text-gray-400">Verify</p>
        </div>
        <div className="text-center">
          <div className="w-32 border-b border-gray-400 mb-1" />
          <p className="text-xs text-gray-500">Principal</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CertificatePage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id || '';
  const userName = profile?.full_name || 'Learner';

  const { data: enrollments, isLoading: enrollmentsLoading } = useMyEnrollments(userId);
  const { data: caseProgress } = useCASELearnerProgress(userId);

  // Find the specific enrollment
  const enrollment = useMemo(() => {
    if (!enrollments || !Array.isArray(enrollments)) return null;
    return (enrollments as VACEnrollmentWithDetails[]).find(
      (e) => e.id === enrollmentId
    ) || null;
  }, [enrollments, enrollmentId]);

  // Check if all 6 CASE tracks are completed
  const isSeniorLearner = useMemo(() => {
    if (!caseProgress) return false;
    return (caseProgress as CASELearnerProgress).tracks_completed >= 6;
  }, [caseProgress]);

  const handleDownloadPDF = useCallback(async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      if (!enrollment) return;

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Border
      doc.setDrawColor(184, 134, 11);
      doc.setLineWidth(1.5);
      doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
      doc.setLineWidth(0.5);
      doc.rect(11, 11, pageWidth - 22, pageHeight - 22);

      // Header
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(139, 92, 15);
      doc.text('JKKN Educational Institutions', pageWidth / 2, 30, {
        align: 'center',
      });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128, 128, 128);
      doc.text('Centre of Excellence', pageWidth / 2, 37, {
        align: 'center',
      });

      // Decorative line
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.3);
      doc.line(40, 42, pageWidth - 40, 42);

      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text('CERTIFICATE OF COMPLETION', pageWidth / 2, 55, {
        align: 'center',
      });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128, 128, 128);
      doc.text('Value-Added Course Programme', pageWidth / 2, 62, {
        align: 'center',
      });

      // Body
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text('This is to certify that', pageWidth / 2, 78, {
        align: 'center',
      });

      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(userName, pageWidth / 2, 90, { align: 'center' });

      // Name underline
      const nameWidth = doc.getTextWidth(userName);
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.5);
      doc.line(
        (pageWidth - nameWidth) / 2 - 10,
        93,
        (pageWidth + nameWidth) / 2 + 10,
        93
      );

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(
        'has successfully completed the value-added course',
        pageWidth / 2,
        103,
        { align: 'center' }
      );

      // Course name
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(139, 92, 15);
      doc.text(enrollment.course_name, pageWidth / 2, 115, {
        align: 'center',
      });

      doc.setFontSize(10);
      doc.setFont('courier', 'normal');
      doc.setTextColor(128, 128, 128);
      doc.text(enrollment.course_code, pageWidth / 2, 122, {
        align: 'center',
      });

      // Details
      const detailY = 135;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128, 128, 128);

      const completionDate = enrollment.completed_at
        ? new Date(enrollment.completed_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : 'N/A';

      const details = [
        `Duration: ${enrollment.course_duration} hours`,
        `Track: ${enrollment.course_track}`,
        `Completed: ${completionDate}`,
      ];
      doc.text(details.join('  |  '), pageWidth / 2, detailY, {
        align: 'center',
      });

      // Senior learner endorsement
      if (isSeniorLearner) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(139, 92, 15);
        doc.text(
          'Senior Learner Endorsement - All 6 CASE Tracks Completed',
          pageWidth / 2,
          detailY + 12,
          { align: 'center' }
        );
      }

      // Signature lines
      const sigY = pageHeight - 30;
      doc.setDrawColor(128, 128, 128);
      doc.setLineWidth(0.3);
      doc.line(30, sigY, 90, sigY);
      doc.line(pageWidth - 90, sigY, pageWidth - 30, sigY);

      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text('Course Coordinator', 60, sigY + 5, { align: 'center' });
      doc.text('Principal', pageWidth - 60, sigY + 5, { align: 'center' });

      // QR placeholder
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(pageWidth / 2 - 8, sigY - 16, 16, 16);
      doc.setFontSize(5);
      doc.text('QR', pageWidth / 2, sigY - 6, { align: 'center' });

      doc.save(
        `Certificate-${enrollment.course_code}-${userName.replace(/\s+/g, '_')}.pdf`
      );
      toast.success('Certificate downloaded');
    } catch (error) {
      console.error('[vac/certificate] PDF generation failed:', error);
      toast.error('Failed to generate PDF');
    }
  }, [enrollment, userName, isSeniorLearner]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (enrollmentsLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="max-w-3xl mx-auto space-y-4 mt-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!enrollment) {
    return (
      <ContentLayout title="Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <Award className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Certificate not found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This enrollment was not found or the course is not yet completed.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/vac/my-courses')}
          >
            Back to My Courses
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (enrollment.status !== 'completed') {
    return (
      <ContentLayout title="Not Completed">
        <div className="flex flex-col items-center justify-center py-16">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Course Not Yet Completed</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Complete all lessons to receive your certificate.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push(`/vac/${enrollment.course_id}`)}
          >
            Continue Course
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Certificate">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/my-courses">My Courses</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Certificate</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/vac/my-courses')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to My Courses
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        {/* Certificate */}
        <CertificateView
          enrollment={enrollment}
          userName={userName}
          isSeniorLearner={isSeniorLearner}
        />
      </div>
    </ContentLayout>
  );
}
