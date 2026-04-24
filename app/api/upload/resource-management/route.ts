export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (service role for private-bucket uploads).
// Create lazily inside the handler — top-level createClient() is instantiated
// during Next's build-time page-data collection, which fails with
// "@supabase/ssr: Your project's URL and API key are required" in any
// environment without .env.local (e.g. fresh worktrees).
function getSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export async function POST(request: Request) {
  await connection();
  try {
    console.log('Resource management upload started');

    const supabase = getSupabaseServiceClient();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const entityId = formData.get('entityId') as string;

    console.log('Upload params:', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      type,
      entityId
    });

    if (!file) {
      console.log('No file provided');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!type || !entityId) {
      console.log('Missing type or entityId');
      return NextResponse.json(
        { error: 'Type and entityId are required' },
        { status: 400 }
      );
    }

    console.log('Attempting direct upload to Supabase storage...');

    try {
      // Test bucket access first
      const { data: buckets, error: bucketError } =
        await supabase.storage.listBuckets();
      console.log(
        'Available buckets:',
        buckets?.map((b) => b.name)
      );
      if (bucketError) {
        console.error('Bucket list error:', bucketError);
      }

      // Attempt direct upload
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `categories/${entityId}/${fileName}`;

      console.log('Uploading to path:', filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('resource-management')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('resource-management')
        .getPublicUrl(filePath);

      console.log('Public URL generated:', urlData.publicUrl);

      return NextResponse.json({ url: urlData.publicUrl });
    } catch (uploadError) {
      console.error('Direct upload failed:', uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Resource management upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
