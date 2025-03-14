'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DigitalResourceForm } from '../../_components/digital-resource-form';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { DigitalResourceService } from '@/lib/services/resource/digital-resource-service';
import { DigitalResource } from '@/types/digital-resources';
import { toast } from 'react-hot-toast';

export default function EditDigitalResourcePage() {
  const params = useParams();
  const router = useRouter();
  const [resource, setResource] = useState<DigitalResource | null>(null);
  const [loading, setLoading] = useState(true);
  
  const id = params.id as string;
  
  useEffect(() => {
    const fetchResource = async () => {
      try {
        setLoading(true);
        const data = await DigitalResourceService.getDigitalResource(id);
        setResource(data);
      } catch (error) {
        console.error('Error fetching digital resource:', error);
        toast.error('Failed to load digital resource details');
      } finally {
        setLoading(false);
      }
    };
    
    if (id) {
      fetchResource();
    }
  }, [id]);
  
  const handleSubmit = async (data: any) => {
    try {
      await DigitalResourceService.updateDigitalResource(id, data);
      toast.success('Digital resource updated successfully');
      router.push(`/digital-resources/${id}`);
    } catch (error) {
      console.error('Error updating digital resource:', error);
      toast.error('Failed to update digital resource');
      throw error;
    }
  };
  
  const handleCancel = () => {
    router.push(`/digital-resources/${id}`);
  };
  
  if (loading) {
    return (
      <ContentLayout title="Edit Digital Resource">
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
                <Link href="/digital-resources">Digital Resources</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="flex justify-center items-center h-64 mt-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }
  
  if (!resource) {
    return (
      <ContentLayout title="Resource Not Found">
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
                <Link href="/digital-resources">Digital Resources</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Not Found</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="space-y-6 mt-4">
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push('/digital-resources')}
              className="flex items-center"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Digital Resources
            </Button>
          </div>
          
          <div className="text-center py-8 text-destructive">
            Digital resource not found or has been deleted.
          </div>
        </div>
      </ContentLayout>
    );
  }
  
  return (
    <ContentLayout title={`Edit ${resource.digital_resource_name}`}>
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
              <Link href="/digital-resources">Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/digital-resources/${id}`}>{resource.digital_resource_name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      
      <div className="space-y-6 mt-4">
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push(`/digital-resources/${id}`)}
            className="flex items-center"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Resource Details
          </Button>
        </div>
        
        <div>
          <h1 className="text-2xl font-bold py-1">Edit Digital Resource</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Update the details of {resource.digital_resource_name}
          </p>
        </div>
        
        <DigitalResourceForm 
          initialData={resource} 
          onSubmit={handleSubmit} 
          onCancel={handleCancel} 
        />
      </div>
    </ContentLayout>
  );
}
