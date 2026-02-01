// app/(routes)/grievance/_data/get-tickets.ts
// F004: Grievance Ticketing System - Server-side data fetching

import { createClient } from '@/lib/supabase/server';
import type { GrievanceTicket, GrievanceTicketFilters, GrievanceTicketListResponse } from '@/types/grievance';

/**
 * Get tickets with server-side caching
 */
export async function getTickets(
  filters: GrievanceTicketFilters = {}
): Promise<GrievanceTicketListResponse> {
  const supabase = await createClient();

  let query = supabase
    .from('grievance_tickets')
    .select(`
      *,
      category:grievance_categories(id, name, default_sla_hours),
      assignee:users_profiles!assigned_to(id, full_name, email),
      department:departments(id, name),
      resolver:users_profiles!resolved_by(id, full_name)
    `, { count: 'exact' });

  // Apply filters
  if (filters.institution_id) {
    query = query.eq('institution_id', filters.institution_id);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.sla_status) {
    query = query.eq('sla_status', filters.sla_status);
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters.assigned_to) {
    query = query.eq('assigned_to', filters.assigned_to);
  }
  if (filters.category_id) {
    query = query.eq('category_id', filters.category_id);
  }
  if (filters.raised_by_type) {
    query = query.eq('raised_by_type', filters.raised_by_type);
  }
  if (filters.raised_by_id) {
    query = query.eq('raised_by_id', filters.raised_by_id);
  }
  if (filters.department_id) {
    query = query.eq('department_id', filters.department_id);
  }
  if (filters.search) {
    query = query.or(`subject.ilike.%${filters.search}%,ticket_number.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }
  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  // Apply sorting
  const sortBy = filters.sortBy || 'created_at';
  const sortDirection = filters.sortDirection || 'desc';
  query = query.order(sortBy, { ascending: sortDirection === 'asc' });

  // Apply pagination
  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error('[getTickets] Error fetching tickets:', error);
    throw new Error(`Failed to fetch tickets: ${error.message}`);
  }

  return {
    data: (data || []) as GrievanceTicket[],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    }
  };
}

/**
 * Get a single ticket by ID
 */
export async function getTicket(id: string): Promise<GrievanceTicket> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('grievance_tickets')
    .select(`
      *,
      category:grievance_categories(id, name, default_sla_hours, description),
      assignee:users_profiles!assigned_to(id, full_name, email),
      department:departments(id, name),
      resolver:users_profiles!resolved_by(id, full_name)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getTicket] Error fetching ticket:', error);
    throw new Error(`Failed to fetch ticket: ${error.message}`);
  }

  return data as GrievanceTicket;
}

/**
 * Get categories for an institution
 */
export async function getCategories(institutionId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('grievance_categories')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    console.error('[getCategories] Error fetching categories:', error);
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  // Build tree structure
  const categories = data || [];
  const rootCategories = categories.filter(c => !c.parent_id);
  rootCategories.forEach(root => {
    (root as any).children = categories.filter(c => c.parent_id === root.id);
  });

  return rootCategories;
}

/**
 * Get dashboard stats
 */
export async function getDashboardStats(institutionId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_grievance_sla_stats', {
    p_institution_id: institutionId
  });

  if (error) {
    console.error('[getDashboardStats] Error fetching stats:', error);
    throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
  }

  return data;
}
