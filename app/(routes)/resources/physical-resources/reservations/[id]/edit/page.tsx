'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
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
import { BeatLoader } from 'react-spinners';
import { cn } from '@/lib/utils';
import { ReservationService } from '@/lib/services/resource/physical/reservation-service';
import { ResourceService } from '@/lib/services/resource/physical/resource-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import type { ReservationStatus, Resource } from '@/types/resources';
import type { Institution } from '@/types/organizations';
import type { Department } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';

export default function EditReservationPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const reservationId = unwrappedParams.id;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filteredDepartments, setFilteredDepartments] = useState<Department[]>(
    []
  );
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canEditReservations =
    isSuperAdmin || canAccess('physical_resources.reservations', 'edit');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Edit Reservation permissions debug:', {
        isSuperAdmin,
        canEditReservations: canAccess(
          'physical_resources.reservations',
          'edit'
        )
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

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
    notes: '',
    status: 'pending'
  });

  // Check for permission before loading data
  useEffect(() => {
    // Only proceed if permissions are loaded
    if (!permissionsLoaded) return;

    if (!canEditReservations) {
      console.log('User does not have permission to edit reservations');
      router.push('/unauthorized');
      return;
    }
  }, [permissionsLoaded, canEditReservations, router]);

  // Load reservation, resources, institutions, and departments
  useEffect(() => {
    // Only fetch data if user has permission
    if (!permissionsLoaded || !canEditReservations) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch reservation data
        const reservation = await ReservationService.getReservation(
          reservationId
        );
        if (!reservation) {
          toast.error('Reservation not found');
          router.push('/resources/physical-resources/reservations');
          return;
        }

        // Parse dates from the reservation data
        const startDateTime = new Date(reservation.start_datetime);
        const endDateTime = new Date(reservation.end_datetime);

        // Format times as HH:MM
        const formatTime = (date: Date) => {
          const hours = date.getHours().toString().padStart(2, '0');
          const minutes = date.getMinutes().toString().padStart(2, '0');
          return `${hours}:${minutes}`;
        };

        // Set form data from reservation
        setFormData({
          resource_id: reservation.resource_id,
          title: reservation.title,
          description: reservation.description || '',
          start_date: startDateTime,
          start_time: formatTime(startDateTime),
          end_date: endDateTime,
          end_time: formatTime(endDateTime),
          purpose: reservation.purpose || '',
          requester_institution_id: reservation.requester_institution_id,
          requester_department_id: reservation.requester_department_id || '',
          notes: reservation.notes || '',
          status: reservation.status
        });

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

        // If the reservation has an institution, fetch its departments
        if (reservation.requester_institution_id) {
          const departmentsResponse =
            await DepartmentService.getDepartmentsByInstitution(
              reservation.requester_institution_id
            );
          setFilteredDepartments(departmentsResponse);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load reservation data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [reservationId, permissionsLoaded, canEditReservations, router]);

  // Fetch departments when institution changes
  useEffect(() => {
    if (
      formData.requester_institution_id &&
      permissionsLoaded &&
      canEditReservations
    ) {
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
  }, [
    formData.requester_institution_id,
    permissionsLoaded,
    canEditReservations
  ]);

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
    if (!canEditReservations) {
      toast.error('You do not have permission to edit reservations');
      return;
    }

    // Validation
    if (!formData.resource_id) {
      toast.error('Please select a resource');
      return;
    }

    if (!formData.title.trim()) {
      toast.error('Please provide a title for the reservation');
      return;
    }

    if (!formData.purpose) {
      toast.error('Please select a purpose for the reservation');
      return;
    }

    if (!formData.requester_institution_id) {
      toast.error('Please select an institution');
      return;
    }

    // Update reservation
    try {
      setSubmitting(true);

      // Format dates for submission
      const startDate = format(formData.start_date, 'yyyy-MM-dd');
      const endDate = format(formData.end_date, 'yyyy-MM-dd');

      // Combine date and time for start and end
      const startDateTime = `${startDate}T${formData.start_time}:00`;
      const endDateTime = `${endDate}T${formData.end_time}:00`;

      // Check if end date is before start date
      if (new Date(endDateTime) <= new Date(startDateTime)) {
        toast.error('End time must be after start time');
        setSubmitting(false);
        return;
      }

      await ReservationService.updateReservation(reservationId, {
        resource_id: formData.resource_id,
        title: formData.title,
        description: formData.description,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        purpose: formData.purpose,
        requester_institution_id: formData.requester_institution_id,
        requester_department_id: formData.requester_department_id || undefined,
        notes: formData.notes,
        status: formData.status as ReservationStatus
      });

      toast.success('Reservation updated successfully');
      router.push(
        `/resources/physical-resources/reservations/${reservationId}`
      );
    } catch (error) {
      console.error('Error updating reservation:', error);
      toast.error('Failed to update reservation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Edit Reservation'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission check (redundant due to the redirect above, but added for safety)
  if (permissionsLoaded && !canEditReservations) {
    return (
      <ContentLayout title='Edit Reservation'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit reservations
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resources/physical-resources/reservations'>
              Back to Reservations
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Reservation'>
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
            <BreadcrumbLink asChild>
              <Link
                href={`/resources/physical-resources/reservations/${reservationId}`}
              >
                Reservation Details
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Reservation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-6'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold'>Edit Reservation</h1>
            <p className='text-muted-foreground'>
              Update the reservation details
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reservation Details</CardTitle>
            <CardDescription>
              Modify the details of this reservation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className='flex justify-center items-center py-8'>
                <Loader2 className='h-8 w-8 animate-spin mr-2' />
                <span>Loading reservation data...</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className='space-y-6'>
                <div className='space-y-4'>
                  <div>
                    <Label htmlFor='resource_id'>Resource *</Label>
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
                        {resources.length === 0 ? (
                          <div className='p-2 text-center text-muted-foreground'>
                            No resources available
                          </div>
                        ) : (
                          resources.map((resource) => (
                            <SelectItem key={resource.id} value={resource.id}>
                              {resource.resource_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor='title'>Title *</Label>
                    <Input
                      id='title'
                      name='title'
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder='e.g., Team Meeting, Conference'
                    />
                  </div>

                  <div>
                    <Label htmlFor='description'>Description</Label>
                    <Textarea
                      id='description'
                      name='description'
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder='Provide details about this reservation'
                      rows={3}
                    />
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                      <Label>Start Date *</Label>
                      <div className='flex flex-col space-y-2'>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant='outline'
                              className={cn(
                                'justify-start text-left font-normal',
                                !formData.start_date && 'text-muted-foreground'
                              )}
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

                        <div>
                          <Label htmlFor='start_time'>Start Time *</Label>
                          <Input
                            id='start_time'
                            name='start_time'
                            type='time'
                            value={formData.start_time}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>
                    </div>

                    <div className='space-y-2'>
                      <Label>End Date *</Label>
                      <div className='flex flex-col space-y-2'>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant='outline'
                              className={cn(
                                'justify-start text-left font-normal',
                                !formData.end_date && 'text-muted-foreground'
                              )}
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

                        <div>
                          <Label htmlFor='end_time'>End Time *</Label>
                          <Input
                            id='end_time'
                            name='end_time'
                            type='time'
                            value={formData.end_time}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor='purpose'>Purpose *</Label>
                    <Select
                      value={formData.purpose}
                      onValueChange={(value) =>
                        handleSelectChange('purpose', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Select a purpose' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='meeting'>Meeting</SelectItem>
                        <SelectItem value='class'>Class/Lecture</SelectItem>
                        <SelectItem value='event'>Event</SelectItem>
                        <SelectItem value='exam'>Examination</SelectItem>
                        <SelectItem value='seminar'>
                          Seminar/Conference
                        </SelectItem>
                        <SelectItem value='workshop'>Workshop</SelectItem>
                        <SelectItem value='other'>Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <Label htmlFor='requester_institution_id'>
                        Institution *
                      </Label>
                      <Select
                        value={formData.requester_institution_id}
                        onValueChange={(value) =>
                          handleSelectChange('requester_institution_id', value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Select an institution' />
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
                      <Label htmlFor='requester_department_id'>
                        Department
                      </Label>
                      <Select
                        value={formData.requester_department_id}
                        onValueChange={(value) =>
                          handleSelectChange('requester_department_id', value)
                        }
                        disabled={!formData.requester_institution_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Select a department' />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredDepartments.length === 0 ? (
                            <div className='p-2 text-center text-muted-foreground'>
                              {formData.requester_institution_id
                                ? 'No departments available for this institution'
                                : 'Select an institution first'}
                            </div>
                          ) : (
                            filteredDepartments.map((department) => (
                              <SelectItem
                                key={department.id}
                                value={department.id}
                              >
                                {department.department_name}
                              </SelectItem>
                            ))
                          )}
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
                      placeholder='Any additional information about this reservation'
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor='status'>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) =>
                        handleSelectChange('status', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Select a status' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='pending'>Pending</SelectItem>
                        <SelectItem value='approved'>Approved</SelectItem>
                        <SelectItem value='rejected'>Rejected</SelectItem>
                        <SelectItem value='canceled'>Canceled</SelectItem>
                        <SelectItem value='completed'>Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className='flex justify-end space-x-2'>
                  <Button
                    variant='outline'
                    type='button'
                    onClick={() => router.back()}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type='submit' disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        Updating...
                      </>
                    ) : (
                      'Update Reservation'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
