'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
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
import { Plus, Search, Building2, Mail, Phone, ArrowRight, AlertCircle, Download } from 'lucide-react';
import { useClients, type PartnerStatus, type SourceType } from '@/hooks/solutions/use-clients';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { apiClient } from '@/lib/api/client';
import { downloadCsv, formatDateForCsv, formatArrayForCsv, type CsvColumn } from '@/lib/utils/csv-export';

const partnerConfig: Record<PartnerStatus, { label: string; color: string }> = {
  standard: { label: 'Standard', color: 'bg-gray-100 text-gray-800' },
  yi: { label: 'YI Member', color: 'bg-blue-100 text-blue-800' },
  alumni: { label: 'Alumni', color: 'bg-green-100 text-green-800' },
  mou: { label: 'MoU Partner', color: 'bg-purple-100 text-purple-800' },
  referral: { label: 'Referral', color: 'bg-orange-100 text-orange-800' },
};

const sourceConfig: Record<SourceType, string> = {
  direct: 'Direct',
  referral: 'Referral',
  alumni: 'Alumni Network',
  placement: 'Placement',
  clinical: 'Clinical',
  yi: 'Young Indians',
  intent: 'Intent Platform',
};

export default function ClientsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<'all' | 'pipeline' | 'direct'>('all');
  const debouncedSearch = useDebounceValue(searchQuery, 300);

  const { data: clientsData, isLoading, error } = useClients({
    search: debouncedSearch || undefined,
    limit: 50,
  });

  const clients = clientsData?.data || [];

  // Fetch which client IDs were converted from prospects (pipeline clients)
  const { data: pipelineClientIds } = useQuery({
    queryKey: ['pipeline-client-ids'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('sh_prospects')
        .select('converted_client_id')
        .not('converted_client_id', 'is', null);
      return new Set((data || []).map((r: any) => r.converted_client_id));
    },
  });

  // Apply origin filter client-side
  const filteredClients = clients.filter((c) => {
    if (originFilter === 'pipeline') return pipelineClientIds?.has(c.id);
    if (originFilter === 'direct') return !pipelineClientIds?.has(c.id);
    return true;
  });

  const csvColumns: CsvColumn<(typeof clients)[number]>[] = [
    { header: 'Name', accessor: (r) => r.name },
    { header: 'Contact Person', accessor: (r) => r.contact_person },
    { header: 'Contact Email', accessor: (r) => r.contact_email },
    { header: 'Contact Phone', accessor: (r) => r.contact_phone },
    { header: 'Industry Sector', accessor: (r) => r.industry_sector },
    { header: 'City', accessor: (r) => r.city },
    { header: 'State', accessor: (r) => r.state },
    { header: 'Partner Status', accessor: (r) => r.partner_status },
    { header: 'Source Type', accessor: (r) => r.source_type },
    { header: 'Referral Count', accessor: (r) => r.referral_count },
    { header: 'Active', accessor: (r) => (r.is_active ? 'Yes' : 'No') },
    { header: 'Tags', accessor: (r) => formatArrayForCsv(r.tags) },
    { header: 'Created At', accessor: (r) => formatDateForCsv(r.created_at) },
  ];

  const handleExport = () => {
    downloadCsv(filteredClients, csvColumns, 'clients');
  };

  return (
    <ContentLayout title="Clients">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Clients' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Clients</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {originFilter !== 'all'
                ? `${filteredClients.length} of ${clients.length} clients`
                : `Manage clients and their solutions`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button asChild>
              <Link href="/solutions/clients/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Client
              </Link>
            </Button>
          </div>
        </div>

        {/* Search & Filter */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients by name, email, or phone..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as 'all' | 'pipeline' | 'direct')}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Origin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="pipeline">From Pipeline</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <div>
                  <h3 className="font-semibold">Failed to load clients</h3>
                  <p className="text-sm text-muted-foreground">
                    {error instanceof Error ? error.message : 'An error occurred'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Partner Status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-10 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-10 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        {!isLoading && !error && (
          <Card>
            <CardContent className="p-0">
              {filteredClients.length === 0 ? (
                <div className="py-10 text-center">
                  <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h3 className="mt-4 font-semibold">No clients found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchQuery || originFilter !== 'all'
                      ? 'Try a different search term or filter'
                      : 'Get started by adding your first client'}
                  </p>
                  {!searchQuery && originFilter === 'all' && (
                    <Button asChild className="mt-4">
                      <Link href="/solutions/clients/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Client
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Partner Status</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => {
                      const partner = partnerConfig[client.partner_status as PartnerStatus] || partnerConfig.standard;
                      const source = sourceConfig[client.source_type as SourceType] || client.source_type;
                      return (
                        <TableRow key={client.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-muted">
                                <Building2 className="h-4 w-4" />
                              </div>
                              <div>
                                <Link
                                  href={`/solutions/clients/${client.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {client.name}
                                </Link>
                                {client.industry_sector && (
                                  <p className="text-xs text-muted-foreground">{client.industry_sector}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {client.contact_person && (
                                <p className="font-medium">{client.contact_person}</p>
                              )}
                              {client.contact_email && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  {client.contact_email}
                                </div>
                              )}
                              {client.contact_phone && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  {client.contact_phone}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{source}</TableCell>
                          <TableCell>
                            <Badge className={partner.color}>{partner.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={client.is_active ? 'default' : 'secondary'}>
                              {client.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/solutions/clients/${client.id}`}>
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
