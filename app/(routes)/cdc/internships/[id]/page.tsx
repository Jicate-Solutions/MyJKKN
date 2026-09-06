'use client';

// app/(routes)/cdc/internships/[id]/page.tsx
// CDC Sprint 4 — Corporate internship detail page with certificate workflow

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Award, Download, ArrowLeft, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import Loading from '@/components/Loading/Loading';
import { useCdcInternshipDetail } from '@/hooks/cdc/use-cdc-internships';
import { useAuth } from '@/hooks/use-auth';
import type { IssueCertificatePayload } from '@/types/cdc/internships';
import { AddToLinkedInButton } from '@/components/linkedin/add-to-linkedin-button';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  withdrawn: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['active', 'withdrawn', 'cancelled'],
  active: ['completed', 'withdrawn', 'cancelled'],
  completed: [],
  withdrawn: [],
  cancelled: [],
};

export default function CdcInternshipDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.internships" action="view">
      <CdcInternshipDetailContent {...props} />
    </PermissionGuard>
  );
}

function CdcInternshipDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const { internship, loading, error, fetchDetail, updateStatus, issueCertificate } =
    useCdcInternshipDetail(id);

  const [issueCertOpen, setIssueCertOpen] = useState(false);
  const [certPayload, setCertPayload] = useState<IssueCertificatePayload>({
    attendance_percentage: 0,
    evaluation_average: 0,
    competencies_passed: 0,
    competencies_total: 0,
  });

  useEffect(() => {
    fetchDetail();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading && !internship) return <Loading />;

  if (error || !internship) {
    return (
      <ContentLayout title="Internship Not Found">
        <div className="text-center py-16">
          <p className="text-gray-500">Internship not found or you do not have access.</p>
          <Link href="/cdc/internships" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to list
            </Button>
          </Link>
        </div>
      </ContentLayout>
    );
  }

  const hasCert = !!(internship.certificate && !internship.certificate.is_revoked);
  const canIssueCert = internship.status === 'completed' && !hasCert;
  const allowedTransitions = STATUS_TRANSITIONS[internship.status] ?? [];

  const handleIssueCert = async () => {
    const institutionId = internship.institution_id;
    await issueCertificate(certPayload, institutionId);
    setIssueCertOpen(false);
  };

  return (
    <ContentLayout title="Internship Detail">
      <div className="space-y-6 max-w-4xl">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/cdc/internships">Internships</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Detail</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {internship.site?.site_name ?? 'Corporate Internship'}
            </h1>
            {internship.site?.city && (
              <p className="text-sm text-gray-500 mt-1">
                {internship.site.city}{internship.site.state ? `, ${internship.site.state}` : ''}
              </p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[internship.status] ?? ''}`}>
            {internship.status.charAt(0).toUpperCase() + internship.status.slice(1)}
          </span>
        </div>

        {/* Key details */}
        <Card>
          <CardHeader><CardTitle className="text-base">Assignment Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
              <div>
                <dt className="text-gray-500">Type</dt>
                <dd className="font-medium mt-0.5">
                  <Badge variant="outline">Corporate Internship</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Start date</dt>
                <dd className="font-medium mt-0.5">{internship.rotation_start_date}</dd>
              </div>
              <div>
                <dt className="text-gray-500">End date</dt>
                <dd className="font-medium mt-0.5">{internship.rotation_end_date}</dd>
              </div>
              {internship.department_rotation && (
                <div>
                  <dt className="text-gray-500">Department</dt>
                  <dd className="font-medium mt-0.5">{internship.department_rotation}</dd>
                </div>
              )}
              {internship.attendance_percentage != null && (
                <div>
                  <dt className="text-gray-500">Attendance</dt>
                  <dd className="font-medium mt-0.5">{internship.attendance_percentage}%</dd>
                </div>
              )}
              {internship.overall_grade && (
                <div>
                  <dt className="text-gray-500">Grade</dt>
                  <dd className="font-medium mt-0.5">{internship.overall_grade}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Required attendance</dt>
                <dd className="font-medium mt-0.5">{internship.required_attendance_pct}%</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Status timeline / actions */}
        {allowedTransitions.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Update Status</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {allowedTransitions.map(next => (
                  <Button
                    key={next}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => updateStatus(next)}
                  >
                    Mark as {next}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Certificate section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Certificate</h2>

          {hasCert && internship.certificate && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-2 rounded-full">
                      <Award className="w-5 h-5 text-green-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-green-800">Certificate Issued</p>
                      <p className="text-sm text-green-700 mt-0.5">
                        No. {internship.certificate.certificate_number} ·{' '}
                        Issued {internship.certificate.issued_date}
                      </p>
                      <p className="text-xs text-green-600 mt-0.5">
                        Attendance: {internship.certificate.attendance_percentage}% ·{' '}
                        Evaluation: {internship.certificate.evaluation_average}/10
                      </p>
                    </div>
                  </div>
                  {internship.certificate.certificate_pdf_url ? (
                    <a
                      href={internship.certificate.certificate_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="outline" className="border-green-400 text-green-800">
                        <Download className="w-4 h-4 mr-2" />
                        Download PDF
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      No PDF uploaded
                    </Button>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-green-200">
                  <AddToLinkedInButton
                    className="w-full"
                    cert={{
                      name: internship.site?.site_name
                        ? `Corporate Internship — ${internship.site.site_name}`
                        : 'Corporate Internship',
                      certId: internship.certificate.certificate_number,
                      certUrl:
                        internship.certificate.verification_url ||
                        internship.certificate.certificate_pdf_url ||
                        undefined,
                      issuedAt: internship.certificate.issued_date,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {canIssueCert && (
            <PermissionGuard module="cdc.internships" action="edit">
            <Card className="border-dashed border-2 border-gray-200">
              <CardContent className="p-5 text-center">
                <Award className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-4">
                  This internship is completed. Issue the certificate now.
                </p>
                <Button onClick={() => setIssueCertOpen(true)}>
                  <Award className="w-4 h-4 mr-2" />
                  Issue Certificate
                </Button>
              </CardContent>
            </Card>
            </PermissionGuard>
          )}

          {!hasCert && !canIssueCert && (
            <Card>
              <CardContent className="p-5 text-center">
                <p className="text-sm text-gray-400">
                  Certificate will be available once internship status is{' '}
                  <strong>completed</strong>.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Issue Certificate Dialog */}
        <Dialog open={issueCertOpen} onOpenChange={setIssueCertOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Issue Internship Certificate</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-1">
                <Label htmlFor="att_pct">Attendance percentage (%)</Label>
                <Input
                  id="att_pct"
                  type="number"
                  min={0}
                  max={100}
                  value={certPayload.attendance_percentage}
                  onChange={e =>
                    setCertPayload(p => ({ ...p, attendance_percentage: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="eval_avg">Evaluation average (out of 10)</Label>
                <Input
                  id="eval_avg"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={certPayload.evaluation_average}
                  onChange={e =>
                    setCertPayload(p => ({ ...p, evaluation_average: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="comp_pass">Competencies passed</Label>
                <Input
                  id="comp_pass"
                  type="number"
                  min={0}
                  value={certPayload.competencies_passed ?? 0}
                  onChange={e =>
                    setCertPayload(p => ({ ...p, competencies_passed: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="comp_total">Competencies total</Label>
                <Input
                  id="comp_total"
                  type="number"
                  min={0}
                  value={certPayload.competencies_total ?? 0}
                  onChange={e =>
                    setCertPayload(p => ({ ...p, competencies_total: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIssueCertOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleIssueCert}
                disabled={loading || certPayload.attendance_percentage === 0}
              >
                {loading ? 'Issuing…' : 'Issue Certificate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
