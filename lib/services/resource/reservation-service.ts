// lib/services/resource/reservation-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  Reservation,
  CreateReservationDto,
  UpdateReservationDto,
  ReservationFilters,
  ReservationListResponse
} from '@/types/resources';
import { ResourceService } from './resource-service';

export class ReservationService {
  private static supabase = createClientComponentClient();

  static async createReservation(
    data: CreateReservationDto
  ): Promise<Reservation> {
    try {
      // First check if the resource is available for the requested time
      const isAvailable = await ResourceService.checkResourceAvailability(
        data.resource_id,
        data.start_datetime,
        data.end_datetime
      );

      if (!isAvailable) {
        throw new Error('Resource is not available for the requested time');
      }

      const { data: reservation, error } = await this.supabase
        .from('reservations')
        .insert({
          resource_id: data.resource_id,
          user_id: data.user_id,
          title: data.title,
          description: data.description,
          start_datetime: data.start_datetime,
          end_datetime: data.end_datetime,
          status: data.status || 'pending',
          purpose: data.purpose,
          requester_institution_id: data.requester_institution_id,
          requester_department_id: data.requester_department_id,
          notes: data.notes,
          recurring_pattern: data.recurring_pattern
        })
        .select('*')
        .single();

      if (error) throw error;
      return reservation as Reservation;
    } catch (error) {
      console.error('Error creating reservation:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create reservation'
      );
      throw error;
    }
  }

  static async updateReservation(
    id: string,
    data: UpdateReservationDto
  ): Promise<Reservation> {
    try {
      // If updating dates, check availability
      if (data.start_datetime && data.end_datetime) {
        const isAvailable = await ResourceService.checkResourceAvailability(
          data.resource_id!,
          data.start_datetime,
          data.end_datetime,
          id
        );

        if (!isAvailable) {
          throw new Error('Resource is not available for the requested time');
        }
      }

      const { data: reservation, error } = await this.supabase
        .from('reservations')
        .update({
          resource_id: data.resource_id,
          user_id: data.user_id,
          title: data.title,
          description: data.description,
          start_datetime: data.start_datetime,
          end_datetime: data.end_datetime,
          status: data.status,
          purpose: data.purpose,
          requester_institution_id: data.requester_institution_id,
          requester_department_id: data.requester_department_id,
          approver_id: data.approver_id,
          approval_datetime: data.approval_datetime,
          notes: data.notes,
          recurring_pattern: data.recurring_pattern
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return reservation as Reservation;
    } catch (error) {
      console.error('Error updating reservation:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update reservation'
      );
      throw error;
    }
  }

  static async deleteReservation(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('reservations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting reservation:', error);
      toast.error('Failed to delete reservation');
      throw error;
    }
  }

  static async getReservations(
    filters: ReservationFilters = {}
  ): Promise<ReservationListResponse> {
    try {
      const {
        search,
        resource_id,
        user_id,
        status,
        requester_institution_id,
        requester_department_id,
        start_date,
        end_date,
        page = 1,
        limit = 10
      } = filters;

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Start building the query
      let query = this.supabase.from('reservations').select(
        `
          *,
          resource:resources(id, resource_name, resource_type),
          requester_institution:institutions(id, name),
          requester_department:departments(id, department_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.ilike('title', `%${search}%`);
      }

      if (resource_id) {
        query = query.eq('resource_id', resource_id);
      }

      if (user_id) {
        query = query.eq('user_id', user_id);
      }

      if (status) {
        query = query.eq('status', status);
      }

      if (requester_institution_id) {
        query = query.eq('requester_institution_id', requester_institution_id);
      }

      if (requester_department_id) {
        query = query.eq('requester_department_id', requester_department_id);
      }

      if (start_date) {
        query = query.gte('start_datetime', start_date);
      }

      if (end_date) {
        query = query.lte('end_datetime', end_date);
      }

      // Apply pagination
      query = query.range(from, to);

      // Execute the query
      const { data, error, count } = await query;

      if (error) throw error;

      // Calculate total pages
      const totalPages = count ? Math.ceil(count / limit) : 0;

      return {
        data: data as unknown as Reservation[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching reservations:', error);
      toast.error('Failed to fetch reservations');
      throw error;
    }
  }

  static async getReservation(id: string): Promise<Reservation> {
    try {
      const { data, error } = await this.supabase
        .from('reservations')
        .select(
          `
          *,
          resource:resources(id, resource_name, resource_type),
          requester_institution:institutions(id, name),
          requester_department:departments(id, department_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as Reservation;
    } catch (error) {
      console.error('Error fetching reservation:', error);
      toast.error('Failed to fetch reservation details');
      throw error;
    }
  }

  static async getUserReservations(userId: string): Promise<Reservation[]> {
    try {
      const { data, error } = await this.supabase
        .from('reservations')
        .select(
          `
          *,
          resource:resources(id, resource_name, resource_type),
          requester_institution:institutions(id, name),
          requester_department:departments(id, department_name)
        `
        )
        .eq('user_id', userId)
        .order('start_datetime', { ascending: true });

      if (error) throw error;
      return data as unknown as Reservation[];
    } catch (error) {
      console.error('Error fetching user reservations:', error);
      toast.error('Failed to fetch your reservations');
      throw error;
    }
  }

  static async getResourceReservations(
    resourceId: string,
    startDate: string,
    endDate: string
  ): Promise<Reservation[]> {
    try {
      const { data, error } = await this.supabase
        .from('reservations')
        .select(
          `
          *,
          resource:resources(id, resource_name, resource_type),
          requester_institution:institutions(id, name),
          requester_department:departments(id, department_name)
        `
        )
        .eq('resource_id', resourceId)
        .gte('start_datetime', startDate)
        .lte('end_datetime', endDate)
        .in('status', ['pending', 'approved'])
        .order('start_datetime', { ascending: true });

      if (error) throw error;
      return data as unknown as Reservation[];
    } catch (error) {
      console.error('Error fetching resource reservations:', error);
      toast.error('Failed to fetch resource schedule');
      throw error;
    }
  }

  static async approveReservation(
    id: string,
    approverId: string
  ): Promise<Reservation> {
    try {
      const { data, error } = await this.supabase
        .from('reservations')
        .update({
          status: 'approved',
          approver_id: approverId,
          approval_datetime: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as Reservation;
    } catch (error) {
      console.error('Error approving reservation:', error);
      toast.error('Failed to approve reservation');
      throw error;
    }
  }

  static async rejectReservation(
    id: string,
    approverId: string,
    notes?: string
  ): Promise<Reservation> {
    try {
      const { data, error } = await this.supabase
        .from('reservations')
        .update({
          status: 'rejected',
          approver_id: approverId,
          approval_datetime: new Date().toISOString(),
          notes: notes
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as Reservation;
    } catch (error) {
      console.error('Error rejecting reservation:', error);
      toast.error('Failed to reject reservation');
      throw error;
    }
  }

  static async cancelReservation(id: string): Promise<Reservation> {
    try {
      const { data, error } = await this.supabase
        .from('reservations')
        .update({
          status: 'canceled'
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as Reservation;
    } catch (error) {
      console.error('Error canceling reservation:', error);
      toast.error('Failed to cancel reservation');
      throw error;
    }
  }

  static async completeReservation(id: string): Promise<Reservation> {
    try {
      const { data, error } = await this.supabase
        .from('reservations')
        .update({
          status: 'completed'
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as Reservation;
    } catch (error) {
      console.error('Error completing reservation:', error);
      toast.error('Failed to mark reservation as completed');
      throw error;
    }
  }
}
