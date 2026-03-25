'use client';

import { useState, useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import { Separator } from '@/components/ui/separator';
import {
  GraduationCap,
  Shield,
  Eye,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  Users,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScholarshipPermissions {
  role_name: string;
  role_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  user_count?: number;
}

interface PermissionTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions: {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_approve: boolean;
  };
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    id: 'full_access',
    name: 'Full Manager',
    description: 'Complete scholarship management access',
    icon: Shield,
    permissions: {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
      can_approve: true
    },
    variant: 'default'
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'Can create and edit scholarships (needs approval)',
    icon: Plus,
    permissions: {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      can_approve: false
    },
    variant: 'secondary'
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Can review and approve scholarships',
    icon: CheckCircle,
    permissions: {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_approve: true
    },
    variant: 'outline'
  },
  {
    id: 'readonly',
    name: 'Read Only',
    description: 'View-only access to scholarships',
    icon: Eye,
    permissions: {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_approve: false
    },
    variant: 'outline'
  },
  {
    id: 'no_access',
    name: 'No Access',
    description: 'Remove all scholarship permissions',
    icon: AlertTriangle,
    permissions: {
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_approve: false
    },
    variant: 'destructive'
  }
];

export function ScholarshipPermissionManager() {
  const [permissions, setPermissions] = useState<ScholarshipPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      setLoading(true);

      // This would be replaced with actual API call
      // For now, simulating the current state
      const mockData: ScholarshipPermissions[] = [
        {
          role_name: 'Accounts',
          role_key: 'accounts',
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: true,
          can_approve: true,
          user_count: 7
        },
        {
          role_name: 'Administrator',
          role_key: 'administrator',
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: true,
          can_approve: true,
          user_count: 5
        },
        {
          role_name: 'Faculty',
          role_key: 'faculty',
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: false,
          can_approve: false,
          user_count: 190
        },
        {
          role_name: 'Staff',
          role_key: 'staff',
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: false,
          can_approve: false,
          user_count: 0
        },
        {
          role_name: 'Student',
          role_key: 'student',
          can_view: true,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_approve: false,
          user_count: 194
        },
        {
          role_name: 'Guest',
          role_key: 'guest',
          can_view: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_approve: false,
          user_count: 5
        }
      ];

      setPermissions(mockData);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      toast.error('Failed to load scholarship permissions');
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = async () => {
    if (!selectedRole || !selectedTemplate) {
      toast.error('Please select both a role and permission template');
      return;
    }

    const template = PERMISSION_TEMPLATES.find(
      (t) => t.id === selectedTemplate
    );
    if (!template) return;

    try {
      setUpdating(selectedRole);

      // This would be replaced with actual API call to update permissions
      // For demo purposes, updating local state
      setPermissions((prev) =>
        prev.map((perm) =>
          perm.role_key === selectedRole
            ? { ...perm, ...template.permissions }
            : perm
        )
      );

      toast.success(
        `Applied "${template.name}" permissions to ${selectedRole} role`
      );

      setSelectedRole('');
      setSelectedTemplate('');
    } catch (error) {
      console.error('Error updating permissions:', error);
      toast.error('Failed to update permissions');
    } finally {
      setUpdating(null);
    }
  };

  const togglePermission = async (
    roleKey: string,
    permission: keyof Omit<
      ScholarshipPermissions,
      'role_name' | 'role_key' | 'user_count'
    >
  ) => {
    try {
      setUpdating(roleKey);

      setPermissions((prev) =>
        prev.map((perm) =>
          perm.role_key === roleKey
            ? { ...perm, [permission]: !perm[permission] }
            : perm
        )
      );

      toast.success('Permission updated successfully');
    } catch (error) {
      console.error('Error toggling permission:', error);
      toast.error('Failed to update permission');
    } finally {
      setUpdating(null);
    }
  };

  const getAccessLevel = (perm: ScholarshipPermissions): PermissionTemplate => {
    for (const template of PERMISSION_TEMPLATES) {
      const matches = Object.entries(template.permissions).every(
        ([key, value]) => perm[key as keyof typeof perm] === value
      );
      if (matches) return template;
    }

    // Custom permissions
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

  if (loading) {
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
                  {PERMISSION_TEMPLATES.map((template) => (
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
                  !selectedRole || !selectedTemplate || updating !== null
                }
                className='w-full'
              >
                {updating ? 'Applying...' : 'Apply Template'}
              </Button>
            </div>
          </div>

          {/* Template Preview */}
          {selectedTemplate && (
            <div className='mt-4 p-4 bg-muted/50 rounded-lg'>
              {(() => {
                const template = PERMISSION_TEMPLATES.find(
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
            Fine-grained control over scholarship permissions
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
                  const isUpdating = updating === perm.role_key;

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
                        <Switch
                          checked={perm.can_view}
                          onCheckedChange={() =>
                            togglePermission(perm.role_key, 'can_view')
                          }
                          disabled={isUpdating}
                        />
                      </TableCell>
                      <TableCell className='text-center'>
                        <Switch
                          checked={perm.can_create}
                          onCheckedChange={() =>
                            togglePermission(perm.role_key, 'can_create')
                          }
                          disabled={isUpdating}
                        />
                      </TableCell>
                      <TableCell className='text-center'>
                        <Switch
                          checked={perm.can_edit}
                          onCheckedChange={() =>
                            togglePermission(perm.role_key, 'can_edit')
                          }
                          disabled={isUpdating}
                        />
                      </TableCell>
                      <TableCell className='text-center'>
                        <Switch
                          checked={perm.can_delete}
                          onCheckedChange={() =>
                            togglePermission(perm.role_key, 'can_delete')
                          }
                          disabled={isUpdating}
                        />
                      </TableCell>
                      <TableCell className='text-center'>
                        <Switch
                          checked={perm.can_approve}
                          onCheckedChange={() =>
                            togglePermission(perm.role_key, 'can_approve')
                          }
                          disabled={isUpdating}
                        />
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
