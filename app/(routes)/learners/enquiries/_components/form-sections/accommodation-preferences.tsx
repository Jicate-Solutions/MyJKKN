'use client';
// ============================================
// ACCOMMODATION PREFERENCES FORM SECTION
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Updated to match admissions form structure
// Updated: 2026-05-21 - Removed the legacy "Reference Information" block
//   (reference_type / reference_name / reference_contact). Referral
//   attribution is now captured in the leads module's "Referral & Consultant"
//   section using the FK-based referral_type / referred_by_id /
//   referred_by_name columns and flows into learners_profiles via
//   /api/admission/bridge/convert. The DB columns + form-schema entries are
//   kept (2,066 historical rows in production + 9 API integration files
//   reference them, including B2A endpoints), so this is a UI-only removal.
// Purpose: Hostel room/mess category (HOSTEL) + Day-Scholar bus transport
//   (bus required → TMS route → boarding-point stop).
// ============================================


import { UseFormReturn, useWatch } from 'react-hook-form';
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
import { useActiveRoutes, useRouteStops } from '@/hooks/tms/use-route-lookup';

interface AccommodationPreferencesProps {
  form: UseFormReturn<any>;
  isStudentView?: boolean;
}

export function AccommodationPreferencesSection({
  form,
  isStudentView: _isStudentView = false
}: AccommodationPreferencesProps) {
  // Watch for accommodation type to show conditional fields
  const accommodationType = useWatch({
    control: form.control,
    name: 'accommodation_type'
  });

  // hostel_category_id / mess_category_id pickers removed (20260611190000):
  // room & mess categories are allocation-derived — set automatically by
  // trg_allocation_sync_learner_categories when a hostel room allocation
  // becomes active, never chosen at admission/enquiry time.

  // Day-Scholar bus transport: bus required → route → boarding-point stop.
  const busRequired = useWatch({ control: form.control, name: 'bus_required' });
  const transportRouteId = useWatch({
    control: form.control,
    name: 'transport_route_id'
  });
  const { routes, loading: loadingRoutes } = useActiveRoutes();
  const { stops, loading: loadingStops } = useRouteStops(
    busRequired === true ? transportRouteId : undefined
  );

  // Reset dependent fields when selection changes
  useEffect(() => {
    if (accommodationType !== 'DAY SCHOLAR') {
      // Reset bus/transport fields when not a day scholar
      form.setValue('bus_required', undefined);
      form.setValue('transport_route_id', undefined);
      form.setValue('transport_stop_id', undefined);
    }
  }, [accommodationType, form]);

  // Clear route + stop when the learner says no bus is needed.
  useEffect(() => {
    if (busRequired !== true) {
      if (form.getValues('transport_route_id'))
        form.setValue('transport_route_id', undefined);
      if (form.getValues('transport_stop_id'))
        form.setValue('transport_stop_id', undefined);
    }
  }, [busRequired, form]);

  // Clear a chosen stop that's no longer valid for the current route (e.g. the
  // route was changed after picking). Guarded on load + membership so a valid
  // prefilled stop on edit is preserved.
  useEffect(() => {
    if (loadingStops) return;
    const cur = form.getValues('transport_stop_id');
    if (cur && !stops.some((s) => s.id === cur)) {
      form.setValue('transport_stop_id', undefined);
    }
  }, [transportRouteId, stops, loadingStops, form]);

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>
          Accommodation Preferences
        </h2>
        <p className='text-sm text-muted-foreground'>
          Specify your accommodation needs.
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
          <p className='text-sm text-muted-foreground rounded-md border bg-muted/30 p-3'>
            Room and mess categories are declared on the matching{' '}
            <span className='font-medium'>admission fee structure</span> — open
            the <span className='font-medium'>Finance</span> tab to see which
            tier this learner&apos;s package covers. They are not picked here.
          </p>
        )}

        {accommodationType === 'DAY SCHOLAR' && (
          <>
            {/* Bus Required? — drives the route + boarding-point selectors. */}
            <FormField
              control={form.control}
              name='bus_required'
              render={({ field }) => (
                <FormItem className='space-y-3'>
                  <FormLabel>Bus Required?</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(v) => field.onChange(v === 'yes')}
                      value={
                        field.value === true
                          ? 'yes'
                          : field.value === false
                          ? 'no'
                          : ''
                      }
                      className='flex flex-col space-y-1'
                    >
                      <div className='flex items-center space-x-2'>
                        <RadioGroupItem value='yes' id='bus_yes' />
                        <Label htmlFor='bus_yes'>Yes</Label>
                      </div>
                      <div className='flex items-center space-x-2'>
                        <RadioGroupItem value='no' id='bus_no' />
                        <Label htmlFor='bus_no'>No</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Do you need the college bus?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {busRequired === true && (
              <>
                {/* Route — active TMS routes. */}
                <FormField
                  control={form.control}
                  name='transport_route_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Route</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                        disabled={loadingRoutes || routes.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                loadingRoutes
                                  ? 'Loading...'
                                  : routes.length === 0
                                  ? 'No routes available'
                                  : 'Select route'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className='max-h-60 overflow-y-auto'>
                          {routes.map((route) => (
                            <SelectItem key={route.id} value={route.id}>
                              {route.route_number} - {route.route_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Bus route you will travel on
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Boarding Point — stops on the chosen route. */}
                {transportRouteId && (
                  <FormField
                    control={form.control}
                    name='transport_stop_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Boarding Point</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ''}
                          disabled={loadingStops || stops.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  loadingStops
                                    ? 'Loading...'
                                    : stops.length === 0
                                    ? 'No stops available'
                                    : 'Select boarding point'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {stops.map((stop) => (
                              <SelectItem key={stop.id} value={stop.id}>
                                {stop.stop_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Where you will board the bus
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

        {/* Legacy "Reference Information" section removed 2026-05-21.
         *  Referral attribution now lives on the leads module under the
         *  Referral & Consultant section and propagates to learners_profiles
         *  via /api/admission/bridge/convert (referral_type, referred_by_id,
         *  referred_by_name). The DB columns reference_type / reference_name
         *  / reference_contact are kept for historical data + B2A API
         *  compatibility but are no longer user-editable from the enquiry
         *  form. */}
      </div>
    </div>
  );
}
