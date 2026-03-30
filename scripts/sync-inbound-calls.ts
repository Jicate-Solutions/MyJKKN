/**
 * One-off script to pull inbound call records from Exotel CDR API.
 * Usage: npx tsx scripts/sync-inbound-calls.ts [--days=7] [--dry-run]
 *
 * Loads .env, calls Exotel API, and inserts records into Supabase.
 */

import 'dotenv/config';

const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY!;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN!;
const EXOTEL_ACCOUNT_SID = process.env.EXOTEL_ACCOUNT_SID!;
const EXOTEL_SUBDOMAIN = process.env.EXOTEL_SUBDOMAIN || 'api.in.exotel.com';

const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days='));
const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 7;
const dryRun = args.includes('--dry-run');

async function main() {
  console.log('=== Exotel Inbound CDR Sync ===');
  console.log(`Account SID: ${EXOTEL_ACCOUNT_SID}`);
  console.log(`Subdomain: ${EXOTEL_SUBDOMAIN}`);
  console.log(`Days: ${days}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  if (!EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_ACCOUNT_SID) {
    console.error('Missing EXOTEL credentials in .env');
    process.exit(1);
  }

  // Calculate date range
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const fromStr = fromDate.toISOString().substring(0, 10);
  const toStr = toDate.toISOString().substring(0, 10);

  console.log(`Fetching inbound calls from ${fromStr} to ${toStr}...`);
  console.log('');

  const authHeader = 'Basic ' + Buffer.from(`${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}`).toString('base64');
  const baseUrl = `https://${EXOTEL_SUBDOMAIN}/v1/Accounts/${EXOTEL_ACCOUNT_SID}`;

  // Build query params
  const params = new URLSearchParams();
  params.set('DateCreated', `gte:${fromStr} 00:00:00;lte:${toStr} 23:59:59`);
  params.set('Direction', 'inbound');
  params.set('PageSize', '100');
  params.set('SortBy', 'DateCreated:desc');
  params.set('details', 'true');

  let url: string | null = `${baseUrl}/Calls.json?${params.toString()}`;
  let totalRecords = 0;
  let pageNum = 0;
  const allCalls: any[] = [];

  while (url && pageNum < 50) {
    pageNum++;
    console.log(`Fetching page ${pageNum}...`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`API error ${response.status}: ${text}`);
        break;
      }

      const data = await response.json();
      const calls = data.Calls || [];
      const metadata = data.Metadata || {};

      console.log(`  Page ${pageNum}: ${calls.length} records (Total: ${metadata.Total || 'unknown'})`);

      for (const call of calls) {
        totalRecords++;
        allCalls.push(call);

        const status = call.Status || 'unknown';
        const duration = call.Duration || '0';
        const from = call.From || 'unknown';
        const to = call.To || 'unknown';
        const startTime = call.StartTime || call.DateCreated || '';

        console.log(`  [${totalRecords}] ${call.Sid} | ${from} → ${to} | ${status} | ${duration}s | ${startTime}`);
      }

      // Follow pagination
      const nextUri = metadata.NextPageUri;
      if (nextUri && calls.length === 100) {
        // NextPageUri might be relative or absolute
        url = nextUri.startsWith('http') ? nextUri : `https://${EXOTEL_SUBDOMAIN}${nextUri}`;
      } else {
        url = null;
      }
    } catch (err) {
      console.error(`Fetch error on page ${pageNum}:`, err);
      break;
    }
  }

  console.log('');
  console.log(`=== Summary ===`);
  console.log(`Total inbound records fetched: ${totalRecords}`);

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  allCalls.forEach(c => {
    const s = (c.Status || 'unknown').toLowerCase();
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  console.log('Status breakdown:', statusCounts);

  if (dryRun) {
    console.log('\n[DRY RUN] No data written to database.');
    return;
  }

  if (totalRecords === 0) {
    console.log('\nNo inbound calls found in this date range.');
    return;
  }

  // Insert into database via Supabase
  console.log('\nInserting into database...');

  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    console.log('\nExotel data fetched successfully but could not write to DB.');
    console.log('You can manually trigger sync from the app: POST /api/telephony/inbound-sync');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get institution ID
  const { data: institutions } = await supabase
    .from('institutions')
    .select('id')
    .eq('is_active', true)
    .limit(1);

  const institutionId = institutions?.[0]?.id;
  if (!institutionId) {
    console.error('No active institution found in database.');
    return;
  }

  console.log(`Institution: ${institutionId}`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let matched = 0;

  for (const call of allCalls) {
    const statusMap: Record<string, string> = {
      'queued': 'initiated', 'ringing': 'ringing', 'in-progress': 'in-progress',
      'completed': 'completed', 'busy': 'busy', 'no-answer': 'no-answer',
      'failed': 'failed', 'canceled': 'cancelled', 'cancelled': 'cancelled',
    };

    const mappedStatus = statusMap[call.Status?.toLowerCase()] || 'failed';

    // Try to match lead by phone
    const callerDigits = (call.From || '').replace(/[^0-9]/g, '').slice(-10);
    let leadId = null;

    if (callerDigits.length === 10) {
      const { data: leads } = await supabase
        .from('admission_leads')
        .select('id')
        .eq('institution_id', institutionId)
        .or(`phone.ilike.%${callerDigits},alternate_phone.ilike.%${callerDigits},parent_phone.ilike.%${callerDigits}`)
        .eq('is_active', true)
        .limit(1);

      leadId = leads?.[0]?.id || null;
    }

    // Check if record already exists (partial unique index doesn't support upsert)
    const { data: existing } = await supabase
      .from('admission_call_logs')
      .select('id')
      .eq('call_sid', call.Sid)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('admission_call_logs')
      .insert({
        call_sid: call.Sid,
        institution_id: institutionId,
        direction: 'inbound',
        from_number: call.From || '',
        to_number: call.To || '',
        status: mappedStatus,
        duration_seconds: call.Duration ? parseInt(call.Duration, 10) || 0 : null,
        recording_url: call.RecordingUrl || call.PreSignedRecordingUrl || null,
        cost_amount: call.Price ? parseFloat(call.Price) || 0 : null,
        cost_currency: 'INR',
        started_at: call.StartTime || null,
        ended_at: call.EndTime || null,
        created_at: call.StartTime || new Date().toISOString(),
        lead_id: leadId,
        counselor_id: null,
      });

    if (error) {
      if (error.code === '23505') {
        skipped++;
      } else {
        errors++;
        console.error(`  Error inserting ${call.Sid}: ${error.message}`);
      }
    } else {
      inserted++;
      if (leadId) matched++;
    }
  }

  console.log(`\n=== Database Results ===`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (duplicates): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Lead matches: ${matched}`);
  console.log('\nDone! Refresh the Incoming Calls tab to see real data.');
}

main().catch(console.error);
