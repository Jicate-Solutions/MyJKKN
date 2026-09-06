'use client';

import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { TaxonomyMasterList } from './_components/taxonomy-master-list';
import { TaxonomyList } from './_components/taxonomy-list';
import { useTabParam } from '@/hooks/use-tab-param';

const TAXONOMY_TABS = ['frameworks', 'assignments'] as const;

function TaxonomyPageInner() {
  const [activeTab, setActiveTab] = useTabParam('frameworks', TAXONOMY_TABS);
  return (
    <PermissionGuard module='academic.bos-taxonomy' action='view'>
      <Card>
        <CardContent className='p-6'>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='mb-6 flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
              <TabsTrigger value='frameworks'>Taxonomy Frameworks</TabsTrigger>
              <TabsTrigger value='assignments'>Regulation Assignment</TabsTrigger>
            </TabsList>
            <TabsContent value='frameworks'>
              <TaxonomyMasterList />
            </TabsContent>
            <TabsContent value='assignments'>
              <TaxonomyList />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}

export default function TaxonomyPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <TaxonomyPageInner />
    </Suspense>
  );
}
