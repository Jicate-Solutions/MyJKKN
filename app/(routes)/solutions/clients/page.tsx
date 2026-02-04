'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Search, Building2, Mail, Phone, ArrowRight, AlertCircle } from 'lucide-react';
import { useClients, type PartnerStatus, type SourceType } from '@/hooks/solutions/use-clients';
import { useDebounceValue } from '@/hooks/use-debounce-value';

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
  const debouncedSearch = useDebounceValue(searchQuery, 300);

  const { data: clientsData, isLoading, error } = useClients({
    search: debouncedSearch || undefined,
    limit: 50,
  });

  const clients = clientsData?.data || [];

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
              Manage clients and their solutions
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/clients/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Link>
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients by name, email, or phone..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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
              {clients.length === 0 ? (
                <div className="py-10 text-center">
                  <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h3 className="mt-4 font-semibold">No clients found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'Get started by adding your first client'}
                  </p>
                  {!searchQuery && (
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
                    {clients.map((client) => {
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
                                {client.industry && (
                                  <p className="text-xs text-muted-foreground">{client.industry}</p>
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
