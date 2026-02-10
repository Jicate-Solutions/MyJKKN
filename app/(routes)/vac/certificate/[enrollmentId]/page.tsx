'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VACService } from '@/lib/services/vac-service';
import { vacQueryKeys } from '@/hooks/vac/use-vac';
import {
  ArrowLeft,
  Download,
  BookOpen,
} from 'lucide-react';

export default function CertificatePage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = use(params);
  const certificateRef = useRef<HTMLDivElement>(null);

  const { data: enrollment, isLoading } = useQuery({
    queryKey: vacQueryKeys.enrollment(enrollmentId),
    queryFn: () => VACService.getEnrollmentById(enrollmentId),
    enabled: !!enrollmentId,
  });

  const handlePrint = () => {
    window.print();
  };

  // Format completion date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Certificate ID from enrollment ID
  const certificateId = enrollmentId
    ? `JKKN-VAC-${enrollmentId.substring(0, 8).toUpperCase()}`
    : '';

  if (isLoading) {
    return (
      <ContentLayout title="Certificate">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[600px] w-full max-w-4xl mx-auto" />
        </div>
      </ContentLayout>
    );
  }

  if (!enrollment) {
    return (
      <ContentLayout title="Certificate Not Found">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Certificate</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="text-center py-16">
            <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Certificate Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The enrollment record could not be found. Please check the link and try again.
            </p>
            <Link href="/vac/my-courses">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Courses
              </Button>
            </Link>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (enrollment.status !== 'completed') {
    return (
      <ContentLayout title="Course Not Completed">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Certificate</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="text-center py-16">
            <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Course Not Yet Completed</h2>
            <p className="text-muted-foreground mb-6">
              You need to complete all lessons in this course before you can view your certificate.
            </p>
            <Link href={`/vac/${enrollment.course_id}`}>
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Continue Learning
              </Button>
            </Link>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <>
      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          /* Hide everything except the certificate */
          body * {
            visibility: hidden;
          }
          #certificate-container,
          #certificate-container * {
            visibility: visible;
          }
          #certificate-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          /* Hide the action buttons and breadcrumb when printing */
          .print-hidden {
            display: none !important;
          }
          /* Ensure the certificate fills the page nicely */
          @page {
            size: landscape;
            margin: 0.5in;
          }
        }
      `}</style>

      <ContentLayout title="Certificate of Completion">
        <div className="space-y-6">
          {/* Breadcrumb - hidden in print */}
          <div className="print-hidden">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
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
          </div>

          {/* Action buttons - hidden in print */}
          <div className="flex items-center justify-between print-hidden">
            <Link href="/vac/my-courses">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Courses
              </Button>
            </Link>
            <Button onClick={handlePrint} className="gap-2">
              <Download className="h-4 w-4" />
              Download as PDF
            </Button>
          </div>

          {/* Certificate */}
          <div
            id="certificate-container"
            ref={certificateRef}
            className="flex justify-center"
          >
            <div className="w-full max-w-4xl bg-white dark:bg-white rounded-lg shadow-xl overflow-hidden">
              {/* Outer decorative border */}
              <div className="p-3">
                <div className="border-[3px] border-amber-600 rounded-lg p-2">
                  <div className="border border-amber-400 rounded-lg p-8 md:p-12 relative">
                    {/* Corner decorations */}
                    <div className="absolute top-2 left-2 w-12 h-12 border-t-2 border-l-2 border-amber-500 rounded-tl-lg" />
                    <div className="absolute top-2 right-2 w-12 h-12 border-t-2 border-r-2 border-amber-500 rounded-tr-lg" />
                    <div className="absolute bottom-2 left-2 w-12 h-12 border-b-2 border-l-2 border-amber-500 rounded-bl-lg" />
                    <div className="absolute bottom-2 right-2 w-12 h-12 border-b-2 border-r-2 border-amber-500 rounded-br-lg" />

                    {/* Certificate content */}
                    <div className="text-center space-y-6">
                      {/* Institution Header */}
                      <div className="space-y-1">
                        <h2 className="text-lg md:text-xl font-semibold tracking-widest text-amber-700 uppercase">
                          JKKN Educational Institutions
                        </h2>
                        <p className="text-sm text-gray-500 tracking-wide">
                          Value Added Course Programme
                        </p>
                      </div>

                      {/* Decorative divider */}
                      <div className="flex items-center justify-center gap-4">
                        <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-400" />
                        <div className="w-2 h-2 rotate-45 bg-amber-500" />
                        <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-400" />
                      </div>

                      {/* Title */}
                      <div className="space-y-2 py-2">
                        <h1 className="text-3xl md:text-4xl font-serif font-bold text-gray-800 tracking-wide">
                          Certificate of Completion
                        </h1>
                        <p className="text-gray-500 text-sm italic">
                          This is to certify that
                        </p>
                      </div>

                      {/* Student Name */}
                      <div className="py-2">
                        <h2 className="text-2xl md:text-3xl font-serif font-bold text-gray-900 border-b-2 border-amber-400 inline-block pb-2 px-8">
                          {enrollment.user_name || 'Student'}
                        </h2>
                      </div>

                      {/* Description */}
                      <div className="max-w-2xl mx-auto space-y-2">
                        <p className="text-gray-600 leading-relaxed">
                          has successfully completed the Value Added Course
                        </p>
                        <h3 className="text-xl md:text-2xl font-semibold text-gray-800">
                          {enrollment.course_name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Course Code: {enrollment.course_code}
                        </p>
                      </div>

                      {/* Course Details Grid */}
                      <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600 pt-2">
                        <div className="text-center">
                          <div className="font-semibold text-gray-700">Institution</div>
                          <div>{enrollment.course_institution}</div>
                        </div>
                        {enrollment.course_track && (
                          <div className="text-center">
                            <div className="font-semibold text-gray-700">Track</div>
                            <div className="capitalize">{enrollment.course_track}</div>
                          </div>
                        )}
                        <div className="text-center">
                          <div className="font-semibold text-gray-700">Duration</div>
                          <div>{enrollment.course_duration} Hours</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-gray-700">Completed On</div>
                          <div>
                            {enrollment.completed_at
                              ? formatDate(enrollment.completed_at)
                              : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Decorative divider */}
                      <div className="flex items-center justify-center gap-4 pt-2">
                        <div className="h-px w-24 bg-gradient-to-r from-transparent to-amber-400" />
                        <div className="w-2 h-2 rotate-45 bg-amber-500" />
                        <div className="h-px w-24 bg-gradient-to-l from-transparent to-amber-400" />
                      </div>

                      {/* Signature line and Certificate ID */}
                      <div className="flex items-end justify-between pt-6 px-4 md:px-12">
                        <div className="text-center">
                          <div className="w-40 border-b border-gray-400 mb-1" />
                          <p className="text-xs text-gray-500">Course Director</p>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-400 font-mono">
                            {certificateId}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Certificate ID</p>
                        </div>
                        <div className="text-center">
                          <div className="w-40 border-b border-gray-400 mb-1" />
                          <p className="text-xs text-gray-500">Head of Institution</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentLayout>
    </>
  );
}
