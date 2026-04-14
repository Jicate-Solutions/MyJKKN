'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { TRL_LEVELS } from '../../../_components/trl-badge';
import { toast } from 'sonner';
import {
  useProduct,
  useUpdateProduct,
  PRODUCT_STATUSES,
  DOMAIN_LABELS,
  SECTOR_LABELS,
  PATENT_STATUS_LABELS,
} from '@/hooks/solutions/use-products';
import type { ProductDomain, RDIFSector, ProductStatus, PatentStatus } from '@/hooks/solutions/use-products';

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: EditProductPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading, error } = useProduct(id);
  const updateProduct = useUpdateProduct();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    domain: '',
    sector: '',
    currentTRL: '1',
    targetTRL: '',
    status: 'concept',
    patentStatus: 'none',
    patentNumber: '',
    notes: '',
    tags: '',
    developmentBudget: '',
  });

  // Pre-populate form when product data loads
  useEffect(() => {
    if (product && !isInitialized) {
      setFormData({
        title: product.title || '',
        description: product.description || '',
        domain: product.domain || '',
        sector: product.sector || '',
        currentTRL: String(product.current_trl || 1),
        targetTRL: product.target_trl ? String(product.target_trl) : '',
        status: product.status || 'concept',
        patentStatus: product.patent_status || 'none',
        patentNumber: product.patent_number || '',
        notes: product.notes || '',
        tags: product.tags ? product.tags.join(', ') : '',
        developmentBudget: product.development_budget ? String(product.development_budget) : '',
      });
      setIsInitialized(true);
    }
  }, [product, isInitialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let validatedBudget: number | null = null;
      if (formData.developmentBudget) {
        const budget = Number(formData.developmentBudget);
        if (!Number.isFinite(budget) || budget < 0) {
          toast.error('Development budget must be a valid positive number');
          return;
        }
        validatedBudget = budget;
      }

      await updateProduct.mutateAsync({
        id,
        input: {
          title: formData.title,
          description: formData.description || null,
          domain: (formData.domain as ProductDomain) || null,
          sector: (formData.sector as RDIFSector) || null,
          current_trl: Number(formData.currentTRL),
          target_trl: formData.targetTRL ? Number(formData.targetTRL) : null,
          status: (formData.status as ProductStatus) || 'concept',
          patent_status: (formData.patentStatus as PatentStatus) || 'none',
          patent_number: formData.patentStatus === 'none' ? null : (formData.patentNumber || null),
          notes: formData.notes || null,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
          ...(validatedBudget !== null ? { development_budget: validatedBudget } : {}),
        },
      });

      toast.success('Product updated successfully');
      router.push(`/solutions/products/${id}`);
    } catch (err) {
      console.error('Error updating product:', err);
      toast.error('Failed to update product');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Solutions Hub', href: '/solutions' },
            { label: 'Products', href: '/solutions/products' },
            { label: '...' },
          ]}
        />
        <div className="space-y-6 mt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-10 w-24" />
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </ContentLayout>
    );
  }

  // Error state
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

  // Not found state
  if (!product) {
    return (
      <ContentLayout title="Product Not Found">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
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

  return (
    <ContentLayout title={`Edit ${product.title}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Products', href: '/solutions/products' },
          { label: product.product_code, href: `/solutions/products/${id}` },
          { label: 'Edit' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Edit Product</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Update details for {product.product_code} - {product.title}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/solutions/products/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Core details about the product
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">
                  Product Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g., AI-Powered Prescription Analyzer"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of what this product does..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Select
                    value={formData.domain}
                    onValueChange={(value) => setFormData({ ...formData, domain: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOMAIN_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sector">RDIF Sector</Label>
                  <Select
                    value={formData.sector}
                    onValueChange={(value) => setFormData({ ...formData, sector: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select RDIF sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SECTOR_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Technology Readiness */}
          <Card>
            <CardHeader>
              <CardTitle>Technology Readiness</CardTitle>
              <CardDescription>
                Current and target TRL levels
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentTRL">
                    Current TRL Level <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.currentTRL}
                    onValueChange={(value) => setFormData({ ...formData, currentTRL: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select current TRL" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(TRL_LEVELS) as [string, { name: string; description: string; color: string }][]).map(([level, info]) => (
                        <SelectItem key={level} value={level}>
                          TRL {level} - {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.currentTRL && (
                    <p className="text-sm text-muted-foreground">
                      {TRL_LEVELS[Number(formData.currentTRL) as keyof typeof TRL_LEVELS]?.description}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetTRL">Target TRL Level</Label>
                  <Select
                    value={formData.targetTRL}
                    onValueChange={(value) => setFormData({ ...formData, targetTRL: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select target TRL" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(TRL_LEVELS) as [string, { name: string; description: string; color: string }][]).map(([level, info]) => (
                        <SelectItem key={level} value={level}>
                          TRL {level} - {info.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.targetTRL && (
                    <p className="text-sm text-muted-foreground">
                      {TRL_LEVELS[Number(formData.targetTRL) as keyof typeof TRL_LEVELS]?.description}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patent Information */}
          <Card>
            <CardHeader>
              <CardTitle>Patent Information</CardTitle>
              <CardDescription>
                Intellectual property and patent status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="patentStatus">Patent Status</Label>
                <Select
                  value={formData.patentStatus}
                  onValueChange={(value) => setFormData({ ...formData, patentStatus: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patent status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PATENT_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.patentStatus !== 'none' && (
                <div className="space-y-2">
                  <Label htmlFor="patentNumber">Patent Number</Label>
                  <Input
                    id="patentNumber"
                    placeholder="e.g., IN202541001234"
                    value={formData.patentNumber}
                    onChange={(e) => setFormData({ ...formData, patentNumber: e.target.value })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Budget */}
          <Card>
            <CardHeader>
              <CardTitle>Development Budget</CardTitle>
              <CardDescription>
                Allocated budget for product development
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="developmentBudget">Budget (INR)</Label>
                <Input
                  id="developmentBudget"
                  type="number"
                  placeholder="e.g., 500000"
                  value={formData.developmentBudget}
                  onChange={(e) => setFormData({ ...formData, developmentBudget: e.target.value })}
                  min={0}
                  step={1000}
                />
                <p className="text-sm text-muted-foreground">
                  Total allocated development budget in Indian Rupees
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
              <CardDescription>
                Notes and tags for organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes about this product..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  placeholder="Enter tags separated by commas"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  e.g., ai, healthcare, prescription-analysis
                </p>
                {formData.tags && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formData.tags.split(',').map(t => t.trim()).filter(Boolean).map((tag, idx) => (
                      <Badge key={`${tag}-${idx}`} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="bg-[#fbfbee] border-[#0b6d41]">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-[#0b6d41] flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-[#0b6d41] mb-1">Editing Product</p>
                <p className="text-muted-foreground">
                  Changes will be saved immediately. TRL level updates here change the current
                  assessment only. To record a formal TRL advancement with validation evidence,
                  use the TRL management section on the product detail page.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/solutions/products/${id}`)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
