'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  useAdmissionApplication,
  useApplicationMutations
} from '@/hooks/admission';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  User,
  FileText,
  Edit,
  Loader2,
  CheckCircle,
  AlertCircle,
  GraduationCap,
  CreditCard,
  Users,
  Hash
} from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ApplicationStatus } from '@/types/admission';

const APPLICATION_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'documents_verified', label: 'Documents Verified' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'withdrawn', label: 'Withdrawn' }
];

function getStatusColor(status: string | null): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800 border-gray-200',
    submitted: 'bg-blue-100 text-blue-800 border-blue-200',
    under_review: 'bg-purple-100 text-purple-800 border-purple-200',
    documents_pending: 'bg-orange-100 text-orange-800 border-orange-200',
    documents_verified: 'bg-amber-100 text-amber-800 border-amber-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    offer_sent: 'bg-teal-100 text-teal-800 border-teal-200',
    offer_accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    enrolled: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    withdrawn: 'bg-slate-100 text-slate-800 border-slate-200'
  };
  return colors[status || 'draft'] || 'bg-gray-100 text-gray-800 border-gray-200';
}

function getStatusIcon(status: string | null) {
  switch (status) {
    case 'approved':
    case 'enrolled':
    case 'offer_accepted':
    case 'documents_verified':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'rejected':
    case 'withdrawn':
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    default:
      return <Clock className="h-4 w-4 text-yellow-600" />;
  }
}

function ApplicationDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ApplicationDetailPageContent() {
  const params = useParams();
  const applicationId = params.id as string;

  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId);

  const { application, isLoading: appLoading, refetch } = useAdmissionApplication(applicationId);
  const { updateApplication, updateApplicationStatus } = useApplicationMutations();

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    previous_qualification: '',
    percentage: '',
    board: '',
    passing_year: '',
    father_name: '',
    mother_name: '',
    guardian_phone: '',
    guardian_email: '',
    notes: ''
  });

  // Program name lookup
  const [programName, setProgramName] = useState<string>('');
  const [leadName, setLeadName] = useState<string>('');

  useEffect(() => {
    if (application?.program_id) {
      const supabase = createClientSupabaseClient();
      supabase
        .from('programs')
        .select('program_name')
        .eq('id', application.program_id)
        .single()
        .then(({ data, error }: { data: any; error: any }) => {
          if (!error && data) {
            setProgramName(data.program_name);
          }
        });
    }
  }, [application?.program_id]);

  useEffect(() => {
    if (application?.lead_id) {
      const supabase = createClientSupabaseClient();
      (supabase as any)
        .from('admission_leads')
        .select('full_name')
        .eq('id', application.lead_id)
        .single()
        .then(({ data, error }: { data: any; error: any }) => {
          if (!error && data) {
            setLeadName(data.full_name);
          }
        });
    }
  }, [application?.lead_id]);

  // Helper to get field value from application (flat columns or form_data JSONB)
  const getField = (field: string): any => {
    if (!application) return null;
    const app = application as any;
    if (app[field] !== undefined && app[field] !== null) return app[field];
    if (app.form_data && app.form_data[field] !== undefined) return app.form_data[field];
    return null;
  };

  const openEditDialog = () => {
    if (!application) return;
    setEditForm({
      full_name: getField('full_name') || '',
      email: getField('email') || '',
      phone: getField('phone') || '',
      date_of_birth: getField('date_of_birth') ? String(getField('date_of_birth')).split('T')[0] : '',
      gender: getField('gender') || '',
      address: getField('address') || '',
      city: getField('city') || '',
      state: getField('state') || '',
      pincode: getField('pincode') || '',
      previous_qualification: getField('previous_qualification') || '',
      percentage: getField('percentage') ? String(getField('percentage')) : '',
      board: getField('board') || '',
      passing_year: getField('passing_year') ? String(getField('passing_year')) : '',
      father_name: getField('father_name') || '',
      mother_name: getField('mother_name') || '',
      guardian_phone: getField('guardian_phone') || '',
      guardian_email: getField('guardian_email') || '',
      notes: application.notes || ''
    });
    setShowEditDialog(true);
  };

  const handleEditChange = (field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditSubmit = () => {
    if (!application) return;

    const updates: any = {
      full_name: editForm.full_name.trim() || null,
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      date_of_birth: editForm.date_of_birth || null,
      gender: editForm.gender || null,
      address: editForm.address.trim() || null,
      city: editForm.city.trim() || null,
      state: editForm.state.trim() || null,
      pincode: editForm.pincode.trim() || null,
      previous_qualification: editForm.previous_qualification.trim() || null,
      percentage: editForm.percentage ? parseFloat(editForm.percentage) : null,
      board: editForm.board.trim() || null,
      passing_year: editForm.passing_year ? parseInt(editForm.passing_year, 10) : null,
      father_name: editForm.father_name.trim() || null,
      mother_name: editForm.mother_name.trim() || null,
      guardian_phone: editForm.guardian_phone.trim() || null,
      guardian_email: editForm.guardian_email.trim() || null,
      notes: editForm.notes.trim() || null,
      form_data: {
        ...(application as any).form_data,
        full_name: editForm.full_name.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        date_of_birth: editForm.date_of_birth || null,
        gender: editForm.gender || null,
        address: editForm.address.trim() || null,
        city: editForm.city.trim() || null,
        state: editForm.state.trim() || null,
        pincode: editForm.pincode.trim() || null,
        father_name: editForm.father_name.trim() || null,
        mother_name: editForm.mother_name.trim() || null,
        guardian_phone: editForm.guardian_phone.trim() || null,
      }
    };

    updateApplication.mutate(
      { id: application.id, data: updates },
      {
        onSuccess: () => {
          setShowEditDialog(false);
          refetch();
        }
      }
    );
  };

  const handleStatusChange = (newStatus: string) => {
    if (!application) return;
    updateApplicationStatus.mutate(
      { id: application.id, status: newStatus as ApplicationStatus },
      { onSuccess: () => refetch() }
    );
  };

  const isLoading = appLoading || !isValidId;

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Application Details">
          <ApplicationDetailSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  if (!application) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Application Not Found">
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-xl font-semibold mb-2">Application Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The application you&apos;re looking for doesn&apos;t exist or has been removed.
              </p>
              <Button asChild>
                <Link href="/admission/applications">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Applications
                </Link>
              </Button>
            </CardContent>
          </Card>
        </ContentLayout>
      </PermissionGuard>
    );
  }

  const displayName = getField('full_name') || 'Unknown Applicant';
  const displayEmail = getField('email');
  const displayPhone = getField('phone');

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Application Details">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/applications">Applications</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{application.application_number || applicationId.slice(0, 8)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" asChild>
                <Link href="/admission/applications">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{displayName}</h1>
                  <Badge className={`${getStatusColor(application.status)} border`} variant="outline">
                    {getStatusIcon(application.status)}
                    <span className="ml-1">{application.status?.replace(/_/g, ' ') || 'Draft'}</span>
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    {application.application_number}
                  </span>
                  {displayEmail && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {displayEmail}
                    </span>
                  )}
                  {displayPhone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {displayPhone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openEditDialog}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </div>
          </div>

          {/* Status Selector */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Current Status:</span>
                  <Badge className={`${getStatusColor(application.status)} border`} variant="outline">
                    {application.status?.replace(/_/g, ' ') || 'Draft'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Move to:</span>
                  <Select
                    value={application.status || 'draft'}
                    onValueChange={handleStatusChange}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPLICATION_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Details */}
            <div className="lg:col-span-2 space-y-6">
              <Tabs defaultValue="details" className="w-full">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="academic">Academic</TabsTrigger>
                  <TabsTrigger value="fees">Fees & Payment</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-4">
                  {/* Personal Information */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Personal Information
                        </CardTitle>
                        <Button variant="outline" size="sm" onClick={openEditDialog}>
                          <Edit className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Full Name</dt>
                          <dd className="font-medium">{displayName}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Email</dt>
                          <dd className="font-medium">{displayEmail || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Phone</dt>
                          <dd className="font-medium">{displayPhone || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Date of Birth</dt>
                          <dd className="font-medium">
                            {getField('date_of_birth')
                              ? new Date(getField('date_of_birth')).toLocaleDateString()
                              : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Gender</dt>
                          <dd className="font-medium capitalize">{getField('gender') || '-'}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Address */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Address
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <dt className="text-sm text-muted-foreground">Address</dt>
                          <dd className="font-medium">{getField('address') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">City</dt>
                          <dd className="font-medium">{getField('city') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">State</dt>
                          <dd className="font-medium">{getField('state') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Pincode</dt>
                          <dd className="font-medium">{getField('pincode') || '-'}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Parent / Guardian */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Parent / Guardian
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Father&apos;s Name</dt>
                          <dd className="font-medium">{getField('father_name') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Mother&apos;s Name</dt>
                          <dd className="font-medium">{getField('mother_name') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Guardian Phone</dt>
                          <dd className="font-medium">{getField('guardian_phone') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Guardian Email</dt>
                          <dd className="font-medium">{getField('guardian_email') || '-'}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="academic" className="mt-4 space-y-4">
                  {/* Academic Details */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        Academic Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Program</dt>
                          <dd className="font-medium">{programName || application.program_id || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Previous Qualification</dt>
                          <dd className="font-medium">{getField('previous_qualification') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Board</dt>
                          <dd className="font-medium">{getField('board') || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Percentage</dt>
                          <dd className="font-medium">
                            {getField('percentage') != null ? `${getField('percentage')}%` : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Passing Year</dt>
                          <dd className="font-medium">{getField('passing_year') || '-'}</dd>
                        </div>
                        {getField('tenth_percentage') != null && (
                          <div>
                            <dt className="text-sm text-muted-foreground">10th Percentage</dt>
                            <dd className="font-medium">{getField('tenth_percentage')}%</dd>
                          </div>
                        )}
                        {getField('twelfth_percentage') != null && (
                          <div>
                            <dt className="text-sm text-muted-foreground">12th Percentage</dt>
                            <dd className="font-medium">{getField('twelfth_percentage')}%</dd>
                          </div>
                        )}
                        {getField('neet_score') != null && (
                          <div>
                            <dt className="text-sm text-muted-foreground">NEET Score</dt>
                            <dd className="font-medium">{getField('neet_score')}</dd>
                          </div>
                        )}
                      </dl>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="fees" className="mt-4 space-y-4">
                  {/* Fees & Payment */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Fees & Payment
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Total Fees</dt>
                          <dd className="font-medium">
                            {application.total_fees != null
                              ? `₹${Number(application.total_fees).toLocaleString('en-IN')}`
                              : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Paid Amount</dt>
                          <dd className="font-medium">
                            {application.paid_amount != null
                              ? `₹${Number(application.paid_amount).toLocaleString('en-IN')}`
                              : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Discount</dt>
                          <dd className="font-medium">
                            {application.discount_amount != null
                              ? `₹${Number(application.discount_amount).toLocaleString('en-IN')}`
                              : '-'}
                          </dd>
                        </div>
                        {application.total_fees != null && (
                          <div className="col-span-2 pt-2 border-t">
                            <dt className="text-sm text-muted-foreground">Balance Due</dt>
                            <dd className="text-lg font-bold">
                              ₹{(
                                Number(application.total_fees || 0) -
                                Number(application.paid_amount || 0) -
                                Number(application.discount_amount || 0)
                              ).toLocaleString('en-IN')}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Quick Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Application Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Application Number</p>
                      <p className="text-sm font-medium">{application.application_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Program</p>
                      <p className="text-sm font-medium">{programName || '-'}</p>
                    </div>
                  </div>
                  {application.lead_id && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Source Lead</p>
                        <Link
                          href={`/admission/leads/${application.lead_id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {leadName || application.lead_id.slice(0, 8)}
                        </Link>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-sm font-medium">
                        {application.created_at
                          ? new Date(application.created_at).toLocaleDateString()
                          : '-'}
                      </p>
                    </div>
                  </div>
                  {application.submitted_at && (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Submitted</p>
                        <p className="text-sm font-medium">
                          {new Date(application.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                  {application.reviewed_at && (
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Reviewed</p>
                        <p className="text-sm font-medium">
                          {new Date(application.reviewed_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Last Updated</p>
                      <p className="text-sm font-medium">
                        {application.updated_at
                          ? new Date(application.updated_at).toLocaleDateString()
                          : '-'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {application.notes ? (
                    <p className="text-sm whitespace-pre-wrap">{application.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No notes added</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Edit Application Dialog */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Application</DialogTitle>
                <DialogDescription>Update application details for {application.application_number}</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Personal Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Personal Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-full_name">Full Name</Label>
                      <Input
                        id="edit-full_name"
                        value={editForm.full_name}
                        onChange={(e) => handleEditChange('full_name', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => handleEditChange('email', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-phone">Phone</Label>
                      <Input
                        id="edit-phone"
                        value={editForm.phone}
                        onChange={(e) => handleEditChange('phone', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-dob">Date of Birth</Label>
                      <Input
                        id="edit-dob"
                        type="date"
                        value={editForm.date_of_birth}
                        onChange={(e) => handleEditChange('date_of_birth', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-gender">Gender</Label>
                      <Select value={editForm.gender} onValueChange={(v) => handleEditChange('gender', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Address</h4>
                  <div>
                    <Label htmlFor="edit-address">Address</Label>
                    <Input
                      id="edit-address"
                      value={editForm.address}
                      onChange={(e) => handleEditChange('address', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="edit-city">City</Label>
                      <Input
                        id="edit-city"
                        value={editForm.city}
                        onChange={(e) => handleEditChange('city', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-state">State</Label>
                      <Input
                        id="edit-state"
                        value={editForm.state}
                        onChange={(e) => handleEditChange('state', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-pincode">Pincode</Label>
                      <Input
                        id="edit-pincode"
                        value={editForm.pincode}
                        onChange={(e) => handleEditChange('pincode', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Academic */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Academic Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-prev_qual">Previous Qualification</Label>
                      <Input
                        id="edit-prev_qual"
                        value={editForm.previous_qualification}
                        onChange={(e) => handleEditChange('previous_qualification', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-board">Board</Label>
                      <Input
                        id="edit-board"
                        value={editForm.board}
                        onChange={(e) => handleEditChange('board', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-percentage">Percentage</Label>
                      <Input
                        id="edit-percentage"
                        type="number"
                        step="0.01"
                        value={editForm.percentage}
                        onChange={(e) => handleEditChange('percentage', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-passing_year">Passing Year</Label>
                      <Input
                        id="edit-passing_year"
                        type="number"
                        value={editForm.passing_year}
                        onChange={(e) => handleEditChange('passing_year', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Parent / Guardian */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Parent / Guardian</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-father_name">Father&apos;s Name</Label>
                      <Input
                        id="edit-father_name"
                        value={editForm.father_name}
                        onChange={(e) => handleEditChange('father_name', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-mother_name">Mother&apos;s Name</Label>
                      <Input
                        id="edit-mother_name"
                        value={editForm.mother_name}
                        onChange={(e) => handleEditChange('mother_name', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-guardian_phone">Guardian Phone</Label>
                      <Input
                        id="edit-guardian_phone"
                        value={editForm.guardian_phone}
                        onChange={(e) => handleEditChange('guardian_phone', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-guardian_email">Guardian Email</Label>
                      <Input
                        id="edit-guardian_email"
                        type="email"
                        value={editForm.guardian_email}
                        onChange={(e) => handleEditChange('guardian_email', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Notes</h4>
                  <Textarea
                    value={editForm.notes}
                    onChange={(e) => handleEditChange('notes', e.target.value)}
                    placeholder="Add any notes about this application..."
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                <Button onClick={handleEditSubmit} disabled={updateApplication.isPending}>
                  {updateApplication.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function ApplicationDetailPage() {
  return (
    <AdmissionErrorBoundary>
      <ApplicationDetailPageContent />
    </AdmissionErrorBoundary>
  );
}
