// Event sources — "create this event FROM an existing record in another module".
//
// A source is any module record that an event is the public face of (a CDC
// campus drive today; others plug in here). Picking one prefills the wizard and
// the link is stored on the event as `config.source = { type, id, label }`, so
// the owning module can find its event later. No schema change — `events.config`
// already exists.
//
// To add a source: extend EventSourceType, add an EVENT_SOURCES entry, write a
// prefillFrom<X>() mapper, and give source-picker.tsx a record list for it.

import type { CdcDrive } from '@/types/cdc';
import type { EventHome } from '@/types/events-presets';
import type { EventCreateForm } from './event-create-form';

export type EventSourceType = 'cdc_drive';

/** What gets written to `events.config.source`. */
export interface EventSourceLink {
  type: EventSourceType;
  id: string;
  /** Record title at link time, so the console can label it without a lookup. */
  label: string;
}

export interface EventSourceDef {
  type: EventSourceType;
  label: string;
  description: string;
  /** The module home an event from this source is filed under. */
  home: EventHome;
}

export const EVENT_SOURCES: EventSourceDef[] = [
  {
    type: 'cdc_drive',
    label: 'Campus drive',
    description: 'Prefill from a CDC campus drive — title, date, hours and venue.',
    home: 'cdc',
  },
];

export interface EventSourcePrefill {
  source: EventSourceLink;
  form: Partial<EventCreateForm>;
  /** null = leave the on/off-campus switch as it is. */
  offCampus: boolean | null;
  /** On-campus room NAME to resolve to a Resource Management room id. */
  roomName: string | null;
}

/** "10:00:00" → "10:00" for <input type="time">. */
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

export function prefillFromCdcDrive(drive: CdcDrive): EventSourcePrefill {
  const offCampus = drive.drive_mode === 'off_campus';
  const place = drive.venue_label?.trim() || '';
  const tagline = [drive.job_role_title, drive.job_location].filter(Boolean).join(' · ');

  return {
    source: { type: 'cdc_drive', id: drive.id, label: drive.title },
    form: {
      name: drive.title,
      ...(drive.description ? { description: drive.description } : {}),
      ...(tagline ? { tagline } : {}),
      theme: 'Campus Recruitment',
      event_date: drive.drive_date ?? '',
      start_time: hhmm(drive.drive_start_time),
      end_time: hhmm(drive.drive_end_time),
      ...(offCampus
        ? { venue: place || drive.job_location || '', venue_address: drive.job_location ?? '' }
        : {}),
    },
    offCampus,
    roomName: offCampus ? null : place || null,
  };
}
