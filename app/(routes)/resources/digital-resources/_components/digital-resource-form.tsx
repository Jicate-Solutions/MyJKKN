// app/(routes)/digital-resources/_components/digital-resource-form.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription 
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, X } from 'lucide-react';
import { 
  DigitalResource, 
  DigitalResourceType, 
  AccessMethod,
  OwnerType,
  DIGITAL_RESOURCE_TYPES,
  ACCESS_METHODS,
  OWNER_TYPES
} from '@/types/digital-resources';
import { useDigitalResourceCategories } from '@/hooks/resource/digital/use-digital-resource-categories';

// Define the form schema using zod
const formSchema = z.object({
  digital_resource_name: z.string().min(1, 'Resource name is required'),
  type: z.string().min(1, 'Resource type is required'),
  category_id: z.string().min(1, 'Category is required'),
  access_method: z.string().min(1, 'Access method is required'),
  license_information: z.object({
    allowed_users: z.number().optional(),
    expiration_date: z.string().optional(),
    usage_constraints: z.array(z.string()).optional(),
  }).optional(),
  institution_id: z.string().min(1, 'Institution is required'),
  department_id: z.string().optional(),
  owner_type: z.string().min(1, 'Owner type is required'),
  owner_id: z.string().min(1, 'Owner ID is required'),
  access_availability: z.object({
    time_restrictions: z.array(z.string()).optional(),
    concurrency_limits: z.number().optional(),
  }).optional(),
  sharing_restrictions: z.array(z.string()).optional(),
  maintenance_schedule: z.object({
    last_update: z.string().optional(),
    next_scheduled_update: z.string().optional(),
  }).optional(),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface DigitalResourceFormProps {
  initialData?: DigitalResource;
  onSubmit: (data: FormValues) => Promise<void>;
  onCancel: () => void;
}

export function DigitalResourceForm({ 
  initialData, 
  onSubmit, 
  onCancel 
}: DigitalResourceFormProps) {
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeRestriction, setTimeRestriction] = useState('');
  const [usageConstraint, setUsageConstraint] = useState('');
  const [sharingRestriction, setSharingRestriction] = useState('');
  const [institutionsError, setInstitutionsError] = useState<string | null>(null);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [formInitialized, setFormInitialized] = useState(false);

  const { categories, loading: categoriesLoading, error: categoriesError, fetchCategories } = useDigitalResourceCategories({
    isActive: true,
    limit: 100
  });

  // Refresh categories when component is focused
  useEffect(() => {
    // Initial fetch
    fetchCategories();

    // Set up event listener for when the window regains focus
    const handleFocus = () => {
      fetchCategories();
    };

    window.addEventListener('focus', handleFocus);

    // Clean up
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchCategories]);

  const supabase = createClientComponentClient();

  // Transform initialData to match form schema if it exists
  const getDefaultValues: () => FormValues = () => {
    if (!initialData) {
      return {
        digital_resource_name: '',
        type: '',
        category_id: '',
        access_method: '',
        license_information: {
          allowed_users: 1,
          expiration_date: '',
          usage_constraints: [],
        },
        institution_id: '',
        department_id: '',
        owner_type: 'institution',
        owner_id: '',
        access_availability: {
          time_restrictions: [],
          concurrency_limits: 1,
        },
        sharing_restrictions: [],
        maintenance_schedule: {
          last_update: '',
          next_scheduled_update: '',
        },
        is_active: true,
      };
    }

    // Transform the initialData to match the form schema
    return {
      digital_resource_name: initialData.digital_resource_name,
      type: initialData.type,
      category_id: initialData.category_id,
      access_method: initialData.access_method,
      license_information: {
        allowed_users: initialData.license_information?.allowed_users || 1,
        expiration_date: initialData.license_information?.expiration_date || '',
        usage_constraints: initialData.license_information?.usage_constraints || [],
      },
      institution_id: initialData.institution_id,
      department_id: initialData.department_id || '',
      owner_type: initialData.owner_type,
      owner_id: initialData.owner_id,
      access_availability: {
        time_restrictions: initialData.access_availability?.time_restrictions || [],
        concurrency_limits: initialData.access_availability?.concurrency_limits || 1,
      },
      sharing_restrictions: initialData.sharing_restrictions || [],
      maintenance_schedule: {
        last_update: initialData.maintenance_schedule?.last_update || '',
        next_scheduled_update: initialData.maintenance_schedule?.next_scheduled_update || '',
      },
      is_active: initialData.is_active,
    };
  };

  // Initialize form with default values or initial data
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  });

  // Fetch institutions
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name')
          .order('name');

        if (error) throw error;
        setInstitutions(data || []);
      } catch (error) {
        console.error('Error fetching institutions:', error);
        setInstitutionsError((error as any)?.message || 'Failed to load institutions');
        // Don't show toast for expected errors when tables don't exist yet
        if (!(error as any)?.message?.includes('does not exist')) {
          toast.error('Failed to load institutions');
        }
      } finally {
        setFormInitialized(true);
      }
    };

    fetchInstitutions();
  }, [supabase]);

  // Fetch departments when institution changes
  const selectedInstitutionId = form.watch('institution_id');
  useEffect(() => {
    if (!selectedInstitutionId) {
      setDepartments([]);
      return;
    }

    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('id, department_name')
          .eq('institution_id', selectedInstitutionId)
          .order('department_name');

        if (error) throw error;
        setDepartments(data || []);
      } catch (error) {
        console.error('Error fetching departments:', error);
        setDepartmentsError((error as any)?.message || 'Failed to load departments');
        // Don't show toast for expected errors when tables don't exist yet
        if (!(error as any)?.message?.includes('does not exist')) {
          toast.error('Failed to load departments');
        }
      }
    };

    fetchDepartments();
  }, [selectedInstitutionId, supabase]);

  // Fetch users for owner selection
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, full_name')
          .order('full_name');

        if (error) throw error;
        setUsers(data || []);
      } catch (error) {
        console.error('Error fetching users:', error);
        setUsersError((error as any)?.message || 'Failed to load users');
        // Don't show toast for expected errors when tables don't exist yet
        if (!(error as any)?.message?.includes('does not exist')) {
          toast.error('Failed to load users');
        }
      }
    };

    fetchUsers();
  }, [supabase]);

  const handleSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('Failed to save digital resource');
    } finally {
      setLoading(false);
    }
  };

  // Handler functions for array fields
  const addUsageConstraint = () => {
    if (!usageConstraint.trim()) return;
    
    const currentConstraints = form.getValues('license_information.usage_constraints') || [];
    form.setValue('license_information.usage_constraints', [...currentConstraints, usageConstraint.trim()]);
    setUsageConstraint('');
  };

  const removeUsageConstraint = (index: number) => {
    const currentConstraints = form.getValues('license_information.usage_constraints') || [];
    form.setValue(
      'license_information.usage_constraints',
      currentConstraints.filter((_, i) => i !== index)
    );
  };

  const addTimeRestriction = () => {
    if (!timeRestriction.trim()) return;
    
    const currentRestrictions = form.getValues('access_availability.time_restrictions') || [];
    form.setValue('access_availability.time_restrictions', [...currentRestrictions, timeRestriction.trim()]);
    setTimeRestriction('');
  };

  const removeTimeRestriction = (index: number) => {
    const currentRestrictions = form.getValues('access_availability.time_restrictions') || [];
    form.setValue(
      'access_availability.time_restrictions',
      currentRestrictions.filter((_, i) => i !== index)
    );
  };

  const addSharingRestriction = () => {
    if (!sharingRestriction.trim()) return;
    
    const currentRestrictions = form.getValues('sharing_restrictions') || [];
    form.setValue('sharing_restrictions', [...currentRestrictions, sharingRestriction.trim()]);
    setSharingRestriction('');
  };

  const removeSharingRestriction = (index: number) => {
    const currentRestrictions = form.getValues('sharing_restrictions') || [];
    form.setValue(
      'sharing_restrictions',
      currentRestrictions.filter((_, i) => i !== index)
    );
  };

  if (categoriesLoading && !formInitialized) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show a message if there are database setup issues
  if (categoriesError || institutionsError || departmentsError || usersError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Database Setup Required</CardTitle>
          <CardDescription>
            The digital resources module requires database tables to be created first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p>
              Please run the SQL script in <code>supabase/digital-resources.sql</code> to create the necessary tables.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Error details: {categoriesError || institutionsError || departmentsError || usersError}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Enter the basic information for the digital resource
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="digital_resource_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resource Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter resource name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resource Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select resource type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(DIGITAL_RESOURCE_TYPES).map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories && categories.length > 0 ? (
                          categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.category_name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-categories" disabled>
                            No categories available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {categories && categories.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No categories found. Please create categories first.
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="access_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select access method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(ACCESS_METHODS).map((method) => (
                        <SelectItem key={method} value={method}>
                          {method.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ownership Information</CardTitle>
            <CardDescription>
              Specify the ownership details for this digital resource
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="institution_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select institution" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {institutions && institutions.length > 0 ? (
                        institutions.map((institution) => (
                          <SelectItem key={institution.id} value={institution.id}>
                            {institution.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-institutions" disabled>
                          No institutions available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  {institutions && institutions.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      No institutions found. Please create institutions first.
                    </p>
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="department_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {departments && departments.length > 0 ? (
                        departments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.department_name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-departments" disabled>
                          {selectedInstitutionId 
                            ? "No departments available for this institution" 
                            : "Select an institution first"}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="owner_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(OWNER_TYPES).map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="owner_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users && users.length > 0 ? (
                          users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.full_name || user.email}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-users" disabled>
                            No users available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {users && users.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No users found. Please create users first.
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>License Information</CardTitle>
            <CardDescription>
              Specify the license details for this digital resource
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="license_information.allowed_users"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowed Users</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Number of allowed users" 
                        {...field} 
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum number of users allowed to access this resource
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="license_information.expiration_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiration Date</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        placeholder="License expiration date" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      When the license expires
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormLabel>Usage Constraints</FormLabel>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Add usage constraint"
                  value={usageConstraint}
                  onChange={(e) => setUsageConstraint(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addUsageConstraint();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addUsageConstraint}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {form.watch('license_information.usage_constraints')?.map((constraint, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                    <span>{constraint}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeUsageConstraint(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access Availability</CardTitle>
            <CardDescription>
              Define when and how the resource can be accessed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="access_availability.concurrency_limits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Concurrency Limits</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Maximum concurrent users" 
                      {...field} 
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum number of users who can access the resource simultaneously
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormLabel>Time Restrictions</FormLabel>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Add time restriction (e.g., 'Weekdays 9AM-5PM')"
                  value={timeRestriction}
                  onChange={(e) => setTimeRestriction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTimeRestriction();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addTimeRestriction}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {form.watch('access_availability.time_restrictions')?.map((restriction, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                    <span>{restriction}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTimeRestriction(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sharing Restrictions</CardTitle>
            <CardDescription>
              Define any restrictions on sharing this resource
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Add sharing restriction"
                  value={sharingRestriction}
                  onChange={(e) => setSharingRestriction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSharingRestriction();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addSharingRestriction}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {form.watch('sharing_restrictions')?.map((restriction, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                    <span>{restriction}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSharingRestriction(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance Schedule</CardTitle>
            <CardDescription>
              Define the maintenance schedule for this resource
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="maintenance_schedule.last_update"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Update</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        placeholder="Last update date" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maintenance_schedule.next_scheduled_update"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next Scheduled Update</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        placeholder="Next update date" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>
              Set the active status of this resource
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Active Status
                    </FormLabel>
                    <FormDescription>
                      When active, this resource will be visible to users
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
        <CardFooter className="flex justify-between">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Update Resource' : 'Create Resource'}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}
