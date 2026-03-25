'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { BeatLoader } from 'react-spinners';
import toast from 'react-hot-toast';
import {
  UserInstitutionAccessService,
  AccessibleInstitution
} from '@/lib/services/users/user-institution-access-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { UserService } from '@/lib/services/users/user-service';
import {
  Building2,
  Plus,
  Trash2,
  Users,
  Shield,
  AlertCircle,
  CheckCircle,
  Search
} from 'lucide-react';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';

interface Institution {
  id: string;
  name: string;
  counselling_code: string;
}

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  institution_id: string | null;
}

interface UserInstitutionRecord {
  id: string;
  user_id: string;
  institution_id: string;
  access_type: 'full' | 'read_only' | 'billing_only';
  granted_by?: string;
  granted_at: string;
  is_active: boolean;
  institution?: { id: string; name: string; counselling_code: string };
  user?: { id: string; full_name: string; email: string };
  granted_by_user?: { id: string; full_name: string; email: string };
}

// Enhanced User interface for the data table
interface UserWithAccess extends User {
  primaryInstitution?: Institution;
  accessRecords: UserInstitutionRecord[];
  additionalAccessCount: number;
}

export function UserInstitutionAccessManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [accessRecords, setAccessRecords] = useState<UserInstitutionRecord[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [isGrantingAccess, setIsGrantingAccess] = useState(false);

  // Grant access dialog state
  const [grantAccessOpen, setGrantAccessOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>(
    []
  );
  const [selectedAccessType, setSelectedAccessType] = useState<
    'full' | 'read_only' | 'billing_only'
  >('billing_only');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, institutionsData, accessData] = await Promise.all([
        UserService.getUsers({ page: 1, limit: 1000 }),
        OrganizationService.getInstitutionNames(true),
        UserInstitutionAccessService.getUserInstitutionAccessRecords()
      ]);

      setUsers(usersData.data.filter((user) => user.role !== 'super_admin'));
      setInstitutions(institutionsData as Institution[]);
      setAccessRecords(accessData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAccess = async () => {
    if (selectedUsers.length === 0 || selectedInstitutions.length === 0) {
      toast.error('Please select at least one user and one institution');
      return;
    }

    try {
      setIsGrantingAccess(true);

      const result =
        await UserInstitutionAccessService.bulkGrantInstitutionAccess(
          selectedUsers,
          selectedInstitutions,
          selectedAccessType
        );

      if (result.success.length > 0) {
        toast.success(
          `Successfully granted access to ${result.success.length} user-institution pairs`
        );
      }

      if (result.failed.length > 0) {
        toast.error(
          `Failed to grant access to ${result.failed.length} user-institution pairs`
        );
      }

      // Reset form and reload data
      setSelectedUsers([]);
      setSelectedInstitutions([]);
      setSelectedAccessType('billing_only');
      setGrantAccessOpen(false);
      await loadData();
    } catch (error) {
      console.error('Error granting access:', error);
      toast.error('Failed to grant institution access');
    } finally {
      setIsGrantingAccess(false);
    }
  };

  const handleRevokeAccess = async (userId: string, institutionId: string) => {
    try {
      await UserInstitutionAccessService.revokeInstitutionAccess(
        userId,
        institutionId
      );
      toast.success('Access revoked successfully');
      await loadData();
    } catch (error) {
      console.error('Error revoking access:', error);
      toast.error('Failed to revoke access');
    }
  };

  const handleBulkRevokeAccess = async (records: UserInstitutionRecord[]) => {
    if (records.length === 0) return;

    try {
      const promises = records.map((record) =>
        UserInstitutionAccessService.revokeInstitutionAccess(
          record.user_id,
          record.institution_id
        )
      );

      await Promise.all(promises);
      toast.success(
        `Successfully revoked access for ${records.length} records`
      );
      await loadData();
    } catch (error) {
      console.error('Error bulk revoking access:', error);
      toast.error('Failed to revoke access for some records');
    }
  };

  const getAccessTypeBadge = (accessType: string) => {
    const variants = {
      full: 'default',
      read_only: 'secondary',
      billing_only: 'outline',
      inherited: 'destructive'
    } as const;

    const labels = {
      full: 'Full Access',
      read_only: 'Read Only',
      billing_only: 'Billing Only',
      inherited: 'Inherited'
    };

    return (
      <Badge
        variant={variants[accessType as keyof typeof variants] || 'secondary'}
      >
        {labels[accessType as keyof typeof labels] || accessType}
      </Badge>
    );
  };

  // Prepare users data with enhanced information for the data table
  const usersWithAccess = useMemo((): UserWithAccess[] => {
    return users.map((user) => {
      const userAccessRecords = accessRecords.filter(
        (r) => r.user_id === user.id && r.is_active
      );
      const primaryInstitution = institutions.find(
        (i) => i.id === user.institution_id
      );

      return {
        ...user,
        primaryInstitution,
        accessRecords: userAccessRecords,
        additionalAccessCount: userAccessRecords.length
      };
    });
  }, [users, accessRecords, institutions]);

  // Filter users based on search and role
  const filteredUsers = useMemo(() => {
    return usersWithAccess.filter((user) => {
      const matchesSearch =
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = selectedRole === 'all' || user.role === selectedRole;
      return matchesSearch && matchesRole;
    });
  }, [usersWithAccess, searchTerm, selectedRole]);

  // Filter access records
  const filteredAccessRecords = useMemo(() => {
    return accessRecords.filter((record) => {
      if (!record.user) return false;
      const matchesSearch =
        record.user.full_name
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        record.user.email.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [accessRecords, searchTerm]);

  // Column definitions for Users Management table
  const usersColumns: PermissionColumnDef<UserWithAccess, any>[] = [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div>
            <div className='font-medium'>{user.full_name || 'No Name'}</div>
            <div className='text-sm text-muted-foreground'>{user.email}</div>
          </div>
        );
      }
    },
    {
      id: 'role',
      header: 'Role',
      cell: ({ row }) => <Badge variant='outline'>{row.original.role}</Badge>
    },
    {
      id: 'primaryInstitution',
      header: 'Primary Institution',
      cell: ({ row }) => {
        const { primaryInstitution } = row.original;
        return primaryInstitution ? (
          <div>
            <div className='font-medium'>{primaryInstitution.name}</div>
            <div className='text-sm text-muted-foreground'>
              ({primaryInstitution.counselling_code})
            </div>
          </div>
        ) : (
          <span className='text-muted-foreground'>All Institutions</span>
        );
      }
    },
    {
      id: 'additionalAccess',
      header: 'Additional Access',
      cell: ({ row }) => {
        const { accessRecords } = row.original;
        return accessRecords.length > 0 ? (
          <div className='space-y-1'>
            {accessRecords.map((record) => (
              <div key={record.id} className='flex items-center gap-2'>
                <span className='text-sm'>{record.institution?.name}</span>
                {getAccessTypeBadge(record.access_type)}
              </div>
            ))}
          </div>
        ) : (
          <span className='text-muted-foreground text-sm'>
            No additional access
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const { accessRecords } = row.original;
        return accessRecords.length > 0 ? (
          <div className='space-y-1'>
            {accessRecords.map((record) => (
              <Button
                key={record.id}
                variant='outline'
                size='sm'
                onClick={() =>
                  handleRevokeAccess(row.original.id, record.institution_id)
                }
              >
                <Trash2 className='h-3 w-3 mr-1' />
                Revoke
              </Button>
            ))}
          </div>
        ) : null;
      },
      enableSorting: false
    }
  ];

  // Column definitions for Access Records table
  const accessRecordsColumns: PermissionColumnDef<
    UserInstitutionRecord,
    any
  >[] = [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div>
            <div className='font-medium'>{record.user?.full_name}</div>
            <div className='text-sm text-muted-foreground'>
              {record.user?.email}
            </div>
          </div>
        );
      }
    },
    {
      id: 'institution',
      header: 'Institution',
      cell: ({ row }) => {
        const record = row.original;
        return (
          <div>
            <div className='font-medium'>{record.institution?.name}</div>
            <div className='text-sm text-muted-foreground'>
              ({record.institution?.counselling_code})
            </div>
          </div>
        );
      }
    },
    {
      id: 'access_type',
      header: 'Access Type',
      cell: ({ row }) => getAccessTypeBadge(row.original.access_type)
    },
    {
      id: 'granted_by',
      header: 'Granted By',
      cell: ({ row }) => {
        const record = row.original;
        return record.granted_by_user ? (
          <div>
            <div className='font-medium'>
              {record.granted_by_user.full_name}
            </div>
            <div className='text-sm text-muted-foreground'>
              {record.granted_by_user.email}
            </div>
          </div>
        ) : (
          <span className='text-muted-foreground'>System</span>
        );
      }
    },
    {
      id: 'granted_at',
      header: 'Granted At',
      cell: ({ row }) => {
        return new Date(row.original.granted_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      )
    }
  ];

  // Calculate statistics
  const totalUsers = users.length;
  const usersWithAccessCount = new Set(accessRecords.map((r) => r.user_id))
    .size;
  const totalAccessRecords = accessRecords.filter((r) => r.is_active).length;
  const accountsUsers = users.filter((u) => u.role === 'accounts').length;

  if (loading) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Summary Statistics */}
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Users with Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{usersWithAccessCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Active Access Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{totalAccessRecords}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Accounts Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{accountsUsers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue='users' className='space-y-4'>
        <TabsList>
          <TabsTrigger value='users'>User Management</TabsTrigger>
          <TabsTrigger value='access'>Access Records</TabsTrigger>
        </TabsList>

        <TabsContent value='users' className='space-y-4'>
          <Card>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <CardTitle className='flex items-center gap-2'>
                  <Users className='h-5 w-5' />
                  User Institution Access Management
                </CardTitle>
                <Dialog
                  open={grantAccessOpen}
                  onOpenChange={setGrantAccessOpen}
                >
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className='h-4 w-4 mr-2' />
                      Grant Access
                    </Button>
                  </DialogTrigger>
                  <DialogContent className='max-w-4xl'>
                    <DialogHeader>
                      <DialogTitle>Grant Institution Access</DialogTitle>
                      <DialogDescription>
                        Select users and institutions to grant access to. This
                        allows accounts users to manage billing for specific
                        institutions.
                      </DialogDescription>
                    </DialogHeader>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      {/* Users Selection */}
                      <div>
                        <Label className='text-sm font-medium'>
                          Select Users
                        </Label>
                        <div className='mt-2 border rounded-md p-3 max-h-64 overflow-y-auto'>
                          {users
                            .filter((u) => u.role === 'accounts')
                            .map((user) => (
                              <div
                                key={user.id}
                                className='flex items-center space-x-2 py-1'
                              >
                                <Checkbox
                                  id={`user-${user.id}`}
                                  checked={selectedUsers.includes(user.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedUsers([
                                        ...selectedUsers,
                                        user.id
                                      ]);
                                    } else {
                                      setSelectedUsers(
                                        selectedUsers.filter(
                                          (id) => id !== user.id
                                        )
                                      );
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`user-${user.id}`}
                                  className='text-sm'
                                >
                                  {user.full_name || 'No Name'} ({user.email})
                                </label>
                              </div>
                            ))}
                        </div>
                        <p className='text-xs text-muted-foreground mt-1'>
                          Selected: {selectedUsers.length} accounts users
                        </p>
                      </div>

                      {/* Institutions Selection */}
                      <div>
                        <Label className='text-sm font-medium'>
                          Select Institutions
                        </Label>
                        <div className='mt-2 border rounded-md p-3 max-h-64 overflow-y-auto'>
                          {institutions.map((institution) => (
                            <div
                              key={institution.id}
                              className='flex items-center space-x-2 py-1'
                            >
                              <Checkbox
                                id={`inst-${institution.id}`}
                                checked={selectedInstitutions.includes(
                                  institution.id
                                )}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedInstitutions([
                                      ...selectedInstitutions,
                                      institution.id
                                    ]);
                                  } else {
                                    setSelectedInstitutions(
                                      selectedInstitutions.filter(
                                        (id) => id !== institution.id
                                      )
                                    );
                                  }
                                }}
                              />
                              <label
                                htmlFor={`inst-${institution.id}`}
                                className='text-sm'
                              >
                                {institution.name} (
                                {institution.counselling_code})
                              </label>
                            </div>
                          ))}
                        </div>
                        <p className='text-xs text-muted-foreground mt-1'>
                          Selected: {selectedInstitutions.length} institutions
                        </p>
                      </div>
                    </div>

                    {/* Access Type Selection */}
                    <div>
                      <Label className='text-sm font-medium'>Access Type</Label>
                      <Select
                        value={selectedAccessType}
                        onValueChange={(value: any) =>
                          setSelectedAccessType(value)
                        }
                      >
                        <SelectTrigger className='mt-2'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='billing_only'>
                            Billing Only - Can manage billing for institution
                          </SelectItem>
                          <SelectItem value='read_only'>
                            Read Only - Can view but not modify
                          </SelectItem>
                          <SelectItem value='full'>
                            Full Access - Complete institution access
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <DialogFooter>
                      <Button
                        variant='outline'
                        onClick={() => setGrantAccessOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleGrantAccess}
                        disabled={isGrantingAccess}
                      >
                        {isGrantingAccess ? 'Granting...' : 'Grant Access'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className='flex gap-4 mb-6'>
                <div className='flex-1'>
                  <Label htmlFor='search' className='sr-only'>
                    Search
                  </Label>
                  <div className='relative'>
                    <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
                    <Input
                      id='search'
                      placeholder='Search users...'
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className='pl-10'
                    />
                  </div>
                </div>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className='w-48'>
                    <SelectValue placeholder='Filter by role' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Roles</SelectItem>
                    <SelectItem value='accounts'>Accounts</SelectItem>
                    <SelectItem value='administrator'>Administrator</SelectItem>
                    <SelectItem value='faculty'>Faculty</SelectItem>
                    <SelectItem value='staff'>Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Users Data Table */}
              <DataTable
                columns={usersColumns}
                data={filteredUsers}
                searchPlaceholder='Search users by name or email...'
                filterColumn='user'
                permissions={{
                  module: 'users',
                  actions: {
                    view: true,
                    create: true,
                    edit: true,
                    delete: false
                  }
                }}
                onRefresh={loadData}
                getRowId={(row) => row.id}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='access' className='space-y-4'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Shield className='h-5 w-5' />
                Access Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Search for Access Records */}
              <div className='mb-6'>
                <div className='relative'>
                  <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
                  <Input
                    placeholder='Search access records...'
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className='pl-10 max-w-sm'
                  />
                </div>
              </div>

              {/* Access Records Data Table */}
              <DataTable
                columns={accessRecordsColumns}
                data={filteredAccessRecords}
                searchPlaceholder='Search access records...'
                filterColumn='user'
                permissions={{
                  module: 'users',
                  actions: {
                    view: true,
                    create: false,
                    edit: false,
                    delete: true
                  }
                }}
                onDeleteSelected={handleBulkRevokeAccess}
                onRefresh={loadData}
                getRowId={(row) => row.id}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
