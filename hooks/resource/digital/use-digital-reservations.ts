// hooks/resource/use-digital-reservations.ts

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type {
  DigitalReservation,
  DigitalReservationFilters,
  CreateDigitalReservationDto,
  UpdateDigitalReservationDto,
  ReservationStatus
} from '@/types/digital-resources';

export function useDigitalReservations(initialFilters: DigitalReservationFilters = {}) {
  const [reservations, setReservations] = useState<DigitalReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DigitalReservationFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const supabase = createClientComponentClient();

  const fetchReservations = useCallback(
    async (newFilters?: DigitalReservationFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const {
          search,
          digital_resource_id,
          user_id,
          status,
          start_date,
          end_date,
          page = 1,
          limit = 10
        } = currentFilters;

        // Calculate pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        try {
          // Start building the query
          let query = supabase
            .from('digital_reservations')
            .select('*', { count: 'exact' });

          // Apply filters
          if (search) {
            query = query.ilike('title', `%${search}%`);
          }

          if (digital_resource_id) {
            query = query.eq('digital_resource_id', digital_resource_id);
          }

          if (user_id) {
            query = query.eq('user_id', user_id);
          }

          if (status) {
            query = query.eq('status', status);
          }

          if (start_date) {
            query = query.gte('reservation_start', start_date);
          }

          if (end_date) {
            query = query.lte('reservation_end', end_date);
          }

          // Apply pagination
          query = query.range(from, to);

          // Execute the query
          const { data, error, count } = await query;

          if (error) {
            console.error('Supabase query error:', error);
            throw error;
          }

          // Fetch related data if we have reservations
          if (data && data.length > 0) {
            // Get unique IDs for related entities
            const resourceIds = [...new Set(data.map(item => item.digital_resource_id))];
            const userIds = [...new Set(data.map(item => item.user_id))];
            const approverIds = [...new Set(data.filter(item => item.approver_id).map(item => item.approver_id))];
            
            // Fetch digital resources
            const { data: resources, error: resourcesError } = await supabase
              .from('digital_resources')
              .select('id, digital_resource_name, type')
              .in('id', resourceIds);
              
            if (resourcesError) {
              console.warn('Error fetching related digital resources:', resourcesError);
            }
            
            // Fetch users
            const { data: users, error: usersError } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .in('id', userIds);
              
            if (usersError) {
              console.warn('Error fetching related users:', usersError);
            }
            
            // Fetch approvers if any
            let approvers: any[] = [];
            if (approverIds.length > 0) {
              const { data: approversData, error: approversError } = await supabase
                .from('profiles')
                .select('id, email')
                .in('id', approverIds);
                
              if (approversError) {
                console.warn('Error fetching related approvers:', approversError);
              } else {
                approvers = approversData || [];
              }
            }
            
            // Create lookup maps for faster access
            const resourceMap = (resources || []).reduce((map, resource) => {
              map[resource.id] = resource;
              return map;
            }, {} as Record<string, any>);
            
            const userMap = (users || []).reduce((map, user) => {
              map[user.id] = user;
              return map;
            }, {} as Record<string, any>);
            
            const approverMap = approvers.reduce((map, approver) => {
              map[approver.id] = approver;
              return map;
            }, {} as Record<string, any>);
            
            // Enrich reservation data with related entities
            const enrichedData = data.map(reservation => ({
              ...reservation,
              digital_resource: resourceMap[reservation.digital_resource_id] || null,
              user: userMap[reservation.user_id] || null,
              approver: reservation.approver_id ? approverMap[reservation.approver_id] || null : null
            }));
            
            setReservations(enrichedData as DigitalReservation[]);
          } else {
            setReservations(data as DigitalReservation[]);
          }

          // Calculate total pages
          const totalPages = count ? Math.ceil(count / limit) : 0;

          setMetadata({
            total: count || 0,
            page,
            limit,
            totalPages
          });

          if (newFilters) {
            setFilters(newFilters);
          }
        } catch (queryError: unknown) {
          // Check if this is a missing table error
          if (
            typeof queryError === 'object' && 
            queryError !== null && 
            'message' in queryError && 
            typeof queryError.message === 'string' && 
            queryError.message.includes('does not exist')
          ) {
            setError('The digital_reservations table does not exist in the database. Please run the SQL setup script.');
          } else {
            setError(queryError instanceof Error ? queryError.message : 'An error occurred while querying reservations');
          }
          // Set empty data
          setReservations([]);
          setMetadata({
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          });
        }
      } catch (err) {
        console.error('Error fetching digital reservations:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while processing reservations');
        // Set empty data
        setReservations([]);
      } finally {
        setLoading(false);
      }
    },
    [filters, supabase]
  );

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const updateFilters = useCallback(
    (newFilters: Partial<DigitalReservationFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchReservations(updatedFilters);
    },
    [filters, fetchReservations]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchReservations(updatedFilters);
    },
    [filters, fetchReservations]
  );

  const createReservation = useCallback(
    async (data: CreateDigitalReservationDto) => {
      try {
        setLoading(true);
        setError(null);

        // Check if the resource is available for the requested time
        const { data: resource, error: resourceError } = await supabase
          .from('digital_resources')
          .select('id, digital_resource_name')
          .eq('id', data.digital_resource_id)
          .single();

        if (resourceError) throw resourceError;

        // Get sharing policy for this resource to check if approval is required
        const { data: policy, error: policyError } = await supabase
          .from('digital_sharing_policies')
          .select('approval_required, max_concurrent_users')
          .eq('digital_resource_id', data.digital_resource_id)
          .single();

        if (policyError && policyError.code !== 'PGRST116') {
          // PGRST116 is "no rows returned" which is fine - it means no policy
          throw policyError;
        }

        // Check availability if there's a limit on concurrent users
        if (policy && policy.max_concurrent_users) {
          try {
            // Try to use the RPC function if it exists
            const { data: conflicts, error: conflictError } = await supabase.rpc(
              'check_digital_reservation_conflict',
              {
                p_digital_resource_id: data.digital_resource_id,
                p_start_datetime: data.reservation_start,
                p_end_datetime: data.reservation_end,
                p_max_concurrent_users: policy.max_concurrent_users,
                p_reservation_id: null
              }
            );

            if (conflictError) {
              console.warn('RPC function error, falling back to manual check:', conflictError);
              // Fall back to manual check
            } else if (conflicts) {
              toast.error('This digital resource is not available for the requested time');
              return null;
            }
          } catch (rpcError) {
            console.warn('RPC function not available, falling back to manual check:', rpcError);
            // Fall back to manual check - query existing reservations that overlap
            const { data: existingReservations, error: reservationsError } = await supabase
              .from('digital_reservations')
              .select('id')
              .eq('digital_resource_id', data.digital_resource_id)
              .eq('status', 'approved')
              .or(`reservation_start.lte.${data.reservation_end},reservation_end.gte.${data.reservation_start}`);

            if (reservationsError) throw reservationsError;

            // Check if the number of concurrent reservations exceeds the limit
            if (existingReservations && existingReservations.length >= policy.max_concurrent_users) {
              toast.error('This digital resource is not available for the requested time');
              return null;
            }
          }
        }

        // Set status based on policy
        const status: ReservationStatus = policy?.approval_required ? 'pending' : 'approved';

        // Create the reservation
        const { data: reservation, error } = await supabase
          .from('digital_reservations')
          .insert({
            digital_resource_id: data.digital_resource_id,
            user_id: data.user_id,
            title: data.title,
            purpose: data.purpose,
            reservation_start: data.reservation_start,
            reservation_end: data.reservation_end,
            is_recurring: data.is_recurring || false,
            status
          })
          .select()
          .single();

        if (error) throw error;

        // Refresh the list
        fetchReservations();
        
        toast.success('Reservation created successfully');
        return reservation;
      } catch (err) {
        console.error('Error creating digital reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to create reservation');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [supabase, fetchReservations]
  );

  const updateReservation = useCallback(
    async (id: string, data: UpdateDigitalReservationDto) => {
      try {
        setLoading(true);
        setError(null);

        // If changing dates, check availability
        if (data.reservation_start || data.reservation_end) {
          // Get the current reservation to fill in missing data
          const { data: currentReservation, error: fetchError } = await supabase
            .from('digital_reservations')
            .select('digital_resource_id, reservation_start, reservation_end')
            .eq('id', id)
            .single();

          if (fetchError) throw fetchError;

          // Get sharing policy for this resource
          const { data: policy, error: policyError } = await supabase
            .from('digital_sharing_policies')
            .select('max_concurrent_users')
            .eq('digital_resource_id', currentReservation.digital_resource_id)
            .single();

          if (policyError && policyError.code !== 'PGRST116') {
            throw policyError;
          }

          if (policy && policy.max_concurrent_users) {
            // Check availability with new dates
            const { data: conflicts, error: conflictError } = await supabase.rpc(
              'check_digital_reservation_conflict',
              {
                p_digital_resource_id: currentReservation.digital_resource_id,
                p_start_datetime: data.reservation_start || currentReservation.reservation_start,
                p_end_datetime: data.reservation_end || currentReservation.reservation_end,
                p_max_concurrent_users: policy.max_concurrent_users,
                p_reservation_id: id
              }
            );

            if (conflictError) throw conflictError;

            if (conflicts) {
              toast.error('This digital resource is not available for the requested time');
              return null;
            }
          }
        }

        // Update the reservation
        const { data: reservation, error } = await supabase
          .from('digital_reservations')
          .update({
            digital_resource_id: data.digital_resource_id,
            user_id: data.user_id,
            title: data.title,
            purpose: data.purpose,
            reservation_start: data.reservation_start,
            reservation_end: data.reservation_end,
            status: data.status,
            license_key: data.license_key,
            approver_id: data.approver_id,
            approval_datetime: data.approval_datetime,
            is_recurring: data.is_recurring
          })
          .eq('id', id)
          .select('*')
          .single();

        if (error) throw error;

        // Refresh the list
        fetchReservations();
        toast.success('Digital reservation updated successfully');
        return reservation as DigitalReservation;
      } catch (err) {
        console.error('Error updating digital reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to update digital reservation');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations, supabase]
  );

  const deleteReservation = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);

        const { error } = await supabase
          .from('digital_reservations')
          .delete()
          .eq('id', id);

        if (error) throw error;

        // Refresh the list
        fetchReservations();
        toast.success('Digital reservation deleted successfully');
        return true;
      } catch (err) {
        console.error('Error deleting digital reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to delete digital reservation');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations, supabase]
  );

  const approveReservation = useCallback(
    async (id: string, approverId: string) => {
      try {
        setLoading(true);
        setError(null);

        const { data: reservation, error } = await supabase
          .from('digital_reservations')
          .update({
            status: 'approved',
            approver_id: approverId,
            approval_datetime: new Date().toISOString()
          })
          .eq('id', id)
          .select('*')
          .single();

        if (error) throw error;

        // Refresh the list
        fetchReservations();
        toast.success('Digital reservation approved successfully');
        return reservation as DigitalReservation;
      } catch (err) {
        console.error('Error approving digital reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to approve digital reservation');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations, supabase]
  );

  const rejectReservation = useCallback(
    async (id: string, approverId: string) => {
      try {
        setLoading(true);
        setError(null);

        const { data: reservation, error } = await supabase
          .from('digital_reservations')
          .update({
            status: 'rejected',
            approver_id: approverId,
            approval_datetime: new Date().toISOString()
          })
          .eq('id', id)
          .select('*')
          .single();

        if (error) throw error;

        // Refresh the list
        fetchReservations();
        toast.success('Digital reservation rejected successfully');
        return reservation as DigitalReservation;
      } catch (err) {
        console.error('Error rejecting digital reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to reject digital reservation');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations, supabase]
  );

  return {
    reservations,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchReservations,
    createReservation,
    updateReservation,
    deleteReservation,
    approveReservation,
    rejectReservation
  };
}
