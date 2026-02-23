'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Award,
  ArrowLeft,
  Edit,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  IndianRupee,
  Calendar,
  Target,
  BookOpen,
  FileText
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ScholarshipService } from '@/lib/services/admission/scholarship-service';
import type { Scholarship, ScholarshipApplication } from '@/lib/services/admission/scholarship-service';

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className={`p-4 rounded-lg ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    under_review: 'bg-blue-100 text-blue-800',
    disbursed: 'bg-purple-100 text-purple-800',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
}

export default function ScholarshipViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [scholarship, setScholarship] = useState<Scholarship | null>(null);
  const [applications, setApplications] = useState<ScholarshipApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      ScholarshipService.getScholarshipById(id),
      ScholarshipService.getApplicationsByScholarshipId(id),
    ]).then(([sch, apps]) => {
      if (!sch) {
        toast.error('Scholarship not found');
        router.push('/admission/scholarships');
        return;
      }
      setScholarship(sch);
      setApplications(apps);
    }).catch(() => {
      toast.error('Failed to load scholarship');
    }).finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <ContentLayout title="Scholarship Details">
        <div className="space-y-4 max-w-4xl">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!scholarship) return null;

  const totalApps = applications.length;
  const approved = applications.filter(a => a.status === 'approved').length;
  const pending = applications.filter(a => a.status === 'pending').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;
  const slotsUsed = scholarship.used_slots || 0;
  const slotsTotal = scholarship.total_slots || 0;
  const slotsFill = slotsTotal > 0 ? (slotsUsed / slotsTotal) * 100 : 0;

  return (
    <ContentLayout title="Scholarship Details">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/admission">Admission</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/admission/scholarships">Scholarships</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{scholarship.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admission/scholarships"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Award className="h-6 w-6 text-yellow-500" />
              {scholarship.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">{scholarship.code}</span>
              <Badge className={scholarship.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                {scholarship.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {(scholarship.scholarship_type || '').replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        </div>
        <Button onClick={() => router.push(`/admission/scholarships/${id}/edit`)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      <div className="mt-6 space-y-6">
        {/* Application Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Applications" value={totalApps} icon={FileText} color="bg-blue-50 text-blue-800" />
          <StatCard label="Approved" value={approved} icon={CheckCircle2} color="bg-green-50 text-green-800" />
          <StatCard label="Pending" value={pending} icon={Clock} color="bg-yellow-50 text-yellow-800" />
          <StatCard label="Rejected" value={rejected} icon={XCircle} color="bg-red-50 text-red-800" />
        </div>

        {/* Scholarship Details */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IndianRupee className="h-5 w-5" />
                Benefit Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Benefit Type</span>
                <span className="font-medium capitalize">{scholarship.benefit_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Benefit Value</span>
                <span className="font-medium">
                  {scholarship.benefit_type === 'percentage'
                    ? `${scholarship.benefit_value}%`
                    : `₹${(scholarship.benefit_value || 0).toLocaleString()}`}
                </span>
              </div>
              {scholarship.max_benefit && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Benefit</span>
                  <span className="font-medium">₹{scholarship.max_benefit.toLocaleString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Slot Allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Slots</span>
                <span className="font-medium">{slotsTotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Used Slots</span>
                <span className="font-medium">{slotsUsed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="font-medium text-green-600">{slotsTotal - slotsUsed}</span>
              </div>
              <Progress value={slotsFill} className="h-2 mt-2" />
              <p className="text-xs text-muted-foreground text-right">{slotsFill.toFixed(0)}% filled</p>
            </CardContent>
          </Card>
        </div>

        {/* Validity & Academic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Validity & Scope
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Academic Year</p>
                <p className="font-medium">{scholarship.academic_year || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Valid From</p>
                <p className="font-medium">
                  {scholarship.valid_from ? new Date(scholarship.valid_from).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Valid Until</p>
                <p className="font-medium">
                  {scholarship.valid_until ? new Date(scholarship.valid_until).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Requires Application</p>
                <p className="font-medium">{scholarship.requires_application ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Auto Qualify</p>
                <p className="font-medium">{scholarship.auto_qualify ? 'Yes' : 'No'}</p>
              </div>
            </div>
            {scholarship.description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-muted-foreground text-sm mb-1">Description</p>
                <p>{scholarship.description}</p>
              </div>
            )}
            {scholarship.eligibility_criteria && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Eligibility Criteria
                </p>
                <p className="text-sm">
                  {typeof scholarship.eligibility_criteria === 'object'
                    ? (scholarship.eligibility_criteria as any)?.raw || JSON.stringify(scholarship.eligibility_criteria)
                    : scholarship.eligibility_criteria}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Applications Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Applications ({totalApps})
            </CardTitle>
            <CardDescription>All applications received for this scholarship</CardDescription>
          </CardHeader>
          <CardContent>
            {applications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <FileText className="h-10 w-10 mb-2 opacity-40" />
                <p>No applications yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application ID</TableHead>
                    <TableHead>Applied On</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Approved Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium font-mono text-xs">
                        {app.application_id || app.id.slice(0, 8) + '...'}
                      </TableCell>
                      <TableCell>
                        {app.applied_at ? new Date(app.applied_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadge(app.status)}>
                          {(app.status || '').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {app.approved_amount
                          ? `₹${app.approved_amount.toLocaleString()}`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
