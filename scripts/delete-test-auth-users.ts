import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const userIds = [
  'fa0bf4d2-ac7b-48d6-82e1-b4f2beaa1452',
  'a071daed-32a1-4d5b-a603-bb512f407dd7',
  'b449a3f9-40ec-4f75-9c83-c164f789378e',
  '9c4b1e5b-2383-49e7-92c6-0a0e3f39fa36',
  '3dac941a-89b5-464c-96fc-d58138f21d36',
  'c3aa99bd-d3e9-4cd4-9394-b5664444df04',
  '1b82c0ea-c1ad-4b04-8357-0cb187e5d2b1',
  '683d875c-a931-46b8-b1d8-20ce4ecf0c0a',
  '3d4bbd97-e0c8-4762-9cf5-f4482b39c8cf',
  '2d956338-60c0-4a32-8b7a-49f2c26fe58e'
];

const emails = [
  'manikandanplecse2025@jkkn.ac.in',
  'dhanapal.vvlecse2025@jkkn.ac.in',
  'kavinalecse2025@jkkn.ac.in',
  'dhineshmlecse2025@jkkn.ac.in',
  'prakashmlecse2025@jkkn.ac.in',
  'janaklecse2025@jkkn.ac.in',
  'parthipanmlecse2025@jkkn.ac.in',
  'mukilanmlecse2025@jkkn.ac.in',
  'sangameshwaranclecse2025@jkkn.ac.in',
  'sriganthblecse2025@jkkn.ac.in'
];

async function deleteUsers() {
  console.log('🗑️ Deleting 10 auth users...\n');

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    const email = emails[i];

    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error(`❌ Failed to delete ${email}:`, error.message);
    } else {
      console.log(`✅ Deleted ${email}`);
    }
  }

  console.log('\n✅ Cleanup complete!');
}

deleteUsers().catch(console.error);
