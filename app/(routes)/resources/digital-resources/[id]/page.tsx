// app/(routes)/digital-resources/[id]/page.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ChevronLeft, Edit, Trash2, Download, Clock, Users, Calendar } from 'lucide-react';
import { DigitalResourceService } from '@/lib/services/resource/digital/digital-resource-service';
import { DigitalResource } from '@/types/digital-resources';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

export default function DigitalResourceDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [resource, setResource] = useState<DigitalResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
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
  
  const handleEdit = () => {
    router.push(`/resources/digital-resources/edit/${id}`);
  };
  
  const handleDelete = async () => {
    try {
      await DigitalResourceService.deleteDigitalResource(id);
      toast.success('Digital resource deleted successfully');
      router.push('/resources/digital-resources');
    } catch (error) {
      console.error('Error deleting digital resource:', error);
      toast.error('Failed to delete digital resource');
    } finally {
      setDeleteDialogOpen(false);
    }
  };
  
  const getStatusBadge = () => {
    if (!resource?.is_active) {
      return <Badge variant="destructive">Inactive</Badge>;
    }
    
    // Check if license is expired
    if (resource?.license_information?.expiration_date) {
      const expirationDate = new Date(resource.license_information.expiration_date);
      if (expirationDate < new Date()) {
        return <Badge variant="destructive">Expired</Badge>;
      }
    }
    
    return <Badge variant="success">Active</Badge>;
  };
  
  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }
  
  if (!resource) {
    return (
      <ContentLayout title="Resource Not Found">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/resources/digital-resources">
                  Digital Resources
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbPage>Not Found</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push('/resources/digital-resources')}
            className="flex items-center"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Digital Resources
          </Button>
        </div>
        
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-destructive">
              Digital resource not found or has been deleted.
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }
  
  return (
    <ContentLayout title={resource.digital_resource_name}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">
                Home
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/resources/digital-resources">
                Digital Resources
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{resource.digital_resource_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      
      <div className="flex items-center justify-between">
      <div className="flex flex-col gap-2 py-4">
        <h1 className="text-3xl font-bold tracking-tight flex items-center">
          {resource.digital_resource_name}
          <span className="ml-3">{getStatusBadge()}</span>
        </h1>
        <p className="text-muted-foreground">
          ID: {resource.digital_resource_id} • Type: {resource.type}
        </p>
      </div>
        
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>
      
     
      
      <Tabs defaultValue="details" className="w-full mt-2">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>
        
        <TabsContent value="details" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resource Information</CardTitle>
              <CardDescription>Basic details about this digital resource</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Resource Name</h3>
                  <p className="text-base">{resource.digital_resource_name}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Category</h3>
                  <p className="text-base">{resource.category?.category_name || 'N/A'}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Resource ID</h3>
                  <p className="text-base">{resource.digital_resource_id}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Type</h3>
                  <p className="text-base">{resource.type}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Institution</h3>
                  <p className="text-base">{resource.institution?.name || 'N/A'}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Department</h3>
                  <p className="text-base">{resource.department?.department_name || 'N/A'}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Owner Type</h3>
                  <p className="text-base">{resource.owner_type}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Created At</h3>
                  <p className="text-base">
                    {resource.created_at 
                      ? format(new Date(resource.created_at), 'dd MMM yyyy, HH:mm')
                      : 'N/A'}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Last Updated</h3>
                  <p className="text-base">
                    {resource.updated_at 
                      ? format(new Date(resource.updated_at), 'dd MMM yyyy, HH:mm')
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="access" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Access Information</CardTitle>
              <CardDescription>Details about how this resource can be accessed</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Access Method</h3>
                  <p className="text-base">{resource.access_method}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Allowed Users</h3>
                  <p className="text-base">{resource.license_information?.allowed_users || 'N/A'}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">License Expiration</h3>
                  <p className="text-base">
                    {resource.license_information?.expiration_date 
                      ? format(new Date(resource.license_information.expiration_date), 'dd MMM yyyy')
                      : 'N/A'}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Usage Constraints</h3>
                  <p className="text-base">
                    {resource.license_information?.usage_constraints && 
                     resource.license_information.usage_constraints.length > 0
                      ? resource.license_information.usage_constraints.join(', ')
                      : 'None'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Time Restrictions</h3>
                  <p className="text-base">
                    {resource.access_availability?.time_restrictions && 
                     resource.access_availability.time_restrictions.length > 0
                      ? resource.access_availability.time_restrictions.join(', ')
                      : 'No restrictions'}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Concurrency Limits</h3>
                  <p className="text-base">{resource.access_availability?.concurrency_limits || 'Unlimited'}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Sharing Restrictions</h3>
                  <p className="text-base">
                    {resource.sharing_restrictions && resource.sharing_restrictions.length > 0
                      ? resource.sharing_restrictions.join(', ')
                      : 'No restrictions'}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    View Current Users
                  </Button>
                  
                  <Button variant="outline" className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2" />
                    View Reservations
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="maintenance" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Maintenance Information</CardTitle>
              <CardDescription>Details about maintenance schedule and history</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Last Update</h3>
                  <p className="text-base">
                    {resource.maintenance_schedule?.last_update 
                      ? format(new Date(resource.maintenance_schedule.last_update), 'dd MMM yyyy')
                      : 'N/A'}
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Next Scheduled Update</h3>
                  <p className="text-base">
                    {resource.maintenance_schedule?.next_scheduled_update 
                      ? format(new Date(resource.maintenance_schedule.next_scheduled_update), 'dd MMM yyyy')
                      : 'Not scheduled'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    View Maintenance History
                  </Button>
                  
                  <Button variant="outline" className="flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Download Reports
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the digital resource &quot;{resource.digital_resource_name}&quot;? 
              This action cannot be undone and will remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
