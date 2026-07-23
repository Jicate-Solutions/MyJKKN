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
      // '*' = available to every authenticated user (learners + all staff,
      // including custom roles created later). See ALL_ROLES_WILDCARD.
      allowed_roles: ['*'],
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
      field_key: 'passenger_type',
      field_label: 'Passenger Type',
      field_type: 'passenger_type',
      is_required: false,
      display_order: 0,
      help_text: 'Detected automatically from your account',
    },
    {
      service_type_id: serviceType.id,
      field_key: 'bus_route',
      field_label: 'Bus Route',
      field_type: 'tms_route',
      is_required: true,
      display_order: 1,
      help_text: 'Select your bus route',
    },
    {
      service_type_id: serviceType.id,
      field_key: 'boarding_stop',
      field_label: 'Boarding Stop',
      field_type: 'tms_route_stop',
      is_required: true,
      display_order: 2,
      help_text: 'Select your boarding stop on the chosen route',
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

  // No approval step — Bus Pass Request is instant self-service (auto-fulfilled
  // on submit because auto_fulfill_on_approval=true and there are zero steps).

  console.log('[service-requests/seed] Transport service type created:', serviceType.id);

  // Return with relations
  const { data: result } = await supabase
    .from('service_types')
    .select('*, fields:service_type_fields(*), approval_steps:service_request_approval_steps(*)')
    .eq('id', serviceType.id)
    .single();

  return result || serviceType;
}
