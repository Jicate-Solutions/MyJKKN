'use client';

/**
 * HR Benefits Management — C4.
 *
 * Benefits catalog with enrollment tracking. CRUD operations
 * via dialog form + table. Pure Tailwind UI.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Heart,
  Plus,
  RefreshCw,
  Package,
  Users,
  DollarSign,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBenefits, useBenefitsStats, useCreateBenefit } from '@/hooks/hr/use-benefits';
import {
  BENEFIT_CATEGORIES,
  type BenefitCategory,
} from '@/types/hr-benefits';

// =====================================================================================
// Summary card
// =====================================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  const iconColor = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <Icon className={`h-8 w-8 ${iconColor[color]} opacity-50`} />
      </div>
    </div>
  );
}

// =====================================================================================
// Category badge
// =====================================================================================

function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    health: 'bg-green-100 text-green-700',
    insurance: 'bg-blue-100 text-blue-700',
    retirement: 'bg-purple-100 text-purple-700',
    education: 'bg-amber-100 text-amber-700',
    transport: 'bg-cyan-100 text-cyan-700',
    meal: 'bg-orange-100 text-orange-700',
    other: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        colorMap[category] ?? colorMap.other
      }`}
    >
      {category}
    </span>
  );
}

// =====================================================================================
// Add Benefit Dialog
// =====================================================================================

function AddBenefitDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createBenefit = useCreateBenefit();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<BenefitCategory>('health');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Benefit name is required');
      return;
    }

    try {
      await createBenefit.mutateAsync({
        // institution_id will need to come from user context in production;
        // for now the server-side RLS enforces scoping
        institution_id: '', // placeholder — server resolves from auth
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        cost_to_company: cost ? parseFloat(cost) : undefined,
      });
      toast.success('Benefit created');
      onOpenChange(false);
      setName('');
      setCategory('health');
      setDescription('');
      setCost('');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create benefit');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Benefit</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="benefit-name">Name</Label>
            <Input
              id="benefit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Group Health Insurance"
              required
            />
          </div>
          <div>
            <Label htmlFor="benefit-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as BenefitCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BENEFIT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="benefit-description">Description</Label>
            <Input
              id="benefit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
            />
          </div>
          <div>
            <Label htmlFor="benefit-cost">Monthly Cost to Company (INR)</Label>
            <Input
              id="benefit-cost"
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createBenefit.isPending}>
              {createBenefit.isPending ? 'Creating...' : 'Create Benefit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================================
// Format helpers
// =====================================================================================

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

// =====================================================================================
// Main page
// =====================================================================================

export default function BenefitsPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const filters = {
    ...(categoryFilter !== 'all' && {
      category: categoryFilter as BenefitCategory,
    }),
  };

  const {
    data: benefitsData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useBenefits(filters);
  const { data: stats } = useBenefitsStats();

  return (
    <ContentLayout title="Benefits Management">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Benefits</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Benefits Management
          </h1>
          <p className="text-sm text-gray-500">
            Manage benefits catalog and staff enrollment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Benefit
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">Failed to load benefits</p>
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      )}

      {/* Summary cards */}
      {stats && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Benefits"
            value={stats.total_benefits}
            icon={Package}
            color="blue"
          />
          <StatCard
            label="Active Benefits"
            value={stats.active_benefits}
            icon={CheckCircle2}
            color="green"
          />
          <StatCard
            label="Active Enrollments"
            value={stats.total_active_enrollments}
            icon={Users}
            color="purple"
          />
          <StatCard
            label="Monthly Cost"
            value={formatINR(stats.total_monthly_cost)}
            icon={DollarSign}
            color="amber"
          />
        </div>
      )}

      {/* Category filter */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm text-gray-600">Filter:</span>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {BENEFIT_CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategoryFilter(c.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === c.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Benefits table */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-5 flex-1 rounded bg-gray-200" />
                  <div className="h-5 w-20 rounded bg-gray-200" />
                  <div className="h-5 w-16 rounded bg-gray-200" />
                  <div className="h-5 w-12 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        ) : benefitsData?.data.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Cost/mo
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Enrolled
                  </th>
                  <th className="px-4 py-3 font-medium text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {benefitsData.data.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{b.name}</p>
                        {b.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {b.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={b.category} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatINR(b.cost_to_company)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        {b.enrolled_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {b.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Heart className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No benefits found</p>
            <p className="text-sm mt-1">
              {categoryFilter !== 'all'
                ? 'Try a different category filter'
                : 'Click "Add Benefit" to create one'}
            </p>
          </div>
        )}

        {/* Pagination info */}
        {benefitsData && benefitsData.total > benefitsData.limit && (
          <div className="border-t border-gray-200 px-4 py-3 text-sm text-gray-500">
            Showing {benefitsData.data.length} of {benefitsData.total} benefits
          </div>
        )}
      </div>

      {/* Category breakdown from stats */}
      {stats?.by_category.length ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Benefits by Category
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.by_category.map((cat) => (
              <div
                key={cat.category}
                className="rounded-lg border border-gray-100 bg-gray-50 p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <CategoryBadge category={cat.category} />
                  <span className="text-sm font-medium text-gray-700">
                    {cat.count}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Total cost: {formatINR(cat.cost)}/mo
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Add Benefit Dialog */}
      <AddBenefitDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </ContentLayout>
  );
}
