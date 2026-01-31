// app/(routes)/consultant-portal/leads/page.tsx
// View all leads submitted by the consultant

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useLeadAttributions } from '@/hooks/admission/use-consultants';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { EducationConsultant, ConsultantLeadAttribution } from '@/types/education-consultants';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

const stageColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-indigo-100 text-indigo-800',
  interested: 'bg-purple-100 text-purple-800',
  applied: 'bg-cyan-100 text-cyan-800',
  admitted: 'bg-green-100 text-green-800',
  enrolled: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-red-100 text-red-800',
  disqualified: 'bg-gray-100 text-gray-800',
};

export default function MyLeadsPage() {
  const { profile } = useAuth();
  const [consultant, setConsultant] = useState<EducationConsultant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Load consultant data
  useEffect(() => {
    async function loadConsultant() {
      if (!profile?.id || !profile?.institution_id) {
        setIsLoading(false);
        return;
      }

      try {
        const consultants = await ConsultantService.getConsultants({
          institution_id: profile.institution_id,
          limit: 100,
        });

        const myConsultant = consultants.data.find(
          (c) => c.referrer_user_id === profile.id
        );

        setConsultant(myConsultant || null);
      } catch (err) {
        console.error('Failed to load consultant:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadConsultant();
  }, [profile]);

  // Use the hook to fetch lead attributions
  const {
    data: attributionsData,
    isLoading: leadsLoading,
    isError,
    refetch,
  } = useLeadAttributions(
    consultant
      ? {
          institution_id: profile?.institution_id,
          consultant_id: consultant.id,
          page,
          limit,
        }
      : { institution_id: '', consultant_id: '' }
  );

  // Filter leads client-side for search and stage
  const attributionsList = attributionsData?.data || [];
  const filteredLeads = attributionsList.filter((attr: ConsultantLeadAttribution) => {
    const lead = attr.lead;
    if (!lead) return false;

    const matchesSearch =
      !searchTerm ||
      lead.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStage = stageFilter === 'all' || true; // Would need funnel_stage in the lead data

    return matchesSearch && matchesStage;
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <p className="text-muted-foreground">Unable to load consultant profile</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            My Leads
          </h1>
          <p className="text-muted-foreground">
            View and track all leads you&apos;ve submitted
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/consultant-portal/leads/submit">
              <UserPlus className="h-4 w-4 mr-2" />
              Submit New Lead
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{consultant.total_leads_referred || 0}</div>
            <p className="text-sm text-muted-foreground">Total Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{consultant.total_conversions || 0}</div>
            <p className="text-sm text-muted-foreground">Conversions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {((consultant.conversion_rate || 0) * 100).toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground">Conversion Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold capitalize">{consultant.tier}</div>
            <p className="text-sm text-muted-foreground">Current Tier</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="admitted">Admitted</SelectItem>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lead History</CardTitle>
          <CardDescription>
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leadsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Leads Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || stageFilter !== 'all'
                  ? 'No leads match your filter criteria'
                  : "You haven't submitted any leads yet"}
              </p>
              {!searchTerm && stageFilter === 'all' && (
                <Button asChild>
                  <Link href="/consultant-portal/leads/submit">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Submit Your First Lead
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Attribution</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((attribution: ConsultantLeadAttribution) => {
                      const lead = attribution.lead;
                      return (
                        <TableRow key={attribution.id}>
                          <TableCell>
                            <div className="font-medium">{lead?.full_name || 'Unknown'}</div>
                            {attribution.referral_code_used && (
                              <p className="text-xs text-muted-foreground">
                                Code: {attribution.referral_code_used}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {lead?.phone && (
                                <div className="flex items-center gap-1 text-sm">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  {lead.phone}
                                </div>
                              )}
                              {lead?.email && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  {lead.email}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {attribution.attribution_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-2">
                              {attribution.attribution_percentage}%
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(attribution.created_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                attribution.is_verified
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }
                            >
                              {attribution.is_verified ? 'Verified' : 'Pending'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={filteredLeads.length < limit}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
