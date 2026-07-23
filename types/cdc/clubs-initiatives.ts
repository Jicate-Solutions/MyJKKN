// types/cdc/clubs-initiatives.ts
// CDC Club Initiatives (BUG-004299) — type definitions derived from live DB schema.
// One row per initiative; many initiatives per club (cdc_club_initiatives).

export type CdcClubInitiativeStatus = 'planned' | 'wip' | 'launched';

export const CDC_CLUB_INITIATIVE_STATUSES: CdcClubInitiativeStatus[] = [
  'planned',
  'wip',
  'launched',
];

export const CDC_CLUB_INITIATIVE_STATUS_LABELS: Record<CdcClubInitiativeStatus, string> = {
  planned: 'Planned',
  wip: 'In progress',
  launched: 'Launched',
};

export interface CdcClubInitiative {
  id: string;
  club_id: string;
  institution_id: string | null;
  title: string;
  status: CdcClubInitiativeStatus;
  start_date: string | null; // ISO date
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CreateClubInitiativeDto {
  club_id: string;
  institution_id?: string | null;
  title: string;
  status?: CdcClubInitiativeStatus;
  start_date?: string | null;
  notes?: string | null;
}

export interface UpdateClubInitiativeDto {
  title?: string;
  status?: CdcClubInitiativeStatus;
  start_date?: string | null;
  notes?: string | null;
}
