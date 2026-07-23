'use client';

/**
 * Onboarding Templates — CRUD over `hostel_onboarding_templates`.
 *
 * Templates are reusable blueprints. They get cloned into a new checklist
 * (items copied + completed flags reset) when a checklist is created.
 *
 * navMeta marks the page as "invoked from list page button", not from a
 * nav chip — keeps scripts/assert-nav-coverage.mjs happy.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  FileStack,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useDeleteOnboardingTemplate,
  useOnboardingTemplates,
} from '@/hooks/campus-living/use-hostel-onboarding';
import type { OnboardingTemplate } from '@/types/campus-living/onboarding';
import { TemplateEditorDialog } from '../_components/template-editor-dialog';

export const navMeta = {
  invokedFrom: '/campus-living/allocations/onboarding',
} as const;

export default function CampusLivingOnboardingTemplatesPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';

  const { data: templates, isLoading } = useOnboardingTemplates(institutionId);
  const deleteMut = useDeleteOnboardingTemplate();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OnboardingTemplate | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (t: OnboardingTemplate) => {
    setEditing(t);
    setEditorOpen(true);
  };

  if (!institutionId) {
    return (
      <ContentLayout title="Onboarding Templates">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Campus Living', href: '/campus-living' },
            { label: 'Onboarding', href: '/campus-living/allocations/onboarding' },
            { label: 'Templates' },
          ]}
        />
        <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Pick an institution to view its onboarding templates.
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Onboarding Templates">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Onboarding', href: '/campus-living/allocations/onboarding' },
          { label: 'Templates' },
        ]}
      />

      <div className="container mx-auto p-6 space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Link href="/campus-living/allocations/onboarding">
              <Button variant="ghost" size="sm" className="-ml-2">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to onboarding
              </Button>
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileStack className="h-6 w-6 text-primary" />
              Onboarding Templates
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Reusable checklists per institution / block type / hosteller
              category. Used to seed new onboarding checklists.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> New template
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Templates ({templates?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="border border-dashed rounded-md p-10 text-center text-sm text-muted-foreground">
                No templates yet. Click “New template” to create your first
                onboarding blueprint.
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((t) => {
                      const items = Array.isArray(t.items) ? t.items : [];
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-right">
                            {items.length}
                          </TableCell>
                          <TableCell>
                            {t.is_active ? (
                              <Badge variant="success">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.updated_at
                              ? new Date(t.updated_at).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit"
                                onClick={() => openEdit(t)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Delete"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete this template?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Existing checklists are unaffected — they
                                      keep the items they were created with.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        deleteMut.mutate({
                                          id: t.id,
                                          institutionId,
                                        })
                                      }
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        institutionId={institutionId}
        template={editing}
      />
    </ContentLayout>
  );
}
