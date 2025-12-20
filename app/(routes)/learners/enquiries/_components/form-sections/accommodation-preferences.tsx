// ============================================
// ACCOMMODATION PREFERENCES FORM SECTION
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Updated to match admissions form structure
// Purpose: Hostel, food, transport, and reference details
// Changes:
// - Changed to RadioGroup for accommodation type
// - Added conditional rendering (hostel fields only when HOSTEL selected)
// - Added conditional rendering (bus fields only when DAY SCHOLAR selected)
// - Changed bus required to RadioGroup
// - Added cascading dropdowns for bus route → pickup location
// - Updated reference types to match admission form
// - Added form descriptions
// - Added reset logic for dependent fields
// - Updated all values to uppercase format
// ============================================

'use client';

import { UseFormReturn, useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useEffect } from 'react';

interface AccommodationPreferencesProps {
  form: UseFormReturn<any>;
}

export function AccommodationPreferencesSection({
  form
}: AccommodationPreferencesProps) {
  // Watch for accommodation type to show conditional fields
  const accommodationType = useWatch({
    control: form.control,
    name: 'accommodation_type'
  });

  // Watch for bus requirement to show conditional fields
  const busRequired = useWatch({
    control: form.control,
    name: 'bus_required'
  });

  // Watch for bus route to show relevant pickup locations
  const busRoute = useWatch({
    control: form.control,
    name: 'bus_route'
  });

  // Watch for reference type to show conditional fields
  const referenceType = useWatch({
    control: form.control,
    name: 'reference_type'
  });

  // Reset dependent fields when selection changes
  useEffect(() => {
    if (accommodationType === 'HOSTEL') {
      form.setValue('bus_required', undefined);
      form.setValue('bus_route', undefined);
      form.setValue('bus_pickup_location', undefined);
    } else if (accommodationType === 'DAY SCHOLAR') {
      form.setValue('hostel_type', undefined);
      form.setValue('food_type', undefined); // Reset food type when not hostel
    } else {
      // Reset all accommodation-specific fields when no type selected
      form.setValue('hostel_type', undefined);
      form.setValue('food_type', undefined);
      form.setValue('bus_required', undefined);
      form.setValue('bus_route', undefined);
      form.setValue('bus_pickup_location', undefined);
    }
  }, [accommodationType, form]);

  useEffect(() => {
    if (busRequired === false) {
      form.setValue('bus_route', undefined);
      form.setValue('bus_pickup_location', undefined);
    }
  }, [busRequired, form]);

  useEffect(() => {
    if (busRoute) {
      form.setValue('bus_pickup_location', undefined);
    }
  }, [busRoute, form]);

  // Hostel type options (values match database format - uppercase)
  const hostelTypeOptions = [
    { value: 'AC HOSTEL', label: 'AC Hostel' },
    { value: 'NON-AC HOSTEL', label: 'Non-AC Hostel' }
  ];

  // Bus route options
  const busRouteOptions = [
    { value: 'route_1', label: 'Route 1 - City Center' },
    { value: 'route_2', label: 'Route 2 - East Zone' },
    { value: 'route_3', label: 'Route 3 - West Zone' },
    { value: 'route_4', label: 'Route 4 - South Zone' },
    { value: 'route_5', label: 'Route 5 - North Zone' }
  ];

  // Bus pickup locations based on route
  const getPickupLocations = () => {
    if (!busRoute) return [];

    switch (busRoute) {
      case 'route_1':
        return [
          { value: 'city_hall', label: 'City Hall' },
          { value: 'central_market', label: 'Central Market' },
          { value: 'main_street', label: 'Main Street Junction' }
        ];
      case 'route_2':
        return [
          { value: 'east_terminal', label: 'East Bus Terminal' },
          { value: 'hospital', label: 'General Hospital' },
          { value: 'library', label: 'Public Library' }
        ];
      case 'route_3':
        return [
          { value: 'west_mall', label: 'West Mall' },
          { value: 'industrial_area', label: 'Industrial Area' },
          { value: 'tech_park', label: 'Tech Park' }
        ];
      case 'route_4':
        return [
          { value: 'south_station', label: 'South Railway Station' },
          { value: 'beach_road', label: 'Beach Road' },
          { value: 'temple', label: 'Main Temple' }
        ];
      case 'route_5':
        return [
          { value: 'north_junction', label: 'North Junction' },
          { value: 'stadium', label: 'Stadium' },
          { value: 'university', label: 'University Gate' }
        ];
      default:
        return [];
    }
  };

  // Reference type options (values match database format - uppercase)
  const referenceTypeOptions = [
    { value: 'DIRECT APPLICATION', label: 'Direct Application' },
    { value: 'JKKN STAFF', label: 'JKKN Staff' },
    { value: 'CURRENT/FORMER STUDENT', label: 'Current/Former Student' },
    { value: 'EDUCATIONAL CONSULTANT', label: 'Educational Consultant' },
    { value: 'SOCIAL MEDIA', label: 'Social Media' },
    { value: 'OTHERS', label: 'Others' }
  ];

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>
          Accommodation Preferences
        </h2>
        <p className='text-sm text-muted-foreground'>
          Specify your accommodation needs and how you heard about us.
        </p>
      </div>

      <div className='space-y-6'>
        <FormField
          control={form.control}
          name='accommodation_type'
          render={({ field }) => (
            <FormItem className='space-y-3'>
              <FormLabel>Accommodation Type <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value || ''}
                  className='flex flex-col space-y-1'
                >
                  <div className='flex items-center space-x-2'>
                    <RadioGroupItem value='HOSTEL' id='hostel' />
                    <Label htmlFor='hostel'>Hostel</Label>
                  </div>
                  <div className='flex items-center space-x-2'>
                    <RadioGroupItem value='DAY SCHOLAR' id='day_scholar' />
                    <Label htmlFor='day_scholar'>Day Scholar</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {accommodationType === 'HOSTEL' && (
          <>
            <FormField
              control={form.control}
              name='hostel_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hostel Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select hostel type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className='max-h-60 overflow-y-auto'>
                      {hostelTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select your preferred type of hostel accommodation
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='food_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Food Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select food type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='VEG'>Vegetarian</SelectItem>
                      <SelectItem value='NON-VEG'>Non-Vegetarian</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select your dietary preference for hostel meals
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {accommodationType === 'DAY SCHOLAR' && (
          <>
            <FormField
              control={form.control}
              name='bus_required'
              render={({ field }) => (
                <FormItem className='space-y-3'>
                  <FormLabel>Bus Facility Required?</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(value) =>
                        field.onChange(value === 'true')
                      }
                      value={
                        field.value === undefined
                          ? ''
                          : field.value
                          ? 'true'
                          : 'false'
                      }
                      className='flex flex-col space-y-1'
                    >
                      <div className='flex items-center space-x-2'>
                        <RadioGroupItem value='true' id='bus-yes' />
                        <Label htmlFor='bus-yes'>Yes</Label>
                      </div>
                      <div className='flex items-center space-x-2'>
                        <RadioGroupItem value='false' id='bus-no' />
                        <Label htmlFor='bus-no'>No</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {busRequired && (
              <>
                <FormField
                  control={form.control}
                  name='bus_route'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bus Route</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select bus route' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className='max-h-60 overflow-y-auto'>
                          {busRouteOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the bus route closest to your residence
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {busRoute && (
                  <FormField
                    control={form.control}
                    name='bus_pickup_location'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pickup Location</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ''}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select pickup location' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {getPickupLocations().map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select your preferred pickup location along the route
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}
          </>
        )}

        <div className='pt-4 border-t border-border'>
          <FormField
            control={form.control}
            name='reference_type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>How did you hear about us?</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value || ''}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select reference type' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className='max-h-60 overflow-y-auto'>
                    {referenceTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {referenceType && referenceType !== 'DIRECT APPLICATION' && (
            <>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mt-4'>
                <FormField
                  control={form.control}
                  name='reference_name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder='Name of the reference person'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='reference_contact'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Contact</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder='Contact number of reference'
                          maxLength={10}
                          inputMode='tel'
                        />
                      </FormControl>
                      <FormDescription>10-digit mobile number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
