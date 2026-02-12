'use client';

import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Lightbulb, X, Check } from 'lucide-react';
import { TRL_LEVELS } from '../../_components/trl-badge';
import { toast } from 'sonner';
import { useCreateProduct } from '@/hooks/solutions/use-products';
import { useSolutions } from '@/hooks/solutions/use-solutions';

export default function NewProductPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createProduct = useCreateProduct();
  const { data: solutionsData } = useSolutions();
  const allSolutions = solutionsData?.data ?? [];

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    domain: '',
    rdifSector: '',
    initialTRL: '1',
    leadDepartment: '',
    originatingSolutions: [] as string[],
    notes: '',
    tags: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!formData.domain) {
      toast.error('Please select a domain');
      setIsSubmitting(false);
      return;
    }

    try {
      // Product creation uses the form data to create a new record
      await createProduct.mutateAsync({
        title: formData.title,
        description: formData.description || undefined,
        domain: formData.domain as any || undefined,
        sector: formData.rdifSector as any || undefined,
        current_trl: Number(formData.initialTRL),
        notes: formData.notes || undefined,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        originating_solution_ids: formData.originatingSolutions.length > 0 ? formData.originatingSolutions : undefined,
      });

      toast.success('Product created successfully');
      router.push('/solutions/products');
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error('Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title="New Product">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Products', href: '/solutions/products' },
          { label: 'New Product' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Create New Product</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Register a new JKKN-owned product from retained IP
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/solutions/products">
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
                  <Label htmlFor="domain">
                    Domain <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.domain}
                    onValueChange={(value) => setFormData({ ...formData, domain: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="health_tech">Health Tech</SelectItem>
                      <SelectItem value="edu_tech">Edu Tech</SelectItem>
                      <SelectItem value="pharma_tech">Pharma Tech</SelectItem>
                      <SelectItem value="dental_tech">Dental Tech</SelectItem>
                      <SelectItem value="nursing_tech">Nursing Tech</SelectItem>
                      <SelectItem value="construction_tech">Construction Tech</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rdifSector">RDIF Sector</Label>
                  <Select
                    value={formData.rdifSector}
                    onValueChange={(value) => setFormData({ ...formData, rdifSector: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select RDIF sector" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="health_technologies">Health Technologies</SelectItem>
                      <SelectItem value="digital_economy">Digital Economy</SelectItem>
                      <SelectItem value="energy">Energy</SelectItem>
                      <SelectItem value="agriculture">Agriculture</SelectItem>
                      <SelectItem value="defence">Defence</SelectItem>
                      <SelectItem value="space">Space</SelectItem>
                      <SelectItem value="telecom">Telecom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* TRL and Department */}
          <Card>
            <CardHeader>
              <CardTitle>Technology Readiness</CardTitle>
              <CardDescription>
                Starting TRL level and department ownership
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="initialTRL">
                  Initial TRL Level <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.initialTRL}
                  onValueChange={(value) => setFormData({ ...formData, initialTRL: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select TRL level" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRL_LEVELS).map(([level, info]) => (
                      <SelectItem key={level} value={level}>
                        TRL {level} - {info.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.initialTRL && (
                  <p className="text-sm text-muted-foreground">
                    {TRL_LEVELS[Number(formData.initialTRL) as keyof typeof TRL_LEVELS]?.description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="leadDepartment">Lead Department</Label>
                <Select
                  value={formData.leadDepartment}
                  onValueChange={(value) => setFormData({ ...formData, leadDepartment: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pharmacy">Pharmacy Practice</SelectItem>
                    <SelectItem value="cs">Computer Science</SelectItem>
                    <SelectItem value="eee">Electrical & Electronics Engineering</SelectItem>
                    <SelectItem value="ece">Electronics & Communication Engineering</SelectItem>
                    <SelectItem value="mech">Mechanical Engineering</SelectItem>
                    <SelectItem value="dental">Dental Sciences</SelectItem>
                    <SelectItem value="nursing">Nursing</SelectItem>
                    <SelectItem value="ahs">Allied Health Sciences</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Originating Solutions */}
          <Card>
            <CardHeader>
              <CardTitle>Originating Solutions</CardTitle>
              <CardDescription>
                Link to client solutions where this product idea originated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Originating Solutions</Label>
                <p className="text-sm text-muted-foreground">
                  Link this product to the client solutions it originated from
                </p>

                {/* Selected solutions as removable badges */}
                <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg min-h-[48px]">
                  {formData.originatingSolutions.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No solutions selected</span>
                  ) : (
                    formData.originatingSolutions.map((solId) => {
                      const sol = allSolutions.find((s: { id: string }) => s.id === solId);
                      return (
                        <Badge key={solId} variant="secondary" className="flex items-center gap-1 pr-1">
                          <span className="truncate max-w-[200px]">
                            {sol ? `${sol.solution_code} - ${sol.title}` : solId}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                originatingSolutions: formData.originatingSolutions.filter((id) => id !== solId),
                              })
                            }
                            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })
                  )}
                </div>

                {/* Scrollable list of all solutions */}
                <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                  {allSolutions.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No solutions available</p>
                  ) : (
                    allSolutions.map((sol: { id: string; title: string; solution_code: string }) => {
                      const isSelected = formData.originatingSolutions.includes(sol.id);
                      return (
                        <button
                          key={sol.id}
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              originatingSolutions: isSelected
                                ? formData.originatingSolutions.filter((id) => id !== sol.id)
                                : [...formData.originatingSolutions, sol.id],
                            });
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted transition-colors border-b last:border-b-0 ${
                            isSelected ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{sol.title}</span>
                            <span className="text-xs text-muted-foreground">{sol.solution_code}</span>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0 ml-2" />}
                        </button>
                      );
                    })
                  )}
                </div>
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
              </div>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="bg-[#fbfbee] border-[#0b6d41]">
            <CardContent className="flex items-start gap-3 py-4">
              <Lightbulb className="h-5 w-5 text-[#0b6d41] flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-[#0b6d41] mb-1">About Products & TRL</p>
                <p className="text-muted-foreground">
                  Products are JKKN-owned technology assets derived from retained IP in client
                  solutions. Track their Technology Readiness Level (TRL) from basic research
                  (TRL 1) to proven deployment (TRL 9). Reaching TRL 4+ is a key prerequisite
                  for RDIF funding eligibility.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>Creating...</>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Create Product
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
