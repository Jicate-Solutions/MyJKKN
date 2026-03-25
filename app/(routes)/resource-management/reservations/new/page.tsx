// app/(routes)/resource-management/reservations/new/page.tsx
'use client';

import { useState } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ResourceSelector } from '../_components/resource-selector';
import { AvailabilityCalendar } from '../_components/availability-calendar';
import { TimeSlotPicker } from '../_components/time-slot-picker';
import { BookingForm } from '../_components/booking-form';
import { useAuth } from '@/hooks/use-auth';
import type { Resource } from '@/types/resource-management';

export default function NewReservationPage() {
  const { profile: user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);

  // Form state
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [selectedEndTime, setSelectedEndTime] = useState<string>('');

  const steps = [
    { number: 1, title: 'Select Resource', completed: !!selectedResource },
    { number: 2, title: 'Choose Date', completed: !!selectedDate },
    {
      number: 3,
      title: 'Pick Time Slot',
      completed: !!(selectedStartTime && selectedEndTime)
    },
    { number: 4, title: 'Booking Details', completed: false }
  ];

  const handleResourceSelect = (resource: Resource) => {
    setSelectedResource(resource);
    setSelectedDate(''); // Reset subsequent steps
    setSelectedStartTime('');
    setSelectedEndTime('');
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedStartTime(''); // Reset time selection
    setSelectedEndTime('');
  };

  const handleTimeSlotSelect = (startTime: string, endTime: string) => {
    setSelectedStartTime(startTime);
    setSelectedEndTime(endTime);
  };

  const canProceedToStep = (step: number): boolean => {
    switch (step) {
      case 2:
        return !!selectedResource;
      case 3:
        return !!selectedResource && !!selectedDate;
      case 4:
        return (
          !!selectedResource &&
          !!selectedDate &&
          !!selectedStartTime &&
          !!selectedEndTime
        );
      default:
        return true;
    }
  };

  const goToNextStep = () => {
    if (currentStep < 4 && canProceedToStep(currentStep + 1)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <ContentLayout title='New Reservation'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management'>
              Resource Management
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management/reservations'>
              Reservations
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>New Reservation</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Progress Steps */}
      <Card className='mb-6 p-6'>
        <div className='flex items-center justify-between'>
          {steps.map((step, index) => (
            <div key={step.number} className='flex items-center flex-1'>
              <div className='flex flex-col items-center flex-1'>
                {/* Step Circle */}
                <div
                  className={`
                    flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold
                    ${
                      currentStep === step.number
                        ? 'border-primary bg-primary text-primary-foreground'
                        : step.completed
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-muted bg-muted text-muted-foreground'
                    }
                  `}
                >
                  {step.completed ? (
                    <CheckCircle2 className='h-5 w-5' />
                  ) : (
                    step.number
                  )}
                </div>
                {/* Step Title */}
                <p
                  className={`
                    mt-2 text-sm font-medium text-center
                    ${
                      currentStep === step.number
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    }
                  `}
                >
                  {step.title}
                </p>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`
                    h-0.5 flex-1 mx-2
                    ${step.completed ? 'bg-green-500' : 'bg-muted'}
                  `}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Step Content */}
      <div className='space-y-6'>
        {/* Step 1: Select Resource */}
        {currentStep === 1 && (
          <div className='space-y-4'>
            <ResourceSelector
              onSelectResource={handleResourceSelect}
              selectedResourceId={selectedResource?.id}
            />
            {selectedResource && (
              <div className='flex justify-end'>
                <Button onClick={goToNextStep}>
                  Continue to Date Selection
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Choose Date */}
        {currentStep === 2 && selectedResource && (
          <div className='space-y-4'>
            <div className='rounded-lg border p-4 bg-muted/50'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Selected Resource
                  </p>
                  <p className='font-semibold'>{selectedResource.name}</p>
                </div>
                <Badge variant='outline'>{selectedResource.status}</Badge>
              </div>
            </div>

            <AvailabilityCalendar
              resourceId={selectedResource.id}
              onSelectDate={handleDateSelect}
              selectedDate={selectedDate}
            />

            <div className='flex items-center justify-between'>
              <Button variant='outline' onClick={goToPreviousStep}>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Resources
              </Button>
              {selectedDate && (
                <Button onClick={goToNextStep}>
                  Continue to Time Selection
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Pick Time Slot */}
        {currentStep === 3 && selectedResource && selectedDate && (
          <div className='space-y-4'>
            <div className='rounded-lg border p-4 bg-muted/50'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div>
                  <p className='text-sm text-muted-foreground'>
                    Selected Resource
                  </p>
                  <p className='font-semibold'>{selectedResource.name}</p>
                </div>
                <div>
                  <p className='text-sm text-muted-foreground'>Selected Date</p>
                  <p className='font-semibold'>
                    {new Date(selectedDate).toLocaleDateString('default', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>

            <TimeSlotPicker
              resourceId={selectedResource.id}
              date={selectedDate}
              onSelectSlot={handleTimeSlotSelect}
              selectedStartTime={selectedStartTime}
              selectedEndTime={selectedEndTime}
            />

            <div className='flex items-center justify-between'>
              <Button variant='outline' onClick={goToPreviousStep}>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Calendar
              </Button>
              {selectedStartTime && selectedEndTime && (
                <Button onClick={goToNextStep}>
                  Continue to Booking Form
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Booking Form */}
        {currentStep === 4 &&
          selectedResource &&
          selectedDate &&
          selectedStartTime &&
          selectedEndTime &&
          user && (
            <div className='space-y-4'>
              <Button
                variant='outline'
                onClick={goToPreviousStep}
                className='mb-4'
              >
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Time Selection
              </Button>

              <BookingForm
                resource={selectedResource}
                selectedDate={selectedDate}
                selectedStartTime={selectedStartTime}
                selectedEndTime={selectedEndTime}
                userId={user.id}
              />
            </div>
          )}
      </div>
    </ContentLayout>
  );
}
