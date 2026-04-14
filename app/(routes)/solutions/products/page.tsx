'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  Plus,
  Lightbulb,
  TrendingUp,
  Award,
  AlertCircle,
  Search,
} from 'lucide-react';
import { TRLBadge } from '../_components/trl-badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { format } from 'date-fns';
import {
  useProducts,
  useProductStats,
  DOMAIN_LABELS,
  PATENT_STATUS_LABELS,
  PRODUCT_STATUSES,
} from '@/hooks/solutions/use-products';
import { useRDIFReadinessScore } from '@/hooks/solutions/use-products';

export default function ProductsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [trlFilter, setTRLFilter] = useState<string>('all');

  const { data: productsData, isLoading, error } = useProducts({
    search: searchQuery || undefined,
    domain: domainFilter !== 'all' ? domainFilter as any : undefined,
    min_trl: trlFilter !== 'all' ? parseInt(trlFilter) : undefined,
    max_trl: trlFilter !== 'all' ? parseInt(trlFilter) : undefined,
  });
  const { data: stats } = useProductStats();
  const { data: rdifData } = useRDIFReadinessScore();

  const products = productsData?.data || [];
  const totalProducts = stats?.total || 0;
  const averageTRL = stats?.averageTRL || 0;
  const trl4Plus = products.filter(p => p.current_trl >= 4).length;
  const rdifScore = rdifData?.score || 0;

  return (
    <ContentLayout title="Products & TRL Tracking">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Products' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Products & TRL Tracking</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track JKKN-owned products from retained IP and their Technology Readiness Levels
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/products/new">
              <Plus className="mr-2 h-4 w-4" />
              New Product
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Lightbulb className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{totalProducts}</p>
                <p className="text-sm text-muted-foreground">Total Products</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{averageTRL.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">Average TRL</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Award className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{trl4Plus}</p>
                <p className="text-sm text-muted-foreground">TRL 4+ Products</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0b6d41] text-white font-bold text-sm">
                {rdifScore}
              </div>
              <div>
                <p className="text-2xl font-bold">{rdifScore}/9</p>
                <p className="text-sm text-muted-foreground">RDIF Readiness</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Link to RDIF Dashboard */}
        <Card className="bg-[#fbfbee] border-[#0b6d41]">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-semibold text-[#0b6d41]">RDIF Readiness Dashboard</p>
              <p className="text-sm text-muted-foreground">
                View detailed prerequisites and three-year bridge plan
              </p>
            </div>
            <Button asChild variant="outline" className="border-[#0b6d41] text-[#0b6d41]">
              <Link href="/solutions/products/rdif">
                View Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {Object.entries(DOMAIN_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={trlFilter} onValueChange={setTRLFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by TRL" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All TRL Levels</SelectItem>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
                <SelectItem key={level} value={level.toString()}>
                  TRL {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Error State */}
        {error && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <div>
                  <h3 className="font-semibold">Failed to load products</h3>
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
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!isLoading && !error && products.length === 0 && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <Lightbulb className="h-10 w-10 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">No products yet</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Products emerge from retained IP in client solutions. When you identify
                    reusable technology, create a product to track its TRL journey.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/solutions/products/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Product
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Products Table */}
        {!isLoading && !error && products.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>TRL</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Patent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Solutions</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link href={`/solutions/products/${product.id}`} className="hover:underline">
                          <div>
                            <p className="font-medium">{product.title}</p>
                            <p className="text-sm text-muted-foreground">{product.product_code}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <TRLBadge level={product.current_trl} size="sm" />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {product.domain ? DOMAIN_LABELS[product.domain] || product.domain : 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            product.patent_status === 'granted'
                              ? 'default'
                              : product.patent_status === 'full_filed' || product.patent_status === 'provisional_filed'
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {PATENT_STATUS_LABELS[product.patent_status] || product.patent_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            product.status === 'deployed' || product.status === 'market_ready'
                              ? 'default'
                              : product.status === 'archived'
                              ? 'outline'
                              : 'secondary'
                          }
                        >
                          {PRODUCT_STATUSES.find(s => s.value === product.status)?.label || product.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {product.originating_solution_ids?.length || 0}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {format(new Date(product.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
