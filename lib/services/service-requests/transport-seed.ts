/**
 * Transport Service Type Seed
 *
 * Seeds the built-in "Transport Service Request" service type
 * with 11 dynamic fields and 1 approval step.
 * Field options match JKKN-specific locations and routes.
 *
 * Uses service role client (bypasses RLS) because this runs from
 * a server API route where auth has already been verified.
 *
 * @module services/service-requests/transport-seed
 * @created 2026-02-09
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

export async function seedTransportServiceType(userId: string) {
  const supabase = createServiceRoleClient() as any;

  // Check if already exists
  const { data: existing } = await supabase
    .from('service_types')
    .select('*, fields:service_type_fields(*), approval_steps:service_request_approval_steps(*)')
    .eq('slug', 'transport-request')
    .maybeSingle();

  if (existing) {
    console.log('[service-requests/seed] Transport service type already exists, skipping.');
    return existing;
  }

  console.log('[service-requests/seed] Creating transport service type...');

  // Step 1: Insert the service type
  const { data: serviceType, error: typeError } = await supabase
    .from('service_types')
    .insert({
      slug: 'transport-request',
      name: 'Transport Service Request',
      description: 'Request bus transportation to and from campus',
      icon: 'Bus',
      color: '#3B82F6',
      is_system_default: true,
      allowed_roles: ['super_admin', 'student', 'faculty', 'staff'],
      max_active_requests: 1,
      auto_fulfill_on_approval: true,
      enable_priority: false,
      enable_attachments: false,
      enable_email_notifications: true,
      approval_workflow_type: 'sequential',
      validity_period_days: 180,
      created_by: userId,
    })
    .select()
    .single();

  if (typeError) {
    console.error('[service-requests/seed] Failed to create service type:', typeError);
    throw new Error(`Failed to create transport service type: ${typeError.message}`);
  }

  // Step 2: Insert fields
  const fields = [
    {
      service_type_id: serviceType.id,
      field_key: 'pickup_location',
      field_label: 'Pickup Point',
      field_type: 'select',
      is_required: true,
      display_order: 1,
      help_text: 'Select the nearest pickup location for your transport',
      field_options: [
        { label: 'Komarapalayam Bus Stop', value: 'komarapalayam_bus_stop' },
        { label: 'Salem New Bus Stand', value: 'salem_new_bus_stand' },
        { label: 'Namakkal Town', value: 'namakkal_town' },
        { label: 'Erode Junction', value: 'erode_junction' },
        { label: 'Tiruchengode', value: 'tiruchengode' },
        { label: 'Rasipuram', value: 'rasipuram' },
        { label: 'Paramathi', value: 'paramathi' },
        { label: 'Mohanur', value: 'mohanur' },
        { label: 'Sankari', value: 'sankari' },
        { label: 'Senthamangalam', value: 'senthamangalam' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'drop_location',
      field_label: 'Drop Point',
      field_type: 'select',
      is_required: true,
      display_order: 2,
      help_text: 'Select the drop-off location',
      field_options: [
        { label: 'JKKN Campus - Komarapalayam', value: 'jkkn_komarapalayam' },
        { label: 'JKKN Campus - Namakkal', value: 'jkkn_namakkal' },
        { label: 'Same as Pickup (Return Trip)', value: 'same_as_pickup' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'preferred_route',
      field_label: 'Preferred Route',
      field_type: 'select',
      is_required: false,
      display_order: 3,
      help_text: 'Select a preferred bus route if you have one in mind',
      field_options: [
        { label: 'Route 1 - Namakkal', value: 'route_1_namakkal' },
        { label: 'Route 2 - Salem', value: 'route_2_salem' },
        { label: 'Route 3 - Erode', value: 'route_3_erode' },
        { label: 'Route 4 - Tiruchengode', value: 'route_4_tiruchengode' },
        { label: 'Route 5 - Rasipuram', value: 'route_5_rasipuram' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'bus_type',
      field_label: 'Bus Type',
      field_type: 'select',
      is_required: true,
      display_order: 4,
      field_options: [
        { label: 'Regular', value: 'regular' },
        { label: 'AC', value: 'ac' },
        { label: 'Mini Bus', value: 'mini' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'timing_preference',
      field_label: 'Timing',
      field_type: 'select',
      is_required: true,
      display_order: 5,
      default_value: 'both',
      field_options: [
        { label: 'Morning Only', value: 'morning' },
        { label: 'Evening Only', value: 'evening' },
        { label: 'Morning & Evening', value: 'both' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'shift_timing',
      field_label: 'Shift / College Timing',
      field_type: 'select',
      is_required: false,
      display_order: 6,
      field_options: [
        { label: '7:00 AM - 3:30 PM', value: '7am-3_30pm' },
        { label: '8:00 AM - 4:30 PM', value: '8am-4_30pm' },
        { label: '9:00 AM - 5:00 PM', value: '9am-5pm' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'boarding_point_type',
      field_label: 'Boarding Point Type',
      field_type: 'select',
      is_required: true,
      display_order: 7,
      default_value: 'main_stop',
      help_text: 'Select your preferred boarding type',
      field_options: [
        { label: 'Main Stop (Designated)', value: 'main_stop' },
        { label: 'Intermediate Stop', value: 'intermediate_stop' },
        { label: 'Door Pickup', value: 'door_pickup' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'start_date',
      field_label: 'Service Start Date',
      field_type: 'date',
      is_required: true,
      display_order: 8,
      help_text: 'When do you want to start using the transport service?',
    },
    {
      service_type_id: serviceType.id,
      field_key: 'academic_year_validity',
      field_label: 'Valid For',
      field_type: 'select',
      is_required: true,
      display_order: 9,
      help_text: 'Duration for which transport is needed',
      field_options: [
        { label: 'Current Semester', value: 'current_semester' },
        { label: 'Full Academic Year', value: 'full_academic_year' },
      ],
    },
    {
      service_type_id: serviceType.id,
      field_key: 'special_needs',
      field_label: 'Special Requirements',
      field_type: 'textarea',
      is_required: false,
      display_order: 10,
      placeholder: 'Any special requirements (wheelchair access, medical needs, etc.)',
    },
    {
      service_type_id: serviceType.id,
      field_key: 'emergency_contact',
      field_label: 'Emergency Contact Number',
      field_type: 'text',
      is_required: true,
      display_order: 11,
      placeholder: '+91 9876543210',
      help_text: 'A phone number to contact in case of emergencies during transport',
    },
  ];

  const { error: fieldsError } = await supabase
    .from('service_type_fields')
    .insert(fields);

  if (fieldsError) {
    console.error('[service-requests/seed] Failed to create fields:', fieldsError);
    // Rollback
    await supabase.from('service_types').delete().eq('id', serviceType.id);
    throw new Error(`Failed to create transport fields: ${fieldsError.message}`);
  }

  // Step 3: Insert approval step
  const { error: stepError } = await supabase
    .from('service_request_approval_steps')
    .insert({
      service_type_id: serviceType.id,
      step_order: 1,
      step_name: 'Transport Head Review',
      approver_role: 'administrator',
      is_required: true,
    });

  if (stepError) {
    console.error('[service-requests/seed] Failed to create approval step:', stepError);
    // Rollback
    await supabase.from('service_type_fields').delete().eq('service_type_id', serviceType.id);
    await supabase.from('service_types').delete().eq('id', serviceType.id);
    throw new Error(`Failed to create transport approval step: ${stepError.message}`);
  }

  console.log('[service-requests/seed] Transport service type created:', serviceType.id);

  // Return with relations
  const { data: result } = await supabase
    .from('service_types')
    .select('*, fields:service_type_fields(*), approval_steps:service_request_approval_steps(*)')
    .eq('id', serviceType.id)
    .single();

  return result || serviceType;
}
