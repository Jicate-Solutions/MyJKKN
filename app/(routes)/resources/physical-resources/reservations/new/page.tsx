'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReservationService } from '@/lib/services/resource/physical/reservation-service';
import { ResourceService } from '@/lib/services/resource/physical/resource-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import type { Resource } from '@/types/resources';
import type { Institution } from '@/types/organizations';
import type { Department } from '@/types/organizations';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Extend the user type to include the optional properties we need
interface ExtendedUser {
  id: string;
  institution_id?: string;
  department_id?: string;
  [key: string]: any;
}

export default function NewReservationPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const userExtended = user as ExtendedUser | null;

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filteredDepartments, setFilteredDepartments] = useState<Department[]>(
    []
  );

  // Add debug information for authentication status
  useEffect(() => {
    console.log('Auth state:', { user, userExtended, authLoading });
  }, [user, userExtended, authLoading]);

  // Form state
  const [formData, setFormData] = useState({
    resource_id: '',
    title: '',
    description: '',
    start_date: new Date(),
    start_time: '09:00',
    end_date: new Date(),
    end_time: '10:00',
    purpose: '',
    requester_institution_id: '',
    requester_department_id: '',
    notes: ''
  });

  // Load resources, institutions, and departments
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch resources
        const resourcesResponse = await ResourceService.getResources({
          is_shareable: true,
          isActive: true,
          limit: 100
        });
        setResources(resourcesResponse.data);

        // Fetch institutions
        const institutionsResponse =
          await OrganizationService.getInstitutions();
        setInstitutions(institutionsResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load required data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch departments when institution changes
  useEffect(() => {
    if (formData.requester_institution_id) {
      // Fetch departments specifically for this institution
      const fetchDepartmentsForInstitution = async () => {
        try {
          const institutionDepartments =
            await DepartmentService.getDepartmentsByInstitution(
              formData.requester_institution_id
            );
          setFilteredDepartments(institutionDepartments);
        } catch (error) {
          console.error('Error fetching departments for institution:', error);
          toast.error('Failed to load departments for this institution');
          setFilteredDepartments([]);
        }
      };

      fetchDepartmentsForInstitution();
    } else {
      setFilteredDepartments([]);
    }
  }, [formData.requester_institution_id]);

  // Handle department selection reset when institution changes
  useEffect(() => {
    // Reset department selection if current selection doesn't belong to the selected institution
    if (
      formData.requester_department_id &&
      filteredDepartments.length > 0 &&
      !filteredDepartments.some(
        (dept) => dept.id === formData.requester_department_id
      )
    ) {
      setFormData((prev) => ({ ...prev, requester_department_id: '' }));
    }
  }, [formData.requester_department_id, filteredDepartments]);

  // Set user's institution and department if available
  useEffect(() => {
    // Make sure we have a valid user before trying to set institution/department
    if (!userExtended || !userExtended.id) {
      console.log('No valid user found for institution/department setting');
      return;
    }

    console.log('Setting user institution/department:', userExtended);

    if (userExtended.institution_id) {
      // Set institution ID
      setFormData((prev) => ({
        ...prev,
        requester_institution_id: userExtended.institution_id || ''
      }));

      // If user has a department ID, set it after institution is set
      if (userExtended.department_id) {
        // Small delay to ensure the institution's departments are loaded first
        setTimeout(() => {
          setFormData((prev) => ({
            ...prev,
            requester_department_id: userExtended.department_id || ''
          }));
        }, 100);
      }
    }
  }, [userExtended]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (name: string, date: Date | undefined) => {
    if (date) {
      setFormData((prev) => ({ ...prev, [name]: date }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Get fresh user data from supabase in case it wasn't loaded properly
    // through the hook
    const supabase = createClientSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      toast.error('Your session has expired. Please log in again.');
      router.push('/auth/login');
      return;
    }

    const userId = sessionData.session.user?.id;

    if (!userId) {
      toast.error('You must be logged in to create a reservation');
      return;
    }

    if (!formData.resource_id) {
      toast.error('Please select a resource');
      return;
    }

    if (!formData.requester_institution_id) {
      toast.error('Please select your institution');
      return;
    }

    setSubmitting(true);

    try {
      // Combine date and time
      const startDateTime = new Date(formData.start_date);
      const [startHours, startMinutes] = formData.start_time
        .split(':')
        .map(Number);
      startDateTime.setHours(startHours, startMinutes);

      const endDateTime = new Date(formData.end_date);
      const [endHours, endMinutes] = formData.end_time.split(':').map(Number);
      endDateTime.setHours(endHours, endMinutes);

      // Validate dates
      if (endDateTime <= startDateTime) {
        toast.error('End time must be after start time');
        setSubmitting(false);
        return;
      }

      // Create reservation
      await ReservationService.createReservation({
        resource_id: formData.resource_id,
        user_id: userId, // Use the user ID from the session
        title: formData.title,
        description: formData.description,
        start_datetime: startDateTime.toISOString(),
        end_datetime: endDateTime.toISOString(),
        purpose: formData.purpose,
        requester_institution_id: formData.requester_institution_id,
        requester_department_id: formData.requester_department_id || undefined,
        notes: formData.notes
      });

      toast.success('Reservation created successfully');
      router.push('/resources/physical-resources/reservations');
    } catch (error) {
      console.error('Error creating reservation:', error);
      toast.error('Failed to create reservation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ContentLayout title='New Reservation'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/physical-resources/dashboard'>
                Resource Management
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/physical-resources/reservations'>
                Reservations
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Reservation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6'>
        <h1 className='text-2xl font-bold'>Create New Reservation</h1>
      </div>

      {loading ? (
        <div className='flex justify-center items-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      ) : (
        <Card className='mt-6'>
          <CardHeader>
            <CardTitle>Reservation Details</CardTitle>
            <CardDescription>
              Fill in the details to request a resource reservation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-6'>
              <div className='space-y-4'>
                <div>
                  <Label htmlFor='resource_id'>Resource</Label>
                  <Select
                    value={formData.resource_id}
                    onValueChange={(value) =>
                      handleSelectChange('resource_id', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select a resource' />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          {resource.resource_name} ({resource.resource_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor='title'>Title</Label>
                  <Input
                    id='title'
                    name='title'
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder='Enter a title for your reservation'
                    required
                  />
                </div>

                <div>
                  <Label htmlFor='description'>Description</Label>
                  <Textarea
                    id='description'
                    name='description'
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder='Describe the purpose of your reservation'
                    rows={3}
                  />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant='outline'
                          className='w-full justify-start text-left font-normal'
                        >
                          <CalendarIcon className='mr-2 h-4 w-4' />
                          {formData.start_date ? (
                            format(formData.start_date, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0'>
                        <Calendar
                          mode='single'
                          selected={formData.start_date}
                          onSelect={(date) =>
                            handleDateChange('start_date', date)
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label htmlFor='start_time'>Start Time</Label>
                    <Input
                      id='start_time'
                      name='start_time'
                      type='time'
                      value={formData.start_time}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant='outline'
                          className='w-full justify-start text-left font-normal'
                        >
                          <CalendarIcon className='mr-2 h-4 w-4' />
                          {formData.end_date ? (
                            format(formData.end_date, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0'>
                        <Calendar
                          mode='single'
                          selected={formData.end_date}
                          onSelect={(date) =>
                            handleDateChange('end_date', date)
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label htmlFor='end_time'>End Time</Label>
                    <Input
                      id='end_time'
                      name='end_time'
                      type='time'
                      value={formData.end_time}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor='purpose'>Purpose</Label>
                  <Input
                    id='purpose'
                    name='purpose'
                    value={formData.purpose}
                    onChange={handleInputChange}
                    placeholder='Why do you need this resource?'
                  />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label htmlFor='requester_institution_id'>
                      Institution
                    </Label>
                    <Select
                      value={formData.requester_institution_id}
                      onValueChange={(value) =>
                        handleSelectChange('requester_institution_id', value)
                      }
                      disabled={!!userExtended?.institution_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Select your institution' />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((institution) => (
                          <SelectItem
                            key={institution.id}
                            value={institution.id}
                          >
                            {institution.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor='requester_department_id'>Department</Label>
                    <Select
                      value={formData.requester_department_id}
                      onValueChange={(value) =>
                        handleSelectChange('requester_department_id', value)
                      }
                      disabled={
                        !formData.requester_institution_id ||
                        !!userExtended?.department_id
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Select your department' />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredDepartments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.department_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor='notes'>Additional Notes</Label>
                  <Textarea
                    id='notes'
                    name='notes'
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder='Any additional information'
                    rows={3}
                  />
                </div>
              </div>

              <div className='flex justify-end space-x-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() =>
                    router.push('/resources/physical-resources/reservations')
                  }
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type='submit' disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Creating...
                    </>
                  ) : (
                    'Create Reservation'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </ContentLayout>
  );
}
