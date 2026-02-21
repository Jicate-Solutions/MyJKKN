'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  PenSquare,
  FileText,
  Plus,
  AlertCircle,
  GitBranch,
} from 'lucide-react';
import { toast } from 'sonner';
import { useClient, useUpdateClient, type UpdateClientInput } from '@/hooks/solutions/use-clients';
import { useSolutions } from '@/hooks/solutions/use-solutions';
import { useProspectsByClientId } from '@/hooks/solutions/use-prospects';
import { ClientForm } from '@/components/solutions/clients/client-form';
import { ProspectOriginCard } from '@/components/solutions/clients/prospect-origin-card';
import type { PartnerStatus } from '@/hooks/solutions/use-clients';

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

const partnerConfig: Record<PartnerStatus, { label: string; color: string }> = {
  standard: { label: 'Standard', color: 'bg-gray-100 text-gray-800' },
  yi: { label: 'YI Member', color: 'bg-blue-100 text-blue-800' },
  alumni: { label: 'Alumni', color: 'bg-green-100 text-green-800' },
  mou: { label: 'MoU Partner', color: 'bg-purple-100 text-purple-800' },
  referral: { label: 'Referral', color: 'bg-orange-100 text-orange-800' },
};

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Fetch client data
  const { data: client, isLoading: clientLoading, error: clientError } = useClient(id);

  // Fetch solutions for this client
  const { data: solutionsData, isLoading: solutionsLoading } = useSolutions({
    client_id: id,
    limit: 20,
  });

  // Fetch all prospects linked to this client (converted + repeat business)
  const { data: relatedProspects, isLoading: prospectsLoading } = useProspectsByClientId(id);

  // Update client mutation
  const updateClient = useUpdateClient();

  const solutions = solutionsData?.data || [];

  const handleUpdateClient = async (data: UpdateClientInput) => {
    try {
      await updateClient.mutateAsync({ id, updates: data });
      toast.success('Client updated successfully');
      setIsEditOpen(false);
    } catch (error) {
      console.error('Failed to update client:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update client');
      throw error;
    }
  };

  // Loading state
  if (clientLoading) {
    return (
      <ContentLayout title="Client Details">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Solutions Hub', href: '/solutions' },
            { label: 'Clients', href: '/solutions/clients' },
            { label: 'Loading...' },
          ]}
        />
        <div className="space-y-6 mt-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10" />
              <div>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-8 w-48" />
              </div>
            </div>
            <Skeleton className="h-10 w-28" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Error state — distinguish between auth issues and actual missing data
  if (clientError || !client) {
    const errorMessage = clientError instanceof Error ? clientError.message : '';
    const isAuthIssue = errorMessage.includes('JWT') || errorMessage.includes('token') || errorMessage.includes('auth');
    return (
      <ContentLayout title="Client Not Found">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Solutions Hub', href: '/solutions' },
            { label: 'Clients', href: '/solutions/clients' },
            { label: 'Not Found' },
          ]}
        />
        <div className="mt-10">
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <div>
                  <h3 className="font-semibold">
                    {isAuthIssue ? 'Session expired' : 'Client not found'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isAuthIssue
                      ? 'Your session has expired. Please refresh the page or log in again.'
                      : 'The client you are looking for does not exist or you don\u0027t have permission to view it.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    Retry
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/solutions/clients')}>
                    Back to Clients
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const partner = partnerConfig[client.partner_status as PartnerStatus] || partnerConfig.standard;
  const address = [client.address, client.city].filter(Boolean).join(', ');

  return (
    <ContentLayout title="Client Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Clients', href: '/solutions/clients' },
          { label: client.name },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/solutions/clients">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <Badge className={partner.color}>{partner.label}</Badge>
                {!client.is_active && (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold">{client.name}</h1>
              {client.industry_sector && (
                <p className="text-sm text-muted-foreground">{client.industry_sector}</p>
              )}
            </div>
          </div>
          <Button onClick={() => setIsEditOpen(true)}>
            <PenSquare className="mr-2 h-4 w-4" />
            Edit Client
          </Button>
        </div>

        {/* Prospect Origin - shows if client was converted from pipeline */}
        <ProspectOriginCard clientId={id} />

        <div className="grid gap-4 md:grid-cols-2">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.contact_person && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Contact Person</p>
                  <p className="font-medium">{client.contact_person}</p>
                </div>
              )}
              {client.contact_email && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </p>
                  <a href={`mailto:${client.contact_email}`} className="text-primary hover:underline">
                    {client.contact_email}
                  </a>
                </div>
              )}
              {client.contact_phone && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </p>
                  <a href={`tel:${client.contact_phone}`} className="text-primary hover:underline">
                    {client.contact_phone}
                  </a>
                </div>
              )}
              {address && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Address
                  </p>
                  <p>{address}</p>
                </div>
              )}
              {!client.contact_person && !client.contact_email && !client.contact_phone && !address && (
                <p className="text-muted-foreground">No contact information available.</p>
              )}
            </CardContent>
          </Card>

          {/* Partnership Info */}
          <Card>
            <CardHeader>
              <CardTitle>Partnership Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Partner Status</p>
                <Badge className={partner.color}>{partner.label}</Badge>
                {client.partner_status !== 'standard' && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    (50% partner discount)
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Source</p>
                <p className="capitalize">{client.source_type?.replace('_', ' ') || 'Not specified'}</p>
              </div>
              {client.source_department_id && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Source Department</p>
                  <p className="text-sm font-mono">{client.source_department_id}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Referral Count</p>
                <p>{client.referral_count || 0} referrals</p>
              </div>
              {client.company_code && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Company Code</p>
                  <p className="font-mono">{client.company_code}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Solutions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Solutions
              </CardTitle>
              <CardDescription>
                {solutionsLoading
                  ? 'Loading solutions...'
                  : `${solutions.length} solution${solutions.length !== 1 ? 's' : ''} for this client`}
              </CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link href={`/solutions/new?client=${client.id}`}>
                <Plus className="mr-2 h-4 w-4" />
                New Solution
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {solutionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : solutions.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                <FileText className="mx-auto h-8 w-8 mb-2" />
                <p>No solutions yet</p>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link href={`/solutions/new?client=${client.id}`}>
                    Create First Solution
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {solutions.map((solution) => (
                  <div
                    key={solution.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div>
                      <Link
                        href={`/solutions/${solution.id}`}
                        className="font-medium hover:underline"
                      >
                        {solution.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">{solution.solution_code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {solution.solution_type}
                      </Badge>
                      <Badge variant={solution.status === 'active' ? 'default' : 'secondary'}>
                        {solution.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline History - shows all related prospects */}
        {(prospectsLoading || (relatedProspects && relatedProspects.length > 0)) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Pipeline History
                </CardTitle>
                <CardDescription>
                  {prospectsLoading
                    ? 'Loading prospects...'
                    : `${relatedProspects!.length} prospect${relatedProspects!.length !== 1 ? 's' : ''} linked to this client`}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {prospectsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {relatedProspects!.map((prospect) => {
                    const isOriginalConversion = prospect.converted_client_id === id;
                    const isRepeatBusiness = prospect.existing_client_id === id;
                    return (
                      <div
                        key={prospect.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/solutions/pipeline/${prospect.id}`}
                              className="font-medium hover:underline"
                            >
                              {prospect.company_name}
                            </Link>
                            {isOriginalConversion && (
                              <Badge className="bg-green-100 text-green-800 text-xs">Original Conversion</Badge>
                            )}
                            {isRepeatBusiness && (
                              <Badge className="bg-blue-100 text-blue-800 text-xs">Repeat Business</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {prospect.prospect_code} &middot; {new Date(prospect.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {prospect.expected_deal_size && ` · ₹${Number(prospect.expected_deal_size).toLocaleString('en-IN')}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {prospect.pipeline_stage}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>
              Update client information
            </DialogDescription>
          </DialogHeader>
          <ClientForm
            client={client}
            onSubmit={handleUpdateClient}
            isLoading={updateClient.isPending}
          />
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
