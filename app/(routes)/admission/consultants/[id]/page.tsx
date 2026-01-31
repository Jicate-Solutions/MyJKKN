'use client';

import { useParams, useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  Handshake,
  Edit,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Building,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  FileText,
  CreditCard,
  Globe,
  Award,
  Star
} from 'lucide-react';
import Link from 'next/link';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { useQuery } from '@tanstack/react-query';
import type { EducationConsultant, ConsultantLeadAttribution, ConsultantCommissionTransaction } from '@/types/education-consultants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    pending_verification: 'bg-yellow-100 text-yellow-800',
    suspended: 'bg-red-100 text-red-800',
    contract_expired: 'bg-orange-100 text-orange-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    external: 'bg-blue-100 text-blue-800',
    internal: 'bg-purple-100 text-purple-800',
    institutional: 'bg-indigo-100 text-indigo-800',
    alumni: 'bg-emerald-100 text-emerald-800',
    student: 'bg-cyan-100 text-cyan-800'
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}

function getTierColor(tier: string): string {
  const colors: Record<string, string> = {
    diamond: 'bg-violet-100 text-violet-800',
    platinum: 'bg-slate-200 text-slate-800',
    gold: 'bg-yellow-100 text-yellow-800',
    silver: 'bg-gray-200 text-gray-700',
    bronze: 'bg-orange-100 text-orange-800'
  };
  return colors[tier] || 'bg-gray-100 text-gray-800';
}

function getReferralStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    verified: 'bg-blue-100 text-blue-800',
    enrolled: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    dropped: 'bg-gray-100 text-gray-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

function getCommissionStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    on_hold: 'bg-orange-100 text-orange-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

function ConsultantDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

function ConsultantDetailContent() {
  const params = useParams();
  const router = useRouter();
  const consultantId = params.id as string;
  const { profile } = useAuth();

  // Fetch consultant details
  const { data: consultant, isLoading, error } = useQuery({
    queryKey: ['consultant', consultantId],
    queryFn: () => ConsultantService.getConsultantById(consultantId),
    enabled: !!consultantId
  });

  // Fetch consultant portal dashboard (includes stats)
  const { data: stats } = useQuery({
    queryKey: ['consultant-stats', consultantId],
    queryFn: () => ConsultantService.getConsultantPortalDashboard(consultantId),
    enabled: !!consultantId
  });

  // Fetch recent referrals (lead attributions)
  const { data: referralsData } = useQuery({
    queryKey: ['consultant-referrals', consultantId],
    queryFn: () => ConsultantService.getLeadAttributions({
      consultant_id: consultantId,
      limit: 5
    }),
    enabled: !!consultantId
  });

  // Fetch recent commissions
  const { data: commissionsData } = useQuery({
    queryKey: ['consultant-commissions', consultantId],
    queryFn: () => ConsultantService.getCommissionTransactions({
      consultant_id: consultantId,
      limit: 5
    }),
    enabled: !!consultantId
  });

  if (isLoading) {
    return <ConsultantDetailSkeleton />;
  }

  if (error || !consultant) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
        <h3 className="text-lg font-medium mb-2">Consultant Not Found</h3>
        <p className="text-muted-foreground mb-4">
          The consultant you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link href="/admission/consultants">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Consultants
          </Button>
        </Link>
      </div>
    );
  }

  const referrals = referralsData?.data || [];
  const commissions = commissionsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-6">
          <Avatar className="h-24 w-24">
            <AvatarFallback className="text-2xl">
              {consultant.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'EC'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{consultant.name}</h1>
            {consultant.contact_person && (
              <p className="text-muted-foreground flex items-center gap-1 mt-1">
                <Users className="h-4 w-4" />
                Contact: {consultant.contact_person}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge className={getTypeColor(consultant.consultant_type)}>
                {consultant.consultant_type.replace('_', ' ')}
              </Badge>
              <Badge className={getStatusColor(consultant.status)}>
                {consultant.status.replace('_', ' ')}
              </Badge>
              <Badge className={getTierColor(consultant.tier)}>
                <Star className="h-3 w-3 mr-1" />
                {consultant.tier}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              {consultant.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {consultant.email}
                </span>
              )}
              {consultant.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {consultant.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admission/consultants/${consultant.id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/admission/consultants/referrals?consultant=${consultant.id}`)}>
                <Users className="h-4 w-4 mr-2" />
                View All Referrals
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/admission/consultants/commissions?consultant=${consultant.id}`)}>
                <DollarSign className="h-4 w-4 mr-2" />
                View Commissions
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/admission/consultants/payouts?consultant=${consultant.id}`)}>
                <CreditCard className="h-4 w-4 mr-2" />
                View Payouts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.stats?.total_leads || consultant.total_leads_referred || 0}</div>
            <p className="text-xs text-muted-foreground">
              {consultant.total_conversions || 0} enrolled
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {consultant.conversion_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Referral to enrollment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
              }).format(stats?.stats?.total_earnings || consultant.total_commission_earned || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Lifetime commissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
              }).format(stats?.stats?.pending_earnings || consultant.pending_commission || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting payment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Details Tabs */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="referrals">Recent Referrals</TabsTrigger>
          <TabsTrigger value="commissions">Recent Commissions</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {consultant.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{consultant.email}</span>
                  </div>
                )}
                {consultant.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{consultant.phone}</span>
                  </div>
                )}
                {consultant.alternate_phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{consultant.alternate_phone} (Alt)</span>
                  </div>
                )}
                {consultant.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={consultant.website} target="_blank" rel="noopener noreferrer"
                       className="text-blue-600 hover:underline">
                      {consultant.website}
                    </a>
                  </div>
                )}
                {(consultant.address || consultant.city) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                    <span>
                      {[consultant.address, consultant.city, consultant.state, consultant.country, consultant.pincode]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance & Coverage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance & Coverage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Relationship Score</span>
                  <span className="font-medium">{consultant.relationship_score}/100</span>
                </div>
                {consultant.performance_rating && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Performance Rating</span>
                    <span className="font-medium flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500" />
                      {consultant.performance_rating.toFixed(1)}/5
                    </span>
                  </div>
                )}
                {consultant.geographic_coverage && consultant.geographic_coverage.length > 0 && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Geographic Coverage</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {consultant.geographic_coverage.join(', ')}
                    </span>
                  </div>
                )}
                {consultant.specializations && consultant.specializations.length > 0 && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Specializations</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {consultant.specializations.join(', ')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Business Information */}
            {(consultant.contact_person || consultant.gst_number || consultant.pan_number) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Business Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {consultant.contact_person && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contact Person</span>
                      <span className="font-medium">{consultant.contact_person}</span>
                    </div>
                  )}
                  {consultant.gst_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST Number</span>
                      <span className="font-medium">{consultant.gst_number}</span>
                    </div>
                  )}
                  {consultant.pan_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PAN Number</span>
                      <span className="font-medium">{consultant.pan_number}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Bank Details */}
            {consultant.bank_name && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bank Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank Name</span>
                    <span className="font-medium">{consultant.bank_name}</span>
                  </div>
                  {consultant.bank_account_holder && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account Holder</span>
                      <span className="font-medium">{consultant.bank_account_holder}</span>
                    </div>
                  )}
                  {consultant.bank_account_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account Number</span>
                      <span className="font-medium">
                        ****{consultant.bank_account_number.slice(-4)}
                      </span>
                    </div>
                  )}
                  {consultant.bank_ifsc && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IFSC Code</span>
                      <span className="font-medium">{consultant.bank_ifsc}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Contract Information */}
            {(consultant.contract_start_date || consultant.contract_end_date) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contract Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {consultant.contract_start_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Start Date</span>
                      <span className="font-medium">
                        {format(new Date(consultant.contract_start_date), 'PPP')}
                      </span>
                    </div>
                  )}
                  {consultant.contract_end_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">End Date</span>
                      <span className="font-medium">
                        {format(new Date(consultant.contract_end_date), 'PPP')}
                      </span>
                    </div>
                  )}
                  {consultant.contract_document_url && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Contract Document</span>
                      <a href={consultant.contract_document_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Notes */}
          {consultant.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Internal Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {consultant.notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {consultant.tags && consultant.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {consultant.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Record Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {format(new Date(consultant.created_at), 'PPP')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">
                    {format(new Date(consultant.updated_at), 'PPP')}
                  </p>
                </div>
              </div>
              {consultant.verified_at && (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Verified</p>
                    <p className="font-medium">
                      {format(new Date(consultant.verified_at), 'PPP')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Referrals</CardTitle>
                <CardDescription>Students referred by this consultant</CardDescription>
              </div>
              <Link href={`/admission/consultants/referrals?consultant=${consultant.id}`}>
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No referrals yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Referred On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referrals.map((referral) => (
                      <TableRow key={referral.id}>
                        <TableCell className="font-medium">
                          {(referral as any).lead?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell>{(referral as any).lead?.program_name || '-'}</TableCell>
                        <TableCell>
                          <Badge className={getReferralStatusColor(referral.is_verified ? 'verified' : 'pending')}>
                            {referral.is_verified ? 'Verified' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(referral.created_at), 'PP')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Commissions</CardTitle>
                <CardDescription>Commission earnings from referrals</CardDescription>
              </div>
              <Link href={`/admission/consultants/commissions?consultant=${consultant.id}`}>
                <Button variant="outline" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {commissions.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No commissions yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((commission: ConsultantCommissionTransaction) => (
                      <TableRow key={commission.id}>
                        <TableCell className="font-medium">
                          {commission.lead?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                            maximumFractionDigits: 0
                          }).format(commission.final_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge className={getCommissionStatusColor(commission.status)}>
                            {commission.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(commission.created_at), 'PP')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ConsultantDetailPage() {
  return (
    <PermissionGuard module="consultants" action="view">
      <ContentLayout title="Consultant Details">
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
              <BreadcrumbLink href="/admission/consultants">Consultants</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <ConsultantDetailContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
