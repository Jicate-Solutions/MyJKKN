'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Edit,
  Plus,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  DollarSign,
  Award,
  Link2,
  AlertCircle,
} from 'lucide-react';
import { TRLBadge } from '../../_components/trl-badge';
import { TRLProgress } from '../../_components/trl-progress';
import { RDIFScorecard } from '../../_components/rdif-scorecard';
import { format } from 'date-fns';
import {
  useProduct,
  useRDIFPrerequisites,
  PRODUCT_STATUSES,
  DOMAIN_LABELS,
  PATENT_STATUS_LABELS,
  VALIDATION_TYPE_LABELS,
} from '@/hooks/solutions/use-products';

const RDIF_SECTOR_LABELS: Record<string, string> = {
  health_technologies: 'Health Technologies',
  digital_economy: 'Digital Economy',
  energy: 'Energy',
  agriculture: 'Agriculture',
  defence: 'Defence',
  space: 'Space',
  telecom: 'Telecom',
};

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = use(params);

  const { data: product, isLoading, error } = useProduct(id);
  const { data: rdifPrerequisites } = useRDIFPrerequisites();

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="Error">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg text-muted-foreground">
            {error instanceof Error ? error.message : 'Failed to load product'}
          </p>
          <Button asChild>
            <Link href="/solutions/products">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Products
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!product) {
    return (
      <ContentLayout title="Product Not Found">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <p className="text-lg text-muted-foreground">Product not found</p>
          <Button asChild>
            <Link href="/solutions/products">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Products
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const statusLabel = PRODUCT_STATUSES.find(s => s.value === product.status)?.label || product.status;
  const domainLabel = product.domain ? (DOMAIN_LABELS[product.domain] || product.domain) : 'N/A';
  const sectorLabel = product.sector ? (RDIF_SECTOR_LABELS[product.sector] || product.sector) : null;
  const patentStatusLabel = PATENT_STATUS_LABELS[product.patent_status] || product.patent_status;
  const validations = product.validations || [];

  // Map RDIF prerequisites to the shape RDIFScorecard expects
  const rdifForScorecard = (rdifPrerequisites || []).map(p => ({
    id: p.id,
    name: p.label,
    met: p.is_met,
    evidence: p.evidence || undefined,
    targetDate: p.target_date || undefined,
    lastUpdated: p.updated_at || undefined,
  }));

  return (
    <ContentLayout title={product.title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Products', href: '/solutions/products' },
          { label: product.product_code },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{product.title}</h1>
              <Badge
                variant={
                  product.status === 'deployed' || product.status === 'market_ready'
                    ? 'default'
                    : product.status === 'archived'
                    ? 'outline'
                    : 'secondary'
                }
              >
                {statusLabel}
              </Badge>
            </div>
            <p className="text-muted-foreground">{product.product_code}</p>
            {product.description && (
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                {product.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline">{domainLabel}</Badge>
              {sectorLabel && (
                <Badge variant="outline">{sectorLabel}</Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/solutions/products">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/solutions/products/${id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          </div>
        </div>

        {/* TRL Header Card */}
        <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-2">
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Technology Readiness Level</h2>
                <p className="text-sm text-muted-foreground">
                  Current progress from concept to deployment
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">Current</p>
                  <TRLBadge level={product.current_trl} size="lg" />
                </div>
                {product.target_trl && (
                  <>
                    <div className="text-2xl text-muted-foreground">&rarr;</div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-1">Target</p>
                      <TRLBadge level={product.target_trl} size="lg" />
                    </div>
                  </>
                )}
              </div>
            </div>

            <TRLProgress
              currentTRL={product.current_trl}
              targetTRL={product.target_trl}
            />
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="validations" className="space-y-6">
          <TabsList>
            <TabsTrigger value="validations">TRL Validations</TabsTrigger>
            <TabsTrigger value="ip">IP & Patents</TabsTrigger>
            <TabsTrigger value="solutions">Originating Solutions</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
            <TabsTrigger value="rdif">RDIF Readiness</TabsTrigger>
          </TabsList>

          {/* TRL Validations Tab */}
          <TabsContent value="validations" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">TRL Validation Evidence</h3>
                <p className="text-sm text-muted-foreground">
                  Documentation proving technology readiness at each level
                </p>
              </div>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Validation
              </Button>
            </div>

            {validations.length === 0 ? (
              <Card>
                <CardContent className="py-10">
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <h3 className="font-semibold">No validations yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Add validation evidence to progress through TRL levels
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Validation</TableHead>
                        <TableHead>TRL Level</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Validator</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validations.map((validation) => (
                        <TableRow key={validation.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{validation.title}</p>
                              {validation.evidence_url && (
                                <a
                                  href={validation.evidence_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                                >
                                  View Evidence
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <TRLBadge level={validation.trl_level} size="sm" />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {VALIDATION_TYPE_LABELS[validation.validation_type] || validation.validation_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{validation.validated_by || 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">
                                {validation.validator_affiliation || ''}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {validation.validation_date
                              ? format(new Date(validation.validation_date), 'MMM dd, yyyy')
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {validation.status === 'verified' && (
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Verified
                              </Badge>
                            )}
                            {validation.status === 'pending' && (
                              <Badge variant="secondary">
                                <Clock className="mr-1 h-3 w-3" />
                                Pending
                              </Badge>
                            )}
                            {validation.status === 'rejected' && (
                              <Badge variant="destructive">
                                <XCircle className="mr-1 h-3 w-3" />
                                Rejected
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* IP & Patents Tab */}
          <TabsContent value="ip" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Patent Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-semibold">Current Status</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {patentStatusLabel}
                    </p>
                  </div>
                  <Badge
                    variant={product.patent_status === 'granted' ? 'default' : 'secondary'}
                    className="text-base px-4 py-2"
                  >
                    {patentStatusLabel}
                  </Badge>
                </div>

                {product.patent_number && (
                  <div className="space-y-2">
                    <LabelText>Patent Number</LabelText>
                    <p className="text-sm font-mono bg-muted px-3 py-2 rounded">
                      {product.patent_number}
                    </p>
                  </div>
                )}

                {product.notes && (
                  <div className="space-y-2">
                    <LabelText>IP Retention Notes</LabelText>
                    <p className="text-sm text-muted-foreground">
                      {product.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Originating Solutions Tab */}
          <TabsContent value="solutions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Client Solutions</CardTitle>
                <CardDescription>
                  Client projects where this product technology originated
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(!product.originating_solution_ids || product.originating_solution_ids.length === 0) ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Link2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p>No linked solutions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {product.originating_solution_ids.map((solutionId) => (
                      <Link
                        key={solutionId}
                        href={`/solutions/${solutionId}`}
                        className="block p-4 border rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">Solution {solutionId.substring(0, 8)}...</p>
                            <p className="text-xs text-muted-foreground">
                              Click to view details
                            </p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Financial Tab */}
          <TabsContent value="financial" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Development Budget
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Allocated</span>
                        <span className="font-semibold">
                          &#8377;{(product.development_budget || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Spent</span>
                        <span className="font-semibold">
                          &#8377;{(product.development_spent || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Remaining</span>
                        <span className="font-semibold text-green-600">
                          &#8377;{((product.development_budget || 0) - (product.development_spent || 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {product.development_budget > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Utilization</span>
                          <span className="font-medium">
                            {Math.round(((product.development_spent || 0) / product.development_budget) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min(((product.development_spent || 0) / product.development_budget) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Funding Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {product.development_budget > 0 && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded">
                        <span className="text-sm">JKKN Internal</span>
                        <span className="font-semibold">
                          &#8377;{(product.development_budget || 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      No external funding yet
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* RDIF Readiness Tab */}
          <TabsContent value="rdif" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <RDIFScorecard
                  prerequisites={rdifForScorecard}
                  showDetails={true}
                />
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quick Stats</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Current TRL</p>
                      <div className="mt-1">
                        <TRLBadge level={product.current_trl} size="md" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">RDIF Threshold</p>
                      <p className="font-semibold">
                        {product.current_trl >= 4 ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            Met (TRL 4+)
                          </span>
                        ) : (
                          <span className="text-orange-600 flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Need TRL 4+
                          </span>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-[#fbfbee] border-[#0b6d41]">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-2">
                      <Award className="h-5 w-5 text-[#0b6d41] flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold text-[#0b6d41] mb-1">RDIF Funding</p>
                        <p className="text-muted-foreground text-xs">
                          Research & Development Infrastructure Fund offers grants for deep-tech
                          innovations. Meeting prerequisites opens funding opportunities.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

function LabelText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-foreground">{children}</p>;
}
