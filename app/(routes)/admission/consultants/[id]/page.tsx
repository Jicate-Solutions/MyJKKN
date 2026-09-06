'use client';


import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTabParam } from '@/hooks/use-tab-param';
import { LifecycleStatusBadge, getStatusLabel } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
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
import {
  Handshake,
  Edit,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  CreditCard,
  Star,
  Globe,
  User,
  ClipboardList
} from 'lucide-react';
import Link from 'next/link';
import {
  ConsultantService,
  resolveReferralLearner
} from '@/lib/services/admission/consultant-service';
import { useQuery } from '@tanstack/react-query';
import type { EducationConsultant, ConsultantLeadAttribution, ConsultantCommissionTransaction } from '@/types/education-consultants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CommissionStructureTab } from './_components/commission-structure-tab';
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

// Pseudo-status for a referral that reaches no learners_profiles row on
// EITHER attribution path — the only case that is genuinely "not enquired".
const NOT_ENQUIRED = 'not_enquired';

// The effective status of a referral row, used identically by the columns, the
// filters and the stat cards so the three can never disagree.
function referralStatusOf(row: any): string {
  return resolveReferralLearner(row).lifecycle_status ?? NOT_ENQUIRED;
}

// Bucket for referrals whose learner has no admission year set.
const UNKNOWN_YEAR = 'Unknown';

// The year a referral belongs to = the LEARNER'S ADMISSION YEAR, deliberately
// not the attribution's created_at. The referral sync bulk-created every
// existing attribution row, so created_at puts all 745 of a consultant's
// referrals in a single year and answers nothing. admission_year spreads them
// properly (2022-2023 … 2026-2027).
function referralYearOf(row: any): string {
  return resolveReferralLearner(row).admission_year_name ?? UNKNOWN_YEAR;
}

// Advanced data-table columns for the Recent Referrals tab.
// Plain string headers are auto-wrapped by DataTable into sortable headers;
// accessorFn feeds sorting/search with the resolved nested values.
//
// Every learner-derived cell goes through resolveReferralLearner(): about half
// of all attributions are written with admission_id NULL and the learner hanging
// off the attribution's own learner_profile_id, so reading `lead` alone left
// those rows blank and mislabelled them "Not Enquired".
const referralColumns: ColumnDef<any>[] = [
  {
    id: 'student_name',
    accessorFn: (row) => resolveReferralLearner(row).name ?? '',
    header: 'Student Name',
    cell: ({ row }) => (
      <span className="font-medium">
        {resolveReferralLearner(row.original).name || 'N/A'}
      </span>
    )
  },
  {
    id: 'program',
    accessorFn: (row) => resolveReferralLearner(row).program_name ?? '',
    header: 'Program',
    cell: ({ row }) => resolveReferralLearner(row.original).program_name || '-'
  },
  {
    id: 'institution',
    accessorFn: (row) => row.institution?.name ?? '',
    header: 'Institution',
    cell: ({ row }) => row.original.institution?.name || '-'
  },
  {
    id: 'admission_year',
    accessorFn: (row) => resolveReferralLearner(row).admission_year_name ?? '',
    header: 'Year',
    cell: ({ row }) => {
      const year = resolveReferralLearner(row.original).admission_year_name;
      return year ? (
        <span className="whitespace-nowrap">{year}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    }
  },
  {
    id: 'status',
    accessorFn: (row) => resolveReferralLearner(row).lifecycle_status ?? '',
    header: 'Status',
    cell: ({ row }) => {
      const status = resolveReferralLearner(row.original).lifecycle_status;
      return status ? (
        // lifecycle_status is a free-form column, so it is typed as string here;
        // the badge already warns and falls back on an unrecognised value.
        <LifecycleStatusBadge status={status as LifecycleStatus} />
      ) : (
        // Referred learner that hasn't entered the admission workflow yet
        // (no learners_profiles row on either attribution path)
        <Badge
          variant="outline"
          className="bg-gray-100 text-gray-600 border-gray-300"
        >
          Not Enquired
        </Badge>
      );
    }
  },
  {
    accessorKey: 'created_at',
    header: 'Referred On',
    cell: ({ row }) => format(new Date(row.original.created_at), 'PP')
  }
];

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

const CONSULTANT_DETAIL_TABS = [
  'details',
  'commission-structure',
  'referrals',
  'commissions'
] as const;

function ConsultantDetailContent() {
  const params = useParams();
  const router = useRouter();
  const consultantId = params.id as string;
  const [activeTab, setActiveTab] = useTabParam('details', CONSULTANT_DETAIL_TABS);

  // UUID validation for Next.js PPR compatibility
  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(consultantId);

  // Fetch consultant details
  const { data: consultant, isLoading, error } = useQuery({
    queryKey: ['consultant', consultantId],
    queryFn: () => ConsultantService.getConsultantById(consultantId),
    enabled: !!consultantId && isValidId
  });

  // Fetch consultant portal dashboard (includes stats)
  const { data: stats } = useQuery({
    queryKey: ['consultant-stats', consultantId],
    queryFn: () => ConsultantService.getConsultantPortalDashboard(consultantId),
    enabled: !!consultantId && isValidId
  });

  // Fetch this consultant's referrals (lead attributions).
  //
  // The whole set, not a page of it. The tab's search, Status/Institution
  // filters and stat cards all key off the learner's lifecycle_status, which is
  // a COALESCE across two embed paths and so cannot be pushed into PostgREST as
  // a filter — the complete set has to be in hand to bucket it. This previously
  // asked for `limit: 20`, which made a 745-referral consultant show "17 of 20"
  // in the stat cards and offer filter options drawn from only the newest 20
  // rows. getLeadAttributions pages internally in 1000-row windows.
  const { data: referralsData, isLoading: referralsLoading } = useQuery({
    queryKey: ['consultant-referrals', consultantId],
    queryFn: () => ConsultantService.getLeadAttributions({
      consultant_id: consultantId,
      fetch_all: true
    }),
    enabled: !!consultantId && isValidId
  });

  // Fetch recent commissions
  const { data: commissionsData } = useQuery({
    queryKey: ['consultant-commissions', consultantId],
    queryFn: () => ConsultantService.getCommissionTransactions({
      consultant_id: consultantId,
      limit: 5
    }),
    enabled: !!consultantId && isValidId
  });

  // ── Referrals table: client-side Status / Institution filters ─────────────
  // 'not_enquired' is a pseudo-status for referred leads with no learner
  // profile yet (matches the "Not Enquired" badge in the Status column).
  const [referralStatusFilter, setReferralStatusFilter] = useState('all');
  const [referralInstitutionFilter, setReferralInstitutionFilter] = useState('all');
  const [referralYearFilter, setReferralYearFilter] = useState('all');

  const referrals = useMemo(
    () => (referralsData?.data || []) as any[],
    [referralsData]
  );

  const referralStatusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of referrals) {
      set.add(referralStatusOf(r));
    }
    return Array.from(set).sort();
  }, [referrals]);

  const referralInstitutionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of referrals) {
      if (r.institution?.name) set.add(r.institution.name);
    }
    return Array.from(set).sort();
  }, [referrals]);

  // Year options carry their own counts, so "which year, how many referrals"
  // is answerable straight from the open dropdown without applying anything.
  // Newest year first; the "no admission year" bucket always sorts last.
  const referralYearOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of referrals) {
      const y = referralYearOf(r);
      map.set(y, (map.get(y) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNKNOWN_YEAR) return 1;
      if (b[0] === UNKNOWN_YEAR) return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [referrals]);

  const filteredReferrals = useMemo(() => {
    return referrals.filter((r) => {
      const status = referralStatusOf(r);
      if (referralStatusFilter !== 'all' && status !== referralStatusFilter) {
        return false;
      }
      if (
        referralInstitutionFilter !== 'all' &&
        r.institution?.name !== referralInstitutionFilter
      ) {
        return false;
      }
      if (
        referralYearFilter !== 'all' &&
        referralYearOf(r) !== referralYearFilter
      ) {
        return false;
      }
      return true;
    });
  }, [
    referrals,
    referralStatusFilter,
    referralInstitutionFilter,
    referralYearFilter
  ]);

  // Stat-card breakdowns. Counts respect the Institution and Year filters (the
  // cards show the status distribution within that slice) but NOT the status
  // filter itself — otherwise clicking a card would zero out the rest.
  const statCardBase = useMemo(() => {
    return referrals.filter((r) => {
      if (
        referralInstitutionFilter !== 'all' &&
        r.institution?.name !== referralInstitutionFilter
      ) {
        return false;
      }
      if (
        referralYearFilter !== 'all' &&
        referralYearOf(r) !== referralYearFilter
      ) {
        return false;
      }
      return true;
    });
  }, [referrals, referralInstitutionFilter, referralYearFilter]);

  const referralStatusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of statCardBase) {
      const s = referralStatusOf(r);
      map.set(s, (map.get(s) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [statCardBase]);

  // If the selected status doesn't exist within the newly selected
  // institution, clear it — otherwise the table filters on an invisible value
  useEffect(() => {
    if (
      referralStatusFilter !== 'all' &&
      referralStatusCounts.length > 0 &&
      !referralStatusCounts.some(([s]) => s === referralStatusFilter)
    ) {
      setReferralStatusFilter('all');
    }
  }, [referralStatusCounts, referralStatusFilter]);

  if (isLoading) {
    return <ConsultantDetailSkeleton />;
  }

  if (!isValidId || error || !consultant) {
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

  const commissions = commissionsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-6">
          <Avatar className="h-24 w-24">
            <AvatarImage src={consultant.profile_photo_url || ''} alt={consultant.name} />
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
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge className={getTypeColor(consultant.consultant_type)}>
                {consultant.consultant_type.replace('_', ' ')}
              </Badge>
              {consultant.status && (
                <Badge className={getStatusColor(consultant.status)}>
                  {consultant.status.replace(/_/g, ' ')}
                </Badge>
              )}
              {consultant.tier && (
                <Badge className={getTierColor(consultant.tier)}>
                  <Star className="h-3 w-3 mr-1" />
                  {consultant.tier}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
              {consultant.email && (
                <span className="flex items-center gap-1 min-w-0 break-all">
                  <Mail className="h-4 w-4 shrink-0" />
                  {consultant.email}
                </span>
              )}
              {consultant.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4 shrink-0" />
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
            <div className="text-2xl font-bold">
              {/* BUG-003877: prefer live attribution count from stats over the
                  cached counter (stats.total_leads is now the authoritative
                  source of truth — see ConsultantService.getConsultantPortalDashboard).
                  Use ?? not || so a legitimate 0 is preserved instead of falling
                  back to a possibly-stale cached counter. */}
              {stats?.stats?.total_leads ?? consultant.total_leads_referred ?? 0}
            </div>
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="commission-structure">Commission Structure</TabsTrigger>
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
                {(consultant.address_line1 || consultant.city) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                    <span>
                      {[consultant.address_line1, consultant.city, consultant.state, consultant.country, consultant.pincode]
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
                      {(consultant.performance_rating ?? 0).toFixed(1)}/5
                    </span>
                  </div>
                )}
                {consultant.covered_states && (Array.isArray(consultant.covered_states) ? consultant.covered_states : []).length > 0 && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Geographic Coverage</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {(Array.isArray(consultant.covered_states) ? consultant.covered_states : []).join(', ')}
                    </span>
                  </div>
                )}
                {consultant.specialized_degrees && consultant.specialized_degrees.length > 0 && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Specializations</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {consultant.specialized_degrees.join(', ')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Business Information */}
            {(consultant.contact_person || consultant.gst_number || consultant.pan_number || consultant.website) && (
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
                  {consultant.website && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Website</span>
                      <a
                        href={consultant.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium flex items-center gap-1 text-primary hover:underline"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        {consultant.website.replace(/^https?:\/\//, '')}
                      </a>
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
            {(consultant.bank_name || consultant.bank_account_holder) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bank Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {consultant.bank_account_holder && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Account Holder</span>
                      <span className="font-medium flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {consultant.bank_account_holder}
                      </span>
                    </div>
                  )}
                  {consultant.bank_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank Name</span>
                    <span className="font-medium">{consultant.bank_name}</span>
                  </div>
                  )}
                  {consultant.bank_branch && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank Branch</span>
                      <span className="font-medium">{consultant.bank_branch}</span>
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

          </div>

          {/* Notes */}
          {consultant.internal_notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Internal Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {consultant.internal_notes}
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
              {consultant.onboarded_at && (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Onboarded</p>
                    <p className="font-medium">
                      {format(new Date(consultant.onboarded_at), 'PPP')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commission-structure" className="mt-4 space-y-4">
          <CommissionStructureTab
            consultantId={consultantId}
            institutionId={consultant.institution_id ?? ''}
          />
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          {/* Status stat cards — same idiom as the page summary cards above;
              clicking a card applies it as a table filter */}
          {referrals.length > 0 && (
            <div className="mb-4">
              <div className="grid gap-4 md:grid-cols-4">
                {referralStatusCounts.map(([status, count]) => (
                  <Card
                    key={status}
                    onClick={() =>
                      setReferralStatusFilter(
                        referralStatusFilter === status ? 'all' : status
                      )
                    }
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      referralStatusFilter === status
                        ? 'ring-1 ring-primary/50 bg-muted/50'
                        : ''
                    }`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {status === 'not_enquired'
                          ? 'Not Enquired'
                          : getStatusLabel(status as any)}
                      </CardTitle>
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{count}</div>
                      <p className="text-xs text-muted-foreground">
                        of {statCardBase.length} referrals
                        {referralYearFilter !== 'all' && ` in ${referralYearFilter}`}
                        {referralInstitutionFilter !== 'all' &&
                          ` at ${referralInstitutionFilter}`}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
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
              {referralsLoading ? (
                // Fetching the full set takes a beat on a large consultant;
                // without this the tab would flash "No referrals yet" first.
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : referrals.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No referrals yet</p>
                </div>
              ) : (
                <DataTable
                  columns={referralColumns}
                  data={filteredReferrals}
                  searchPlaceholder="Search by learner, program, institution..."
                  getRowId={(row: any) => row.id}
                  showRefresh={false}
                  tableTools={
                    <>
                      {/* Admission year, with the per-year count on the option
                          itself — opening the dropdown answers "which year, how
                          many" without needing to select anything. */}
                      <Select
                        value={referralYearFilter}
                        onValueChange={setReferralYearFilter}
                      >
                        <SelectTrigger className="w-[190px]">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            All Years ({referrals.length})
                          </SelectItem>
                          {referralYearOptions.map(([year, count]) => (
                            <SelectItem key={year} value={year}>
                              {year} ({count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={referralStatusFilter}
                        onValueChange={setReferralStatusFilter}
                      >
                        <SelectTrigger className="w-[170px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          {referralStatusOptions.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s === 'not_enquired'
                                ? 'Not Enquired'
                                : getStatusLabel(s as any)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={referralInstitutionFilter}
                        onValueChange={setReferralInstitutionFilter}
                      >
                        <SelectTrigger className="w-[210px]">
                          <SelectValue placeholder="Institution" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Institutions</SelectItem>
                          {referralInstitutionOptions.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  }
                  globalFilterFn={(row, _columnId, filterValue) => {
                    const q = String(filterValue).toLowerCase();
                    const r = row.original as any;
                    const learner = resolveReferralLearner(r);
                    return [
                      learner.name,
                      learner.program_name,
                      learner.lifecycle_status,
                      learner.admission_year_name,
                      r.institution?.name
                    ].some((v) => v?.toLowerCase().includes(q));
                  }}
                />
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
                          }).format(commission.net_amount)}
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
    <PermissionGuard module="admission.consultants" action="view">
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
          <Suspense fallback={null}>
            <ConsultantDetailContent />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
