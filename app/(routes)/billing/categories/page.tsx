import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  FolderTree,
  Folder,
  Tag,
  ArrowRight
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Billing Categories | Finance',
  description: 'Manage billing categories and fee structures',
};

export default function BillingCategoriesPage() {
  return (
    <ContentLayout title="Billing Categories">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/invoices' },
          { label: 'Categories' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Billing Categories</h1>
          <p className="text-sm text-muted-foreground">
            Organize fees with hierarchical categories: Parent → Sub → Item
          </p>
        </div>

        {/* Category Types */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-primary" />
                Parent Categories
              </CardTitle>
              <CardDescription>
                Top-level fee groupings (e.g., Tuition, Hostel, Transport)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-2xl font-bold">5</div>
              <p className="text-xs text-muted-foreground">Active parent categories</p>
              <Button asChild className="w-full">
                <Link href="/billing/categories/parent-categories">
                  Manage Parents
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5 text-green-600" />
                Sub Categories
              </CardTitle>
              <CardDescription>
                Second-level groupings (e.g., Room Type, Bus Route)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-2xl font-bold">18</div>
              <p className="text-xs text-muted-foreground">Active sub categories</p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/billing/categories/sub-categories">
                  Manage Subs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-blue-600" />
                Item Categories
              </CardTitle>
              <CardDescription>
                Individual fee items with amounts (e.g., Lab Fee, Library Fee)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-2xl font-bold">42</div>
              <p className="text-xs text-muted-foreground">Active item categories</p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/billing/categories/item-categories">
                  Manage Items
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Hierarchy Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Category Hierarchy</CardTitle>
            <CardDescription>Visual representation of your fee structure</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  parent: 'Tuition Fees',
                  subs: ['Regular', 'Management Quota'],
                  items: 12,
                },
                {
                  parent: 'Hostel Fees',
                  subs: ['AC Room', 'Non-AC Room', 'Mess'],
                  items: 8,
                },
                {
                  parent: 'Transport Fees',
                  subs: ['Route A', 'Route B', 'Route C'],
                  items: 6,
                },
                {
                  parent: 'Examination Fees',
                  subs: ['Regular', 'Supplementary'],
                  items: 4,
                },
                {
                  parent: 'Other Fees',
                  subs: ['Library', 'Laboratory', 'Sports'],
                  items: 12,
                },
              ].map((cat, i) => (
                <div key={i} className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-primary" />
                      <span className="font-medium">{cat.parent}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{cat.items} items</span>
                  </div>
                  <div className="mt-2 pl-6 flex flex-wrap gap-2">
                    {cat.subs.map((sub, j) => (
                      <span
                        key={j}
                        className="text-xs px-2 py-1 rounded-full bg-muted"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
