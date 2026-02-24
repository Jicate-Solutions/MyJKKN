import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/supabase/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// SERVICE_ROLE_KEY is required for storage operations (upload to private bucket)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Allowlist of valid folder names — prevents arbitrary directory creation
const ALLOWED_FOLDERS = ['prospects', 'mous'] as const

export async function POST(request: Request) {
  try {
    // SECURITY: Require authenticated user
    const { user, error: authError } = await getAuthUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const category = formData.get('category') as string // 'prospect' or 'mou'
    const entityId = formData.get('entityId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!category || !entityId) {
      return NextResponse.json(
        { error: 'Category and entityId are required' },
        { status: 400 }
      )
    }

    // SECURITY: Validate entityId is a UUID — prevents path traversal
    if (!UUID_REGEX.test(entityId)) {
      return NextResponse.json(
        { error: 'entityId must be a valid UUID' },
        { status: 400 }
      )
    }

    if (!['prospect', 'mou'].includes(category)) {
      return NextResponse.json(
        { error: 'Category must be "prospect" or "mou"' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed. Accepted: PDF, DOCX, PNG, JPG, WEBP' },
        { status: 400 }
      )
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const fileName = `${Date.now()}.${fileExt}`
    const folderName = category === 'prospect' ? 'prospects' : 'mous'

    // SECURITY: Validate folder against allowlist
    if (!ALLOWED_FOLDERS.includes(folderName as typeof ALLOWED_FOLDERS[number])) {
      return NextResponse.json(
        { error: 'Invalid folder name' },
        { status: 400 }
      )
    }

    // Include user.id in path for audit trail
    const filePath = `${folderName}/${entityId}/${user.id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('solutions-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Get signed URL (bucket is private)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('solutions-documents')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year

    if (urlError) {
      console.error('Signed URL error:', urlError)
      return NextResponse.json(
        { error: `Failed to generate URL: ${urlError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      url: urlData.signedUrl,
      filename: file.name,
      path: filePath,
    })
  } catch (error) {
    console.error('Solutions documents upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
