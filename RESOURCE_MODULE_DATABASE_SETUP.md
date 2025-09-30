# Resource Management Module - Database Setup Guide

## Issue Found

The `resources` table in Supabase is missing critical columns that the application expects.

### Error Message:

```
Could not find the 'caretaker_user_ids' column of 'resources' in the schema cache
```

## Current vs Expected Schema

### Current Schema (Old)

```sql
CREATE TABLE public.resources (
    id UUID PRIMARY KEY,
    institution_id UUID NOT NULL,
    parent_category_id UUID NOT NULL,
    sub_category_id UUID NOT NULL,
    resource_code VARCHAR(50),
    resource_name VARCHAR(200),
    description TEXT,
    location VARCHAR(200),
    -- ... other old fields
);
```

### Expected Schema (New)

The application expects these additional columns:

- `name` - Resource name
- `subcategory_id` - Instead of `sub_category_id`
- `building_number`, `block_number`, `floor_number`, `room_number` - Location details
- `location_notes` - Additional location information
- `vendor_name`, `vendor_email`, `vendor_mobile`, `vendor_address` - Vendor information
- `initial_stock_quantity`, `current_stock_quantity` - Stock tracking
- **`caretaker_user_ids TEXT[]`** - Array of staff IDs (the missing column)
- `status` - Resource status
- `booking_type` - Type of booking allowed
- `booking_config JSONB` - Booking configuration
- `approval_config JSONB` - Approval workflow configuration
- `reminder_config JSONB` - Reminder settings
- `access_roles TEXT[]` - Access control
- `image_urls TEXT[]` - Image URLs
- `tags TEXT[]` - Tags for categorization
- `usage_count`, `reservation_count` - Usage statistics

## Solution: Run Migrations

### Step 1: Apply Table Migration

Run this migration in Supabase SQL Editor:

**File: `supabase/migrations/20250130_update_resources_table.sql`**

This will add all missing columns to the `resources` table.

### Step 2: Create Storage Bucket

Run this migration to create the storage bucket for resource images:

**File: `supabase/migrations/20250130_create_resource_storage_bucket.sql`**

This will:

1. Create `resource-images` storage bucket
2. Set up RLS policies for upload, update, delete, and public read
3. Configure file size limits (5MB) and allowed MIME types

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `supabase/migrations/20250130_update_resources_table.sql`
5. Click **Run**
6. Repeat for `supabase/migrations/20250130_create_resource_storage_bucket.sql`

### Option 2: Supabase CLI (If you have it installed)

```bash
# Navigate to project root
cd "d:\Projects\JKKN\MYJKKN Portal\MyJKKN"

# Apply migrations
supabase db push
```

## Verification

After running the migrations, verify:

### Check Table Columns

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'resources'
AND table_schema = 'public'
ORDER BY ordinal_position;
```

You should see `caretaker_user_ids` with type `ARRAY`.

### Check Storage Bucket

```sql
SELECT * FROM storage.buckets WHERE name = 'resource-images';
```

You should see one row with the bucket configuration.

### Check Storage Policies

```sql
SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
```

You should see policies for resource-images bucket.

## Alternative: Recreate Table (If Safe)

If you have no existing data, you can drop and recreate:

```sql
-- BACKUP FIRST IF YOU HAVE DATA!
-- DROP TABLE IF EXISTS public.resources CASCADE;

CREATE TABLE public.resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    parent_category_id UUID NOT NULL,
    subcategory_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    department_id UUID,
    building_number VARCHAR(100),
    block_number VARCHAR(100),
    floor_number VARCHAR(100),
    room_number VARCHAR(100),
    location_notes TEXT,
    vendor_name VARCHAR(255),
    vendor_email VARCHAR(255),
    vendor_mobile VARCHAR(20),
    vendor_address TEXT,
    initial_stock_quantity INTEGER DEFAULT 0,
    current_stock_quantity INTEGER DEFAULT 0,
    caretaker_user_ids TEXT[],
    purchase_date DATE,
    warranty_expiry_date DATE,
    maintenance_schedule TEXT,
    status VARCHAR(50) DEFAULT 'available',
    booking_type VARCHAR(50) DEFAULT 'reservation',
    booking_config JSONB DEFAULT '{}',
    approval_config JSONB DEFAULT '{}',
    reminder_config JSONB DEFAULT '{}',
    access_roles TEXT[] DEFAULT '{}',
    custom_attributes JSONB DEFAULT '{}',
    image_urls TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    reservation_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    created_by_user UUID,
    updated_by_user UUID,

    -- Foreign key constraints
    CONSTRAINT fk_resources_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
    CONSTRAINT fk_resources_parent_category FOREIGN KEY (parent_category_id) REFERENCES resource_parent_categories(id),
    CONSTRAINT fk_resources_subcategory FOREIGN KEY (subcategory_id) REFERENCES resource_sub_categories(id)
);

-- Create indexes
CREATE INDEX idx_resources_institution_id ON resources(institution_id);
CREATE INDEX idx_resources_parent_category_id ON resources(parent_category_id);
CREATE INDEX idx_resources_subcategory_id ON resources(subcategory_id);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_caretaker_user_ids ON resources USING GIN(caretaker_user_ids);
CREATE INDEX idx_resources_tags ON resources USING GIN(tags);
```

## After Migration

1. **Restart your Next.js app** to clear any schema caches
2. **Test creating a resource** with the new fields
3. **Test uploading images** to verify storage bucket works

## Notes

- The migration uses `ADD COLUMN IF NOT EXISTS` to safely add columns
- Existing data will be preserved
- New columns will have default values
- GIN indexes are created for array columns for better performance
- The storage bucket is set to public for easier image access
- File upload is limited to 5MB and image types only

## Support

If you encounter any issues:

1. Check Supabase logs in the dashboard
2. Verify RLS policies are enabled on the resources table
3. Check that the storage bucket was created successfully
4. Ensure your Supabase project has sufficient resources
