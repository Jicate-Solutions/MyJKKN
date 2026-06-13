'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { TaxonomyMasterList } from './_components/taxonomy-master-list';
import { TaxonomyList } from './_components/taxonomy-list';

export default function TaxonomyPage() {
  return (
    <PermissionGuard module='academic.bos-taxonomy' action='view'>
      <Card>
        <CardContent className='p-6'>
          <Tabs defaultValue='frameworks'>
            <TabsList className='mb-6'>
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
