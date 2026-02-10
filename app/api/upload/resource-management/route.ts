import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Use service role key for server-side operations

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function POST(request: Request) {
  try {

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const entityId = formData.get('entityId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!type || !entityId) {
      return NextResponse.json(
        { error: 'Type and entityId are required' },
        { status: 400 }
      );
    }

    try {
      // Test bucket access first
      const { data: buckets, error: bucketError } =
        await supabase.storage.listBuckets();
      if (bucketError) {
        console.error('Bucket list error:', bucketError);
      }

      // Attempt direct upload
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `categories/${entityId}/${fileName}`;

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

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('resource-management')
        .getPublicUrl(filePath);

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
