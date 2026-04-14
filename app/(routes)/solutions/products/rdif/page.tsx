'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Award,
  Check,
  X,
  Clock,
  TrendingUp,
  Target,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { TRLBadge } from '../../_components/trl-badge';
import { cn } from '@/lib/utils';
import {
  useRDIFReadinessScore,
  useThreeYearBridgeStatus,
  useProducts,
} from '@/hooks/solutions/use-products';

export default function RDIFDashboardPage() {
  const { data: rdifData, isLoading: rdifLoading, error: rdifError } = useRDIFReadinessScore();
  const { data: bridgeData, isLoading: bridgeLoading } = useThreeYearBridgeStatus();
  const { data: productsData } = useProducts({ min_trl: 2, max_trl: 5 });

  const isLoading = rdifLoading || bridgeLoading;

  if (isLoading) {
    return (
      <ContentLayout title="RDIF Readiness">
        <div className="space-y-6 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (rdifError) {
    return (
      <ContentLayout title="RDIF Readiness">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg text-muted-foreground">
            {rdifError instanceof Error ? rdifError.message : 'Failed to load RDIF data'}
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

  const prerequisites = rdifData?.prerequisites || [];
  const metCount = rdifData?.score || 0;
  const totalCount = rdifData?.total || 9;
  const percentage = rdifData?.percentage || 0;

  // Products closest to TRL 4+
  const nearbyProducts = (productsData?.data || [])
    .sort((a, b) => b.current_trl - a.current_trl)
    .slice(0, 5);

  return (
    <ContentLayout title="RDIF Readiness">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Products', href: '/solutions/products' },
          { label: 'RDIF Readiness' },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">RDIF Readiness Dashboard</h1>
            <p className="text-muted-foreground">
              Track progress toward Research & Development Infrastructure Fund eligibility
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/solutions/products">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Products
            </Link>
          </Button>
        </div>

        {/* Overall Score */}
        <Card className="bg-gradient-to-r from-[#fbfbee] to-green-50 border-2 border-[#0b6d41]">
          <CardContent className="py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                {/* Progress Circle */}
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-gray-200"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray={`${percentage * 2.51327} 251.327`}
                      className={cn(
                        'transition-all duration-500',
                        metCount >= 7 && 'text-green-500',
                        metCount >= 4 && metCount < 7 && 'text-yellow-500',
                        metCount < 4 && 'text-red-500'
                      )}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold">{percentage}%</span>
                  </div>
                </div>

                {/* Score Info */}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge
                      className={cn(
                        'text-lg px-4 py-2',
                        metCount >= 7 && 'bg-green-500',
                        metCount >= 4 && metCount < 7 && 'bg-yellow-500',
                        metCount < 4 && 'bg-red-500'
                      )}
                    >
                      {metCount} of {totalCount} Prerequisites Met
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mb-1">
                    {metCount >= 7
                      ? 'Strong readiness - eligible to apply'
                      : metCount >= 4
                      ? 'Moderate readiness - continue building'
                      : 'Early stage - foundational work needed'}
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Last updated: {new Date().toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-2">About RDIF</p>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href="https://www.rdif.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-1"
                  >
                    Learn More
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prerequisites Grid */}
        <div>
          <h2 className="text-xl font-semibold mb-4">9 Prerequisites Breakdown</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {prerequisites.map((prereq, index) => (
              <Card
                key={prereq.id}
                className={cn(
                  'transition-all',
                  prereq.is_met && 'border-green-200 bg-green-50/50',
                  !prereq.is_met && 'border-gray-200'
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={cn(
                        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                        prereq.is_met
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                      )}
                    >
                      {prereq.is_met ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <Badge
                      variant={prereq.is_met ? 'default' : 'secondary'}
                      className={cn(prereq.is_met && 'bg-green-500')}
                    >
                      {prereq.is_met ? 'Met' : 'Not Met'}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-3">{prereq.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {prereq.is_met ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-green-900">Evidence</p>
                          <p className="text-muted-foreground">{prereq.evidence || 'N/A'}</p>
                        </div>
                      </div>
                      {prereq.updated_at && (
                        <p className="text-xs text-muted-foreground">
                          Updated: {new Date(prereq.updated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-sm">
                        <X className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Action needed</p>
                          <p className="text-muted-foreground text-xs">
                            {prereq.description || 'Work in progress'}
                          </p>
                        </div>
                      </div>
                      {prereq.target_date && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Target className="h-3 w-3" />
                          Target: {prereq.target_date}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Three-Year Bridge Timeline */}
        {bridgeData && (
          <Card>
            <CardHeader>
              <CardTitle>Three-Year Bridge to RDIF Readiness</CardTitle>
              <CardDescription>
                Currently in {bridgeData.yearLabel} — {bridgeData.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {bridgeData.nextMilestones.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="font-semibold text-green-600">All milestones achieved!</p>
                    <p className="text-sm">Ready to apply for RDIF funding</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bridgeData.nextMilestones.map((milestone, index) => (
                      <div
                        key={milestone.prerequisiteKey}
                        className="flex items-start gap-3 p-3 bg-muted rounded-lg"
                      >
                        <div className={cn(
                          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white',
                          milestone.priority === 'critical' && 'bg-red-500',
                          milestone.priority === 'high' && 'bg-orange-500',
                          milestone.priority === 'medium' && 'bg-blue-500',
                          milestone.priority === 'low' && 'bg-gray-400'
                        )}>
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{milestone.label}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                milestone.priority === 'critical' && 'border-red-300 text-red-700',
                                milestone.priority === 'high' && 'border-orange-300 text-orange-700'
                              )}
                            >
                              {milestone.priority}
                            </Badge>
                          </div>
                          {milestone.description && (
                            <p className="text-xs text-muted-foreground mt-1">{milestone.description}</p>
                          )}
                          {milestone.targetDate && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <Target className="h-3 w-3" />
                              Target: {milestone.targetDate}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Closest to TRL 4+ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Products Closest to TRL 4+
            </CardTitle>
            <CardDescription>
              TRL 4+ is a key RDIF prerequisite - these products are nearest
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nearbyProducts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>No products yet. Create products to track TRL progress.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nearbyProducts.map((product) => (
                  <Link
                    key={product.id}
                    href={`/solutions/products/${product.id}`}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <TRLBadge level={product.current_trl} size="md" />
                      <div>
                        <p className="font-medium">{product.title}</p>
                        <p className="text-sm text-muted-foreground">{product.product_code}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {product.current_trl >= 4
                          ? 'Threshold met'
                          : `${4 - product.current_trl} level${4 - product.current_trl > 1 ? 's' : ''} to go`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-[#fbfbee] border-[#0b6d41]">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Award className="h-6 w-6 text-[#0b6d41] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-[#0b6d41] mb-2">
                  About RDIF (Research & Development Infrastructure Fund)
                </h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    RDIF is a government initiative supporting deep-tech innovation in strategic
                    sectors. It provides grants and soft loans for R&D infrastructure, technology
                    validation, and commercialization.
                  </p>
                  <p>
                    <strong>Key Benefits:</strong> Up to ₹10 crore in funding, mentorship from
                    SLFM, access to government labs, preferential procurement consideration.
                  </p>
                  <p>
                    <strong>Eligibility:</strong> 9 prerequisites must be met. Current JKKN
                    status: {metCount}/9 ({percentage}%)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
