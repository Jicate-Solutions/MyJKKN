/**
 * list-event-types.ts
 * -------------------
 * Inspection script for jicate-booking-prod EventTypes.
 *
 * Connects to jicate-booking-prod (Supabase project_ref fkihmsuwruohdgsqvnxg)
 * via direct Postgres connection and prints INSERT statements for every active
 * (hidden=false) EventType row. The output is designed to be piped or
 * copy-pasted directly into the seed migration file:
 *
 *   supabase/migrations/<TIMESTAMP>_seed_jicate_booking_meeting_types.sql
 *
 * USAGE
 * -----
 * Run from the MyJKKN project root after setting the env var:
 *
 *   JICATE_BOOKING_DB_URL="postgresql://postgres.fkihmsuwruohdgsqvnxg:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" \
 *     npx tsx scripts/jicate-booking/list-event-types.ts
 *
 * Connection string template:
 *   postgresql://postgres.fkihmsuwruohdgsqvnxg:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
 *
 * The password is the Supabase DB password for jicate-booking-prod
 * (project_ref fkihmsuwruohdgsqvnxg). Find it in 1Password under
 * "jicate-booking Supabase" or in Supabase Dashboard → Settings → Database.
 *
 * EXIT CODES
 * ----------
 *   0 — success, INSERT statements printed to stdout
 *   2 — connection error (bad URL, wrong password, network issue)
 *   3 — no active EventType rows found (table empty or all hidden=true)
 *
 * PROPOSAL HEURISTICS
 * -------------------
 * The script proposes internal_kind and meeting_for based on slug patterns:
 *   slug contains 'counsel'  → internal_kind='admission_call',  meeting_for='counselor'
 *   slug contains 'parent'   → internal_kind='parent_meeting',  meeting_for='counselor'
 *   slug contains 'office'   → internal_kind='office_hours',    meeting_for='faculty'
 *   slug contains 'advisor'  → internal_kind='advisor_session', meeting_for='faculty'
 *   slug contains 'faculty'  → internal_kind='advisor_session', meeting_for='faculty'
 *   slug contains 'staff'    → internal_kind='office_hours',    meeting_for='staff'
 *   slug contains 'admin'    → internal_kind='office_hours',    meeting_for='admin'
 *   (no match)               → internal_kind='other',           meeting_for='counselor'
 *
 * ALL PROPOSALS ARE MARKED WITH "-- PROPOSAL" COMMENTS. Human review is
 * mandatory before merging. Do not trust these values blindly.
 *
 * NOTE: This script requires the `pg` package. Install with:
 *   npm install pg @types/pg
 * or run with:
 *   npx --yes tsx ... (tsx handles the import automatically if pg is present)
 */

import { Client } from 'pg';

// ---------------------------------------------------------------------------
// Slug-to-category heuristics
// ---------------------------------------------------------------------------

type InternalKind = 'advisor_session' | 'parent_meeting' | 'office_hours' | 'admission_call' | 'other';
type MeetingFor = 'counselor' | 'faculty' | 'staff' | 'admin';

interface Classification {
  internal_kind: InternalKind;
  meeting_for: MeetingFor;
}

function classifyBySlug(slug: string): Classification {
  const s = slug.toLowerCase();

  if (s.includes('counsel')) {
    return { internal_kind: 'admission_call', meeting_for: 'counselor' };
  }
  if (s.includes('parent')) {
    return { internal_kind: 'parent_meeting', meeting_for: 'counselor' };
  }
  if (s.includes('advisor') || s.includes('adviser')) {
    return { internal_kind: 'advisor_session', meeting_for: 'faculty' };
  }
  if (s.includes('faculty') || s.includes('professor')) {
    return { internal_kind: 'advisor_session', meeting_for: 'faculty' };
  }
  if (s.includes('office')) {
    return { internal_kind: 'office_hours', meeting_for: 'faculty' };
  }
  if (s.includes('staff')) {
    return { internal_kind: 'office_hours', meeting_for: 'staff' };
  }
  if (s.includes('admin')) {
    return { internal_kind: 'office_hours', meeting_for: 'admin' };
  }

  // No pattern match — default to 'other' with counselor ownership (most
  // bookings in JKKN context are counselor-side admission calls)
  return { internal_kind: 'other', meeting_for: 'counselor' };
}

// ---------------------------------------------------------------------------
// SQL escaping helpers (safe for values we control from Supabase/Prisma rows)
// ---------------------------------------------------------------------------

function sqlStr(val: string): string {
  // Escape single quotes by doubling them (standard SQL)
  return `'${val.replace(/'/g, "''")}'`;
}

function sqlInt(val: number): string {
  return String(Math.trunc(val));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface EventTypeRow {
  id: number;
  slug: string;
  title: string;
  length: number;
  userId: number | null;
  teamId: number | null;
}

async function main(): Promise<void> {
  const dbUrl = process.env.JICATE_BOOKING_DB_URL;

  if (!dbUrl) {
    console.error(
      '[list-event-types] ERROR: JICATE_BOOKING_DB_URL env var not set.\n' +
      'Set it to: postgresql://postgres.fkihmsuwruohdgsqvnxg:<password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'
    );
    process.exit(2);
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[list-event-types] ERROR: Connection failed — ${msg}`);
    console.error('Check JICATE_BOOKING_DB_URL, password, and network access to aws-1-ap-south-1.pooler.supabase.com');
    process.exit(2);
  }

  let rows: EventTypeRow[];

  try {
    const result = await client.query<EventTypeRow>(
      `SELECT id, slug, title, length, "userId", "teamId"
       FROM "EventType"
       WHERE hidden = false
       ORDER BY id`
    );
    rows = result.rows;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[list-event-types] ERROR: Query failed — ${msg}`);
    await client.end();
    process.exit(2);
  }

  await client.end();

  if (rows.length === 0) {
    console.error('[list-event-types] ERROR: No active (hidden=false) EventType rows found.');
    console.error('Either the jicate-booking-prod database has no EventTypes, or all are hidden.');
    process.exit(3);
  }

  // ---------------------------------------------------------------------------
  // Emit SQL
  // ---------------------------------------------------------------------------

  console.log('-- =============================================================================');
  console.log('-- AUTO-GENERATED by scripts/jicate-booking/list-event-types.ts');
  console.log(`-- Generated at: ${new Date().toISOString()}`);
  console.log('-- Source: jicate-booking-prod (project_ref fkihmsuwruohdgsqvnxg)');
  console.log('--');
  console.log('-- IMPORTANT: All internal_kind and meeting_for values are PROPOSALS based on');
  console.log('-- slug heuristics. Review each row before committing. Edit proposals in-place.');
  console.log('-- Lines marked "-- PROPOSAL" need human confirmation.');
  console.log('-- =============================================================================');
  console.log('');

  for (const row of rows) {
    const { internal_kind, meeting_for } = classifyBySlug(row.slug);

    const ownerNote = row.teamId != null
      ? `team_id=${row.teamId}`
      : row.userId != null
        ? `user_id=${row.userId}`
        : 'no owner';

    console.log(`-- EventType id=${row.id}  slug=${row.slug}  length=${row.length}min  owner: ${ownerNote}`);
    console.log(
      `INSERT INTO public.jicate_booking_meeting_types` +
      ` (cal_event_type_id, cal_event_type_slug, internal_kind, meeting_for, display_name, is_active)` +
      ` VALUES (` +
        `${sqlInt(row.id)},` +
        ` ${sqlStr(row.slug)},` +
        ` ${sqlStr(internal_kind)}, -- PROPOSAL: based on slug heuristic` +
        ` ${sqlStr(meeting_for)}, -- PROPOSAL: based on slug heuristic` +
        ` ${sqlStr(row.title)},` +
        ` true` +
      `)` +
      ` ON CONFLICT (cal_event_type_id) DO UPDATE SET` +
      ` cal_event_type_slug = EXCLUDED.cal_event_type_slug,` +
      ` display_name = EXCLUDED.display_name,` +
      ` is_active = EXCLUDED.is_active,` +
      ` updated_at = now();`
    );
    console.log('');
  }

  console.log(`-- Total rows emitted: ${rows.length}`);
}

main().catch((err) => {
  console.error('[list-event-types] Unhandled error:', err);
  process.exit(2);
});
