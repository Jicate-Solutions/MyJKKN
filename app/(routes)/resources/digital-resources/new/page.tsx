'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalResourceForm } from '../_components/digital-resource-form';
import { DigitalResourceService } from '@/lib/services/resource/digital/digital-resource-service';
import { toast } from 'sonner';

export default function CreateDigitalResourcePage() {
  const router = useRouter();

  const handleSubmit = async (data: any) => {
    try {
      await DigitalResourceService.createDigitalResource(data);
      toast.success('Digital resource created successfully');
      router.push('/resources/digital-resources');
    } catch (error) {
      console.error('Error creating digital resource:', error);
      toast.error('Failed to create digital resource');
      throw error;
    }
  };

  const handleCancel = () => {
    router.push('/resources/digital-resources');
  };

  return (
    <ContentLayout title="Create Digital Resource">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/resources/digital-resources">Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push('/resources/digital-resources')}
            className="flex items-center"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Digital Resources
          </Button>
        </div>
        
        <div>
          <h1 className="text-2xl font-bold py-1">Create Digital Resource</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Add a new digital resource to the system
          </p>
        </div>
        
        <DigitalResourceForm onSubmit={handleSubmit} onCancel={handleCancel} />
      </div>
    </ContentLayout>
  );
}
