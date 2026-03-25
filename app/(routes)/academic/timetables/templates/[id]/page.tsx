'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { useTemplate } from '@/hooks/use-templates';
import { format } from 'date-fns';
import type { DayOfWeek } from '@/types/academics';
import {
  Star,
  Copy,
  Edit,
  Share,
  Download,
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Building,
  BookOpen,
  GraduationCap,
  Hash,
  Tag,
  Activity
} from 'lucide-react';
import { TemplatePreviewModal } from '../_components/template-preview-modal';

export default function TemplatePage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;
  const { isSuperAdmin, canAccess } = usePermissions();
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const { data: template, isLoading, error } = useTemplate(templateId);

  const canEdit = isSuperAdmin || canAccess('academic.timetables.templates', 'edit');
  const canCreate = isSuperAdmin || canAccess('academic.timetables', 'create');

  const handleUseTemplate = () => {
    router.push(`/academic/timetables/new?template_id=${templateId}`);
  };

  const handleEditTemplate = () => {
    router.push(`/academic/timetables/${templateId}/edit?is_template=true`);
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/academic/timetables/templates/${templateId}`;
    navigator.clipboard.writeText(shareUrl);
    // You might want to show a toast here
  };

  const handleExport = () => {
    // TODO: Implement template export functionality
  };

  if (isLoading) {
    return (
      <ContentLayout title='Template Details'>
        <div className='space-y-6'>
          <LoadingSkeleton />
        </div>
      </ContentLayout>
    );
  }

  if (error || !template) {
    return (
      <ContentLayout title='Template Not Found'>
        <div className='space-y-6'>
          <Alert variant='destructive'>
            <AlertDescription>
              Template not found or you don&apos;t have permission to view it.
            </AlertDescription>
          </Alert>
          <Button variant='outline' onClick={() => router.back()}>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard
      module='academic.timetables.templates'
      action='view'
      fallback={
        <ContentLayout title='Access Denied'>
          <div className='space-y-6'>
            <div className='p-4 border rounded-md'>
              <h3 className='text-lg font-semibold mb-2'>Debug Information</h3>
              <pre className='text-sm bg-gray-100 p-2 rounded'>
                {JSON.stringify(
                  {
                    isSuperAdmin,
                    templateId,
                    canEdit,
                    canCreate,
                    errorMessage:
                      (error as any)?.message || String(error || ''),
                    hasTemplate: !!template
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <Button variant='outline' onClick={() => router.back()}>
              Go Back
            </Button>
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title={`Template: ${template.template_name}`}>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/'>Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/academic'>Academic</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/academic/timetables'>Timetables</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href='/academic/timetables/templates'>Templates</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{template.template_name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className='flex items-start justify-between'>
            <div className='space-y-1'>
              <div className='flex items-center gap-2'>
                <Star className='h-5 w-5 text-yellow-500' />
                <h1 className='text-2xl font-bold'>{template.template_name}</h1>
                <Badge
                  variant={template.is_active ? 'default' : 'secondary'}
                  className={
                    template.is_active
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200'
                  }
                >
                  {template.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {template.template_description && (
                <p className='text-muted-foreground'>
                  {template.template_description}
                </p>
              )}
            </div>

            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => setShowPreviewModal(true)}
              >
                <Activity className='h-4 w-4 mr-2' />
                Preview
              </Button>

              <Button variant='outline' onClick={handleShare}>
                <Share className='h-4 w-4 mr-2' />
                Share
              </Button>

              <Button variant='outline' onClick={handleExport}>
                <Download className='h-4 w-4 mr-2' />
                Export
              </Button>

              {canEdit && (
                <Button variant='outline' onClick={handleEditTemplate}>
                  <Edit className='h-4 w-4 mr-2' />
                  Edit
                </Button>
              )}

              {canCreate && (
                <Button onClick={handleUseTemplate}>
                  <Copy className='h-4 w-4 mr-2' />
                  Use Template
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Template Information */}
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
            {/* Main Information */}
            <div className='lg:col-span-2'>
              <Card>
                <CardHeader>
                  <CardTitle>Template Information</CardTitle>
                </CardHeader>
                <CardContent className='space-y-6'>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-3'>
                      <div className='flex items-center gap-2'>
                        <Building className='h-4 w-4 text-muted-foreground' />
                        <span className='text-sm font-medium'>
                          Institution:
                        </span>
                        <span className='text-sm'>
                          {template.institution?.name || 'N/A'}
                        </span>
                      </div>

                      <div className='flex items-center gap-2'>
                        <GraduationCap className='h-4 w-4 text-muted-foreground' />
                        <span className='text-sm font-medium'>Program:</span>
                        <span className='text-sm'>
                          {template.program?.program_name || 'N/A'}
                        </span>
                      </div>

                      <div className='flex items-center gap-2'>
                        <BookOpen className='h-4 w-4 text-muted-foreground' />
                        <span className='text-sm font-medium'>Department:</span>
                        <span className='text-sm'>
                          {template.department?.department_name || 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className='space-y-3'>
                      <div className='flex items-center gap-2'>
                        <Hash className='h-4 w-4 text-muted-foreground' />
                        <span className='text-sm font-medium'>Semester:</span>
                        <Badge variant='secondary'>
                          Sem {template.semester_id}
                          {template.section_id && ` - ${template.section_id}`}
                        </Badge>
                      </div>

                      <div className='flex items-center gap-2'>
                        <Clock className='h-4 w-4 text-muted-foreground' />
                        <span className='text-sm font-medium'>Format:</span>
                        <Badge variant='outline' className='capitalize'>
                          {template.timetable_format || 'regular'}
                        </Badge>
                      </div>

                      <div className='flex items-center gap-2'>
                        <Users className='h-4 w-4 text-muted-foreground' />
                        <span className='text-sm font-medium'>Usage:</span>
                        <span className='text-sm'>
                          {template.usage_count || 0} times
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  {template.template_tags &&
                    template.template_tags.length > 0 && (
                      <div>
                        <span className='text-sm font-medium mb-2 block'>
                          Tags:
                        </span>
                        <div className='flex flex-wrap gap-1'>
                          {template.template_tags.map((tag: string) => (
                            <Badge
                              key={tag}
                              variant='secondary'
                              className='text-xs'
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Schedule Details */}
                  {(template.selected_days || template.periods) && (
                    <div className='space-y-3'>
                      <h4 className='font-medium'>Schedule Details</h4>

                      {template.selected_days && (
                        <div>
                          <span className='text-sm font-medium mb-2 block'>
                            Active Days:
                          </span>
                          <div className='flex flex-wrap gap-1'>
                            {template.selected_days.map((day: DayOfWeek) => (
                              <Badge
                                key={day}
                                variant='outline'
                                className='text-xs'
                              >
                                {day}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {template.periods && (
                        <div>
                          <span className='text-sm font-medium mb-2 block'>
                            Periods:
                          </span>
                          <div className='text-sm text-muted-foreground'>
                            {Array.isArray(template.periods)
                              ? `${template.periods.length} periods configured`
                              : 'Period information available'}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Information */}
            <div className='space-y-4'>
              {/* Category */}
              {template.template_category && (
                <Card>
                  <CardHeader>
                    <CardTitle className='text-base flex items-center gap-2'>
                      <Tag className='h-4 w-4' />
                      Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant='outline'>
                      {template.template_category}
                    </Badge>
                  </CardContent>
                </Card>
              )}

              {/* Timestamps */}
              <Card>
                <CardHeader>
                  <CardTitle className='text-base flex items-center gap-2'>
                    <Calendar className='h-4 w-4' />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                  <div>
                    <span className='text-sm font-medium'>Created:</span>
                    <div className='text-sm text-muted-foreground'>
                      {format(
                        new Date(template.created_at),
                        "MMM dd, yyyy 'at' h:mm a"
                      )}
                    </div>
                  </div>
                  <div>
                    <span className='text-sm font-medium'>Last Updated:</span>
                    <div className='text-sm text-muted-foreground'>
                      {format(
                        new Date(template.updated_at),
                        "MMM dd, yyyy 'at' h:mm a"
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Template Preview Modal */}
          <TemplatePreviewModal
            template={template as any}
            open={showPreviewModal}
            onOpenChange={setShowPreviewModal}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
