'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTabParam } from '@/hooks/use-tab-param';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateFacultyCase } from '@/hooks/pde/use-faculty-cases';
import { useVACCourses } from '@/hooks/vac/use-vac';
import { CaseFormBuilder } from '../_components/CaseFormBuilder';
import { JsonImportTab } from '../_components/JsonImportTab';
import { ImportFromPmsTab } from '../_components/ImportFromPmsTab';
import type { CreateClinicalCaseInput, ImportedPmsImage } from '@/types/pde';

const NEW_CASE_TABS = ['builder', 'json', 'pms'] as const;

function NewClinicalCasePageInner() {
  const router = useRouter();
  const [imported, setImported] = useState<Partial<CreateClinicalCaseInput> | undefined>(undefined);
  const [importedImages, setImportedImages] = useState<ImportedPmsImage[]>([]);
  // Bumped only when a JSON import is applied. The builder is force-mounted (so
  // its in-progress state survives plain tab switches), which means a changed
  // initialValue prop alone won't re-seed it — so we key the builder on this
  // counter to deliberately remount + reseed ONLY on an actual import.
  const [importSeq, setImportSeq] = useState(0);
  const [tab, setTab] = useTabParam('builder', NEW_CASE_TABS);
  const create = useCreateFacultyCase();

  const { data: coursesData } = useVACCourses();
  const courseOptions = (coursesData?.data || []).map((c: any) => ({
    id: c.id,
    code: c.code,
    name: c.name,
  }));

  const handleSave = async (value: CreateClinicalCaseInput) => {
    const res = await create.mutateAsync(value);
    router.push(`/pde/faculty/cases/${res.data.id}/edit`);
  };

  const handleImport = (parsed: Partial<CreateClinicalCaseInput>, images?: ImportedPmsImage[]) => {
    setImported(parsed);
    setImportedImages(images ?? []);
    setImportSeq((n) => n + 1);
    setTab('builder');
  };

  return (
    <ContentLayout title="New Clinical Case">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Clinical Cases', href: '/pde/faculty/cases' },
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
          <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
            <TabsTrigger value="builder">Form Builder</TabsTrigger>
            <TabsTrigger value="json">Paste JSON</TabsTrigger>
            <TabsTrigger value="pms">Import from PMS</TabsTrigger>
          </TabsList>

          {/* forceMount keeps BOTH panels mounted across tab switches so the
              Builder's in-progress form state is preserved when the user pops
              over to "Paste JSON" and back. Inactive panel is hidden via CSS. */}
          <TabsContent
            value="builder"
            forceMount
            className="mt-4 data-[state=inactive]:hidden"
          >
            <CaseFormBuilder
              key={importSeq}
              initialValue={imported}
              importedImages={importedImages}
              courseOptions={courseOptions}
              saving={create.isPending}
              saveLabel="Save as draft"
              onSave={handleSave}
            />
          </TabsContent>

          <TabsContent
            value="json"
            forceMount
            className="mt-4 data-[state=inactive]:hidden"
          >
            <Card>
              <CardContent className="p-4">
                <JsonImportTab onApply={handleImport} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="pms"
            forceMount
            className="mt-4 data-[state=inactive]:hidden"
          >
            <Card>
              <CardContent className="p-4">
                <ImportFromPmsTab onApply={handleImport} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function NewClinicalCasePage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <NewClinicalCasePageInner />
    </Suspense>
  );
}
