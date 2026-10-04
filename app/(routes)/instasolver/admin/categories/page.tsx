'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCategories, useInstaSolverMutation } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverReferenceService } from '@/lib/services/instasolver/reference-service';
import type { Category, CategoryKind } from '@/types/instasolver';
import { CategoryDialog } from '../_components/category-dialog';

function CategoryList({ kind }: { kind: CategoryKind }) {
  const { data, isLoading, error } = useCategories(kind, false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const toggle = useInstaSolverMutation(
    (c: Category) =>
      InstaSolverReferenceService.saveCategory(
        {
          kind: c.kind,
          name: c.name,
          description: c.description,
          sort_order: c.sort_order,
          is_active: !c.is_active
        },
        c.id
      ),
    (_r, c) => `${c.name} ${c.is_active ? 'deactivated' : 'activated'}`
  );

  const noun = kind === 'issue' ? 'issue' : 'requirement';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {kind === 'issue'
            ? 'Categories people choose when they report a fault. Maintenance teams cover these.'
            : 'Categories people choose when they request an item.'}
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> New {noun} category
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            The categories could not be loaded. Refresh the page to try again.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No {noun} categories yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id}>
              <Card className={c.is_active ? undefined : 'opacity-75'}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {c.name}
                      {!c.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </p>
                    {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                    <p className="text-xs text-muted-foreground">Sort order {c.sort_order}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`cat-active-${c.id}`}
                        checked={c.is_active}
                        disabled={toggle.isPending}
                        onCheckedChange={() => toggle.mutate(c)}
                      />
                      <Label htmlFor={`cat-active-${c.id}`} className="text-sm font-normal">
                        Active
                      </Label>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(c);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="mr-1 h-4 w-4" /> Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <CategoryDialog kind={kind} category={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

export default function AdminCategoriesPage() {
  return (
    <AccessGate need="admin">
      <div className="space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'InstaSolver', href: '/instasolver/dashboard' },
            { label: 'Admin', href: '/instasolver/admin' },
            { label: 'Categories', isCurrent: true }
          ]}
        />
        <PageHeader
          title="Categories"
          description="Switch a category off rather than deleting it, so past records keep theirs."
          actions={
            <Button asChild variant="outline">
              <Link href="/instasolver/admin">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Admin
              </Link>
            </Button>
          }
        />
        <Tabs defaultValue="issue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="issue">Issue categories</TabsTrigger>
            <TabsTrigger value="requirement">Requirement categories</TabsTrigger>
          </TabsList>
          <TabsContent value="issue">
            <CategoryList kind="issue" />
          </TabsContent>
          <TabsContent value="requirement">
            <CategoryList kind="requirement" />
          </TabsContent>
        </Tabs>
      </div>
    </AccessGate>
  );
}
