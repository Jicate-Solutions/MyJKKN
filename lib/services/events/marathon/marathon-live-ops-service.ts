// lib/services/events/marathon/marathon-live-ops-service.ts
// Marathon Live Ops service — real-time race day operations: GPS tracking, checkpoints,
// incidents, volunteers.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonRaceTrack,
  MarathonCheckpoint,
  MarathonCheckpointScan,
  MarathonIncident,
  MarathonVolunteerCheckin,
  CreateMarathonIncidentDto,
  GPSSyncPayload,
  CheckpointScanPayload,
} from '@/types/events-marathon';

// ============================================================================
// Types
// ============================================================================

export interface CheckpointThroughput {
  checkpoint_id: string;
  checkpoint_name: string;
  checkpoint_type: string;
  distance_km: number;
  scan_count: number;
}

export interface LiveOpsStats {
  total_tracking: number;
  on_course: number;
  finished: number;
  avg_pace: number;
}

export interface LiveOpsData {
  runners: MarathonRaceTrack[];
  checkpoint_throughput: CheckpointThroughput[];
  active_incidents: MarathonIncident[];
  volunteer_status: MarathonVolunteerCheckin[];
  stats: LiveOpsStats;
  stationary_alerts: MarathonRaceTrack[];
}

export interface RunnerDetail {
  position: MarathonRaceTrack | null;
  checkpoints: MarathonCheckpointScan[];
  registration: any;
}

// ============================================================================
// Service
// ============================================================================

export class MarathonLiveOpsService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Main Data Fetch
  // --------------------------------------------------------------------------

  /**
   * Fetch everything needed for the live ops command center in parallel.
   */
  static async getLiveOpsData(eventId: string): Promise<LiveOpsData> {
    try {
      const [runners, checkpointThroughput, activeIncidents, volunteerStatus] =
        await Promise.all([
          this.getRunnerPositions(eventId),
          this.getCheckpointThroughput(eventId),
          this.getIncidents(eventId),
          this.getVolunteers(eventId),
        ]);

      // Compute stats from runners
      const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const stationaryAlerts = runners.filter(
        (r) => r.updated_at < threeMinAgo
      );

      // A runner is "finished" if their distance_km >= the max checkpoint distance
      // For simplicity, check if distance > 0 and pace is 0 (finished runners stop tracking)
      // We use a heuristic: finished = pace_per_km === 0 and distance > 0
      const finished = runners.filter(
        (r) => r.pace_per_km === 0 && r.distance_km > 0
      ).length;
      const onCourse = runners.length - finished;
      const pacedRunners = runners.filter((r) => r.pace_per_km > 0);
      const avgPace =
        pacedRunners.length > 0
          ? pacedRunners.reduce((sum, r) => sum + r.pace_per_km, 0) /
            pacedRunners.length
          : 0;

      return {
        runners,
        checkpoint_throughput: checkpointThroughput,
        active_incidents: activeIncidents.filter(
          (i) => i.status !== 'resolved' && i.status !== 'closed'
        ),
        volunteer_status: volunteerStatus,
        stats: {
          total_tracking: runners.length,
          on_course: onCourse,
          finished,
          avg_pace: Math.round(avgPace * 100) / 100,
        },
        stationary_alerts: stationaryAlerts,
      };
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Failed to fetch live ops data', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // GPS Data
  // --------------------------------------------------------------------------

  /**
   * Get current positions for all runners in an event.
   */
  static async getRunnerPositions(eventId: string): Promise<MarathonRaceTrack[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_race_tracks')
        .select('*')
        .eq('event_id', eventId)
        .order('distance_km', { ascending: false });

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to fetch runner positions', error);
        throw error;
      }

      return (data as unknown as MarathonRaceTrack[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in getRunnerPositions', error);
      throw error;
    }
  }

  /**
   * Get runners with no GPS update for more than `thresholdMinutes` minutes.
   */
  static async getStationaryAlerts(
    eventId: string,
    thresholdMinutes = 3
  ): Promise<MarathonRaceTrack[]> {
    try {
      const threshold = new Date(
        Date.now() - thresholdMinutes * 60 * 1000
      ).toISOString();

      const { data, error } = await (this.supabase as any)
        .from('marathon_race_tracks')
        .select('*')
        .eq('event_id', eventId)
        .lt('updated_at', threshold)
        .order('updated_at', { ascending: true });

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to fetch stationary alerts', error);
        throw error;
      }

      return (data as unknown as MarathonRaceTrack[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in getStationaryAlerts', error);
      throw error;
    }
  }

  /**
   * Sync GPS position from external app — UPSERT race track + INSERT track points.
   */
  static async syncGPSPosition(payload: GPSSyncPayload): Promise<void> {
    try {
      // Upsert the current position in marathon_race_tracks
      const { error: upsertError } = await (this.supabase as any)
        .from('marathon_race_tracks')
        .upsert(
          {
            event_id: payload.event_id,
            bib: payload.bib,
            lat: payload.lat,
            lng: payload.lng,
            distance_km: payload.distance_km,
            pace_per_km: payload.pace_per_km,
            elapsed_seconds: payload.elapsed_seconds,
            altitude: payload.altitude ?? null,
            heading: payload.heading ?? null,
            speed: payload.speed ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'event_id,bib' }
        );

      if (upsertError) {
        logger.error('events/marathon-live-ops', 'Failed to upsert race track', upsertError);
        throw upsertError;
      }

      // Insert track points if provided
      if (payload.points && payload.points.length > 0) {
        const pointRows = payload.points.map((p) => ({
          event_id: payload.event_id,
          bib: payload.bib,
          lat: p.lat,
          lng: p.lng,
          speed: p.speed ?? null,
          accuracy: p.accuracy ?? null,
          altitude: p.altitude ?? null,
          timestamp: p.timestamp,
        }));

        const { error: pointsError } = await (this.supabase as any)
          .from('marathon_race_track_points')
          .insert(pointRows);

        if (pointsError) {
          logger.warn('events/marathon-live-ops', 'Failed to insert track points', pointsError);
          // Non-critical — don't throw
        }
      }

      logger.info('events/marathon-live-ops', 'GPS position synced', {
        eventId: payload.event_id,
        bib: payload.bib,
      });
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in syncGPSPosition', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Checkpoints
  // --------------------------------------------------------------------------

  /**
   * Get all checkpoints for an event, ordered by distance.
   */
  static async getCheckpoints(eventId: string): Promise<MarathonCheckpoint[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_checkpoints')
        .select('*')
        .eq('event_id', eventId)
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to fetch checkpoints', error);
        throw error;
      }

      return (data as unknown as MarathonCheckpoint[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in getCheckpoints', error);
      throw error;
    }
  }

  /**
   * Get checkpoint throughput — scan counts per checkpoint.
   */
  static async getCheckpointThroughput(eventId: string): Promise<CheckpointThroughput[]> {
    try {
      // Fetch checkpoints
      const checkpoints = await this.getCheckpoints(eventId);

      // Fetch all scans for this event
      const { data: scans, error: scanError } = await (this.supabase as any)
        .from('marathon_checkpoint_scans')
        .select('checkpoint_id')
        .eq('event_id', eventId);

      if (scanError) {
        logger.error('events/marathon-live-ops', 'Failed to fetch checkpoint scans', scanError);
        throw scanError;
      }

      // Count scans per checkpoint
      const scanCounts = new Map<string, number>();
      for (const scan of (scans ?? []) as any[]) {
        scanCounts.set(
          scan.checkpoint_id,
          (scanCounts.get(scan.checkpoint_id) ?? 0) + 1
        );
      }

      return checkpoints.map((cp) => ({
        checkpoint_id: cp.id,
        checkpoint_name: cp.name,
        checkpoint_type: cp.type,
        distance_km: cp.distance_from_start_km ?? 0,
        scan_count: scanCounts.get(cp.id) ?? 0,
      }));
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in getCheckpointThroughput', error);
      throw error;
    }
  }

  /**
   * Record a checkpoint scan.
   */
  static async scanCheckpoint(payload: CheckpointScanPayload): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_checkpoint_scans')
        .insert([
          {
            event_id: payload.event_id,
            bib_number: payload.bib_number,
            checkpoint_id: payload.checkpoint_id,
            scanned_at: new Date().toISOString(),
            lat: payload.lat ?? null,
            lng: payload.lng ?? null,
          },
        ]);

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to scan checkpoint', error);
        throw error;
      }

      logger.info('events/marathon-live-ops', 'Checkpoint scanned', {
        bib: payload.bib_number,
        checkpoint: payload.checkpoint_id,
      });
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in scanCheckpoint', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Incidents
  // --------------------------------------------------------------------------

  /**
   * Get all incidents for an event, newest first.
   */
  static async getIncidents(eventId: string): Promise<MarathonIncident[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_incidents')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to fetch incidents', error);
        throw error;
      }

      return (data as unknown as MarathonIncident[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in getIncidents', error);
      throw error;
    }
  }

  /**
   * Create a new incident.
   */
  static async createIncident(dto: CreateMarathonIncidentDto): Promise<MarathonIncident> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_incidents')
        .insert([
          {
            event_id: dto.event_id,
            type: dto.type,
            severity: dto.severity,
            title: dto.title,
            description: dto.description ?? null,
            location: dto.location ?? null,
            lat: dto.lat ?? null,
            lng: dto.lng ?? null,
            bib_number: dto.bib_number ?? null,
            status: 'reported',
          },
        ])
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to create incident', error);
        throw error;
      }

      logger.info('events/marathon-live-ops', 'Incident created', {
        id: data.id,
        type: dto.type,
        severity: dto.severity,
      });

      return data as unknown as MarathonIncident;
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in createIncident', error);
      throw error;
    }
  }

  /**
   * Resolve an incident with resolution notes.
   */
  static async resolveIncident(
    id: string,
    resolutionNotes: string
  ): Promise<MarathonIncident> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_incidents')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to resolve incident', { id, error });
        throw error;
      }

      logger.info('events/marathon-live-ops', 'Incident resolved', { id });
      return data as unknown as MarathonIncident;
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in resolveIncident', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Volunteers
  // --------------------------------------------------------------------------

  /**
   * Get all volunteer check-ins for an event.
   */
  static async getVolunteers(eventId: string): Promise<MarathonVolunteerCheckin[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_volunteer_checkins')
        .select('*')
        .eq('event_id', eventId)
        .order('checked_in_at', { ascending: false });

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to fetch volunteers', error);
        throw error;
      }

      return (data as unknown as MarathonVolunteerCheckin[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in getVolunteers', error);
      throw error;
    }
  }

  /**
   * Check in a volunteer at a station.
   */
  static async checkinVolunteer(dto: {
    event_id: string;
    volunteer_name: string;
    volunteer_phone?: string;
    station: string;
    role?: string;
  }): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_volunteer_checkins')
        .insert([
          {
            event_id: dto.event_id,
            volunteer_name: dto.volunteer_name,
            volunteer_phone: dto.volunteer_phone ?? null,
            station: dto.station,
            role: dto.role ?? null,
            checked_in_at: new Date().toISOString(),
          },
        ]);

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to check in volunteer', error);
        throw error;
      }

      logger.info('events/marathon-live-ops', 'Volunteer checked in', {
        name: dto.volunteer_name,
        station: dto.station,
      });
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in checkinVolunteer', error);
      throw error;
    }
  }

  /**
   * Check out a volunteer.
   */
  static async checkoutVolunteer(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_volunteer_checkins')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        logger.error('events/marathon-live-ops', 'Failed to check out volunteer', { id, error });
        throw error;
      }

      logger.info('events/marathon-live-ops', 'Volunteer checked out', { id });
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in checkoutVolunteer', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Runner Detail
  // --------------------------------------------------------------------------

  /**
   * Get detailed information for a single runner by BIB number.
   */
  static async getRunnerDetail(
    eventId: string,
    bib: string
  ): Promise<RunnerDetail> {
    try {
      // Fetch position, checkpoint scans, and registration in parallel
      const [positionResult, scansResult, registrationResult] = await Promise.all([
        (this.supabase as any)
          .from('marathon_race_tracks')
          .select('*')
          .eq('event_id', eventId)
          .eq('bib', bib)
          .maybeSingle(),
        (this.supabase as any)
          .from('marathon_checkpoint_scans')
          .select('*, checkpoint:marathon_checkpoints(*)')
          .eq('event_id', eventId)
          .eq('bib_number', bib)
          .order('scanned_at', { ascending: true }),
        (this.supabase as any)
          .from('events_registrations')
          .select('*, category:event_categories(*)')
          .eq('event_id', eventId)
          .eq('bib_number', bib)
          .maybeSingle(),
      ]);

      if (positionResult.error) {
        logger.warn('events/marathon-live-ops', 'Failed to fetch runner position', positionResult.error);
      }
      if (scansResult.error) {
        logger.warn('events/marathon-live-ops', 'Failed to fetch runner scans', scansResult.error);
      }
      if (registrationResult.error) {
        logger.warn('events/marathon-live-ops', 'Failed to fetch runner registration', registrationResult.error);
      }

      return {
        position: (positionResult.data as unknown as MarathonRaceTrack) ?? null,
        checkpoints: (scansResult.data as unknown as MarathonCheckpointScan[]) ?? [],
        registration: registrationResult.data ?? null,
      };
    } catch (error) {
      logger.error('events/marathon-live-ops', 'Unexpected error in getRunnerDetail', error);
      throw error;
    }
  }
}
