'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateFacultyCase } from '@/hooks/pde/use-faculty-cases';
import { useVACCourses } from '@/hooks/vac/use-vac';
import { CaseFormBuilder } from '../_components/CaseFormBuilder';
import { JsonImportTab } from '../_components/JsonImportTab';
import type { CreateClinicalCaseInput } from '@/types/pde';

export default function NewClinicalCasePage() {
  const router = useRouter();
  const [imported, setImported] = useState<Partial<CreateClinicalCaseInput> | undefined>(undefined);
  const [tab, setTab] = useState<'builder' | 'json'>('builder');
  const create = useCreateFacultyCase();

  const { data: coursesData } = useVACCourses();
  const courseOptions = (coursesData?.data || []).map((c: any) => ({
    id: c.id,
    code: c.code,
    name: c.name,
  }));

  const handleSave = async (value: CreateClinicalCaseInput) => {
    const res = await create.mutateAsync(value);
    router.push(`/faculty/pde/cases/${res.data.id}/edit`);
  };

  const handleImport = (parsed: Partial<CreateClinicalCaseInput>) => {
    setImported(parsed);
    setTab('builder');
  };

  return (
    <ContentLayout title="New Clinical Case">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/faculty/pde/dashboard' },
          { label: 'Clinical Cases', href: '/faculty/pde/cases' },
          { label: 'New' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
            Author a new clinical case
          </h1>
          <p className="text-sm text-muted-foreground">
            Build a case visually or paste a JSON case to import. Cases start in <strong>draft</strong> until you publish them.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="builder">Form Builder</TabsTrigger>
            <TabsTrigger value="json">Paste JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="builder" className="mt-4">
            <CaseFormBuilder
              initialValue={imported}
              courseOptions={courseOptions}
              saving={create.isPending}
              saveLabel="Save as draft"
              onSave={handleSave}
            />
          </TabsContent>

          <TabsContent value="json" className="mt-4">
            <Card>
              <CardContent className="p-4">
                <JsonImportTab onApply={handleImport} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
