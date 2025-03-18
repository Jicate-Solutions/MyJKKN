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
  CardTitle,
  CardFooter
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
import { CalendarIcon, Loader2, PenSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReservationService } from '@/lib/services/resource/physical/reservation-service';
import { ResourceService } from '@/lib/services/resource/physical/resource-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import type { Resource, Reservation } from '@/types/resources';
import type { Institution, Department } from '@/types/organizations';
import { useAuth } from '@/hooks/use-auth';
import { use } from 'react';

interface EditReservationPageProps {
  params: Promise<{ id: string }>;
}

export default function EditReservationPage({
  params
}: EditReservationPageProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filteredDepartments, setFilteredDepartments] = useState<Department[]>(
    []
  );
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Load reservation and other data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch reservation
        const reservationData = await ReservationService.getReservation(id);
        setReservation(reservationData);

        // Parse dates and times
        const startDate = new Date(reservationData.start_datetime);
        const endDate = new Date(reservationData.end_datetime);

        const startTime = format(startDate, 'HH:mm');
        const endTime = format(endDate, 'HH:mm');

        // Set form data
        setFormData({
          resource_id: reservationData.resource_id,
          title: reservationData.title,
          description: reservationData.description || '',
          start_date: startDate,
          start_time: startTime,
          end_date: endDate,
          end_time: endTime,
          purpose: reservationData.purpose || '',
          requester_institution_id: reservationData.requester_institution_id,
          requester_department_id:
            reservationData.requester_department_id || '',
          notes: reservationData.notes || ''
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

        // Fetch departments
        const departmentsResponse = await DepartmentService.getDepartments();
        setDepartments(departmentsResponse.data);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load reservation data'
        );
        toast.error('Failed to load reservation data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Filter departments based on selected institution
  useEffect(() => {
    if (formData.requester_institution_id) {
      const filtered = departments.filter(
        (dept) => dept.institution_id === formData.requester_institution_id
      );
      setFilteredDepartments(filtered);

      // Reset department selection if current selection doesn't belong to the selected institution
      if (
        formData.requester_department_id &&
        !filtered.some((dept) => dept.id === formData.requester_department_id)
      ) {
        setFormData((prev) => ({ ...prev, requester_department_id: '' }));
      }
    } else {
      setFilteredDepartments([]);
      setFormData((prev) => ({ ...prev, requester_department_id: '' }));
    }
  }, [
    formData.requester_institution_id,
    formData.requester_department_id,
    departments
  ]);

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

    if (!user) {
      toast.error('You must be logged in to update a reservation');
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

      // Update reservation
      await ReservationService.updateReservation(id, {
        resource_id: formData.resource_id,
        title: formData.title,
        description: formData.description,
        start_datetime: startDateTime.toISOString(),
        end_datetime: endDateTime.toISOString(),
        purpose: formData.purpose,
        requester_institution_id: formData.requester_institution_id,
        requester_department_id: formData.requester_department_id || undefined,
        notes: formData.notes
      });

      toast.success('Reservation updated successfully');
      router.push(`/resources/physical-resources/reservations/${id}`);
    } catch (error) {
      console.error('Error updating reservation:', error);
      toast.error('Failed to update reservation');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <ContentLayout title='Edit Reservation'>
        <div className='text-center py-12'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/resources/physical-resources/reservations')}
            className='mt-4'
          >
            Back to Reservations
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
              <Link href='/resources/physical-resources/dashboard'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/physical-resources/reservations'>Reservations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/resources/physical-resources/reservations/${id}`}>
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

      <div className='flex items-center mt-6 mb-4'>
        <PenSquare className='mr-2 h-5 w-5' />
        <h1 className='text-2xl font-bold'>Edit Reservation</h1>
      </div>

      {loading ? (
        <div className='flex justify-center items-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Reservation Details</CardTitle>
            <CardDescription>
              Update your reservation information
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className='space-y-6'>
              <div className='space-y-4'>
                <div>
                  <Label htmlFor='resource_id'>Resource</Label>
                  <Select
                    value={formData.resource_id}
                    onValueChange={(value) =>
                      handleSelectChange('resource_id', value)
                    }
                  >
                    <SelectTrigger id='resource_id'>
                      <SelectValue placeholder='Select a resource' />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          {resource.resource_name}
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
                    rows={3}
                  />
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <Label>Start Date</Label>
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
                  </div>

                  <div>
                    <Label>End Date</Label>
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
                  </div>
                </div>

                <div>
                  <Label htmlFor='purpose'>Purpose</Label>
                  <Textarea
                    id='purpose'
                    name='purpose'
                    value={formData.purpose}
                    onChange={handleInputChange}
                    rows={2}
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
                    >
                      <SelectTrigger id='requester_institution_id'>
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
                    <Label htmlFor='requester_department_id'>Department</Label>
                    <Select
                      value={formData.requester_department_id}
                      onValueChange={(value) =>
                        handleSelectChange('requester_department_id', value)
                      }
                      disabled={!formData.requester_institution_id}
                    >
                      <SelectTrigger id='requester_department_id'>
                        <SelectValue placeholder='Select a department' />
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
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className='flex justify-between'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.push(`/resources/physical-resources/reservations/${id}`)}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                Update Reservation
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </ContentLayout>
  );
}
