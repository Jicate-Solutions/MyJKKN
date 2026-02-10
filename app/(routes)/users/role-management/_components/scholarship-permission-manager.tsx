'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { toast } from 'react-hot-toast';
import {
  GraduationCap,
  Shield,
  Eye,
  Plus,
  Edit,
  CheckCircle,
  Users,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PERMISSION_TEMPLATES,
  type ScholarshipPermissions,
  type PermissionTemplate
} from '@/lib/services/billing/scholarship-permission-service';
import {
  useScholarshipPermissions,
  useApplyPermissionTemplate
} from '@/hooks/billing/use-scholarship-permissions';

interface UIPermissionTemplate extends PermissionTemplate {
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

const UI_PERMISSION_TEMPLATES: UIPermissionTemplate[] = [
  {
    ...PERMISSION_TEMPLATES[0], // full_access
    icon: Shield,
    variant: 'default'
  },
  {
    ...PERMISSION_TEMPLATES[1], // creator
    icon: Plus,
    variant: 'secondary'
  },
  {
    ...PERMISSION_TEMPLATES[2], // reviewer
    icon: CheckCircle,
    variant: 'outline'
  },
  {
    ...PERMISSION_TEMPLATES[3], // readonly
    icon: Eye,
    variant: 'outline'
  },
  {
    ...PERMISSION_TEMPLATES[4], // no_access
    icon: AlertTriangle,
    variant: 'destructive'
  }
];

export function ScholarshipPermissionManager() {
  const { permissions, isLoading } = useScholarshipPermissions();
  const applyTemplateMutation = useApplyPermissionTemplate();

  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const applyTemplate = async () => {
    if (!selectedRole || !selectedTemplate) {
      toast.error('Please select both a role and permission template');
      return;
    }

    const template = UI_PERMISSION_TEMPLATES.find(
      (t) => t.id === selectedTemplate
    );
    if (!template) return;

    try {
      await applyTemplateMutation.mutateAsync({
        roleKey: selectedRole,
        templateId: selectedTemplate
      });

      toast.success(
        `Applied "${template.name}" permissions to ${selectedRole} role`
      );

      setSelectedRole('');
      setSelectedTemplate('');
    } catch {
      // Error toast is handled by the mutation's onError callback
    }
  };

  const getAccessLevel = (
    perm: ScholarshipPermissions
  ): UIPermissionTemplate => {
    for (const template of UI_PERMISSION_TEMPLATES) {
      const matches = Object.entries(template.permissions).every(
        ([key, value]) => perm[key as keyof typeof perm] === value
      );
      if (matches) return template;
    }

    return {
      id: 'custom',
      name: 'Custom',
      description: 'Custom permission configuration',
      icon: Edit,
      permissions: {
        can_view: perm.can_view,
        can_create: perm.can_create,
        can_edit: perm.can_edit,
        can_delete: perm.can_delete,
        can_approve: perm.can_approve
      },
      variant: 'outline'
    };
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className='p-6'>
          <div className='flex items-center justify-center'>
            <div className='text-center'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2'></div>
              <p className='text-sm text-muted-foreground'>
                Loading permissions...
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <div className='p-2 bg-primary/10 rounded-lg'>
          <GraduationCap className='h-5 w-5 text-primary' />
        </div>
        <div>
          <h2 className='text-xl font-semibold'>
            Scholarship Permission Management
          </h2>
          <p className='text-sm text-muted-foreground'>
            Dynamically configure scholarship access for different roles
          </p>
        </div>
      </div>

      {/* Quick Apply Section */}
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Quick Permission Templates</CardTitle>
          <CardDescription>
            Apply predefined permission sets to any role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
            <div>
              <Label htmlFor='role-select'>Select Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder='Choose role' />
                </SelectTrigger>
                <SelectContent>
                  {permissions.map((perm) => (
                    <SelectItem key={perm.role_key} value={perm.role_key}>
                      <div className='flex items-center gap-2'>
                        <Users className='h-4 w-4' />
                        {perm.role_name} ({perm.user_count} users)
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor='template-select'>Permission Template</Label>
              <Select
                value={selectedTemplate}
                onValueChange={setSelectedTemplate}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Choose template' />
                </SelectTrigger>
                <SelectContent>
                  {UI_PERMISSION_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className='flex items-center gap-2'>
                        <template.icon className='h-4 w-4' />
                        {template.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='flex items-end'>
              <Button
                onClick={applyTemplate}
                disabled={
                  !selectedRole ||
                  !selectedTemplate ||
                  applyTemplateMutation.isPending
                }
                className='w-full'
              >
                {applyTemplateMutation.isPending
                  ? 'Applying...'
                  : 'Apply Template'}
              </Button>
            </div>
          </div>

          {/* Template Preview */}
          {selectedTemplate && (
            <div className='mt-4 p-4 bg-muted/50 rounded-lg'>
              {(() => {
                const template = UI_PERMISSION_TEMPLATES.find(
                  (t) => t.id === selectedTemplate
                );
                if (!template) return null;

                return (
                  <div>
                    <div className='flex items-center gap-2 mb-2'>
                      <template.icon className='h-4 w-4' />
                      <span className='font-medium'>{template.name}</span>
                    </div>
                    <p className='text-sm text-muted-foreground mb-3'>
                      {template.description}
                    </p>
                    <div className='flex flex-wrap gap-2'>
                      {Object.entries(template.permissions).map(
                        ([key, value]) => (
                          <Badge
                            key={key}
                            variant={value ? 'default' : 'secondary'}
                            className={cn(
                              'text-xs',
                              value
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600'
                            )}
                          >
                            {key.replace('can_', '').replace('_', ' ')}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Role Permissions Matrix</CardTitle>
          <CardDescription>
            Current scholarship permissions by role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className='text-center'>Access Level</TableHead>
                  <TableHead className='text-center'>View</TableHead>
                  <TableHead className='text-center'>Create</TableHead>
                  <TableHead className='text-center'>Edit</TableHead>
                  <TableHead className='text-center'>Delete</TableHead>
                  <TableHead className='text-center'>Approve</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((perm) => {
                  const accessLevel = getAccessLevel(perm);

                  return (
                    <TableRow key={perm.role_key}>
                      <TableCell>
                        <div>
                          <div className='font-medium'>{perm.role_name}</div>
                          <div className='text-sm text-muted-foreground'>
                            {perm.user_count} users
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className='text-center'>
                        <Badge
                          variant={accessLevel.variant}
                          className='text-xs'
                        >
                          <accessLevel.icon className='h-3 w-3 mr-1' />
                          {accessLevel.name}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-center'>
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full mx-auto flex items-center justify-center',
                            perm.can_view ? 'bg-green-100' : 'bg-gray-100'
                          )}
                        >
                          {perm.can_view ? (
                            <CheckCircle className='h-4 w-4 text-green-600' />
                          ) : (
                            <div className='w-2 h-2 bg-gray-400 rounded-full' />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-center'>
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full mx-auto flex items-center justify-center',
                            perm.can_create ? 'bg-green-100' : 'bg-gray-100'
                          )}
                        >
                          {perm.can_create ? (
                            <CheckCircle className='h-4 w-4 text-green-600' />
                          ) : (
                            <div className='w-2 h-2 bg-gray-400 rounded-full' />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-center'>
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full mx-auto flex items-center justify-center',
                            perm.can_edit ? 'bg-green-100' : 'bg-gray-100'
                          )}
                        >
                          {perm.can_edit ? (
                            <CheckCircle className='h-4 w-4 text-green-600' />
                          ) : (
                            <div className='w-2 h-2 bg-gray-400 rounded-full' />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-center'>
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full mx-auto flex items-center justify-center',
                            perm.can_delete ? 'bg-green-100' : 'bg-gray-100'
                          )}
                        >
                          {perm.can_delete ? (
                            <CheckCircle className='h-4 w-4 text-green-600' />
                          ) : (
                            <div className='w-2 h-2 bg-gray-400 rounded-full' />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-center'>
                        <div
                          className={cn(
                            'w-6 h-6 rounded-full mx-auto flex items-center justify-center',
                            perm.can_approve ? 'bg-green-100' : 'bg-gray-100'
                          )}
                        >
                          {perm.can_approve ? (
                            <CheckCircle className='h-4 w-4 text-green-600' />
                          ) : (
                            <div className='w-2 h-2 bg-gray-400 rounded-full' />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Permission Summary */}
      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Current Access Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            <div className='text-center p-4 bg-green-50 rounded-lg'>
              <div className='text-2xl font-bold text-green-600'>
                {permissions.filter((p) => p.can_create).length}
              </div>
              <div className='text-sm text-green-600'>Can Create</div>
            </div>
            <div className='text-center p-4 bg-blue-50 rounded-lg'>
              <div className='text-2xl font-bold text-blue-600'>
                {permissions.filter((p) => p.can_approve).length}
              </div>
              <div className='text-sm text-blue-600'>Can Approve</div>
            </div>
            <div className='text-center p-4 bg-orange-50 rounded-lg'>
              <div className='text-2xl font-bold text-orange-600'>
                {permissions.filter((p) => p.can_view).length}
              </div>
              <div className='text-sm text-orange-600'>Can View</div>
            </div>
            <div className='text-center p-4 bg-gray-50 rounded-lg'>
              <div className='text-2xl font-bold text-gray-600'>
                {permissions.filter((p) => !p.can_view && !p.can_create).length}
              </div>
              <div className='text-sm text-gray-600'>No Access</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
