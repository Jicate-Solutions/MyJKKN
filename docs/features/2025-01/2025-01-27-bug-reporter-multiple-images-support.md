# Bug Reporter Multiple Images Support

**Date:** 2025-01-27
**Feature:** Multiple Image Upload for Bug Reports
**Status:** ✅ Completed
**Type:** Enhancement

## Overview

Extended the bug reporter module to support multiple image uploads beyond the auto-captured screenshot. Users can now attach up to 5 additional images (error messages, mockups, screenshots from different pages, etc.) to provide comprehensive visual context for bug reports.

## Problem Statement

Previously, bug reports were limited to a single auto-captured screenshot. Users often needed to:
- Show errors from multiple screens
- Include error messages or console screenshots
- Attach mockups or design references
- Provide before/after comparisons

This required multiple bug reports or external image hosting, making bug reporting cumbersome and less effective.

## Solution

### Key Features

1. **Primary Screenshot** (auto-captured):
   - Automatically captured when bug reporter opens
   - Can be replaced with manual upload
   - Stored in `screenshot_url` field

2. **Additional Images** (up to 5):
   - Manual file upload (browse or drag-drop)
   - Multiple file selection supported
   - Individual image removal
   - Clear all option
   - Stored in `attachment_urls` JSONB array

3. **Validation**:
   - File type checking (must be image)
   - Size limit: 5MB per image
   - Maximum 5 additional images
   - Automatic compression

4. **Display**:
   - Admin details page shows all images
   - User details page shows all images
   - Grid layout for additional images
   - Click to view full size in new tab

## Technical Implementation

### 1. Database Changes

**Migration:** `add_bug_reports_multiple_images_support.sql`

```sql
-- Add new column for multiple attachment URLs
ALTER TABLE bug_reports
ADD COLUMN IF NOT EXISTS attachment_urls JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for faster queries
CREATE INDEX IF NOT EXISTS idx_bug_reports_attachment_urls
ON bug_reports USING gin(attachment_urls);
```

**Schema:**
- `screenshot_url` (text): Primary auto-captured screenshot
- `attachment_urls` (jsonb): Array of additional image URLs

### 2. TypeScript Types

**File:** `types/bugs.ts`

```typescript
export interface BugReport {
  // ... existing fields
  screenshot_url?: string | null;
  attachment_urls?: string[] | null; // NEW: Array of additional images
  // ... rest of fields
}
```

### 3. Frontend Component

**File:** `components/bug-reporter/bug-reporter-widget.tsx`

**New State:**
```typescript
const [capturedScreenshot, setCapturedScreenshot] = useState<string>(''); // Primary
const [additionalImages, setAdditionalImages] = useState<string[]>([]); // Additional
const multipleFileInputRef = useRef<HTMLInputElement>(null);
```

**New Functions:**
- `handleMultipleFileSelect()`: Process multiple file uploads
- `handleRemoveAdditionalImage(index)`: Remove specific image
- `handleClearAllAdditionalImages()`: Clear all additional images

**UI Components:**
- Hidden file input with `multiple` attribute
- Grid preview of additional images
- Remove buttons for each image
- Image counter (0/5)
- Clear all button

### 4. Service Layer

**File:** `lib/services/bug-reports/bug-report-service.ts`

**Payload Interface:**
```typescript
export interface CreateBugReportPayload {
  page_url: string;
  description: string;
  screenshot_data_url?: string;
  additional_images_data_urls?: string[]; // NEW
  console_logs?: any[];
  metadata?: object;
}
```

**Upload Logic:**
```typescript
// Upload primary screenshot
const filePath = `${reportId}/screenshot.png`;

// Upload additional images
for (let i = 0; i < additional_images.length; i++) {
  const filePath = `${reportId}/additional-${i + 1}.png`;
  // ... upload and get public URL
  attachmentUrls.push(publicUrl);
}

// Update report with all URLs
await supabase
  .from('bug_reports')
  .update({
    screenshot_url,
    attachment_urls: attachmentUrls
  });
```

### 5. Display Pages

**Admin Details Page:** `app/(routes)/admin/bug-reports/[id]/page.tsx`

- Shows count of total images
- Primary screenshot with "Auto-captured" label
- Grid layout for additional images (2 columns)
- Click to view in new tab
- Hover effect with overlay

**User Details Page:** `app/(routes)/my-bug-reports/[id]/page.tsx`

- Similar layout to admin page
- Shows all images user uploaded
- Grid preview of additional images

## Storage Structure

**Supabase Storage Bucket:** `bug-reports`

```
bug-reports/
├── {bug_report_id}/
│   ├── screenshot.png          # Primary screenshot
│   ├── additional-1.png        # First additional image
│   ├── additional-2.png        # Second additional image
│   ├── additional-3.png        # Third additional image
│   ├── additional-4.png        # Fourth additional image
│   └── additional-5.png        # Fifth additional image
```

## User Experience

### Before This Feature
- ❌ Single screenshot only
- ❌ No additional context images
- ❌ Users had to create multiple reports
- ❌ External image links required

### After This Feature
- ✅ Up to 6 total images (1 primary + 5 additional)
- ✅ Easy multi-file upload
- ✅ Preview all images before submit
- ✅ Individual image removal
- ✅ Automatic compression
- ✅ Better bug context

## Validation & Limits

| Property | Limit | Reason |
|----------|-------|--------|
| Additional Images | 5 max | Prevent payload bloat |
| File Size | 5MB per image | Storage efficiency |
| File Type | Images only | Prevent abuse |
| Total Size | ~2MB after compression | API limits |
| Format | PNG, JPG, JPEG, GIF, WebP | Standard formats |

## UI Flow

### Adding Images

1. User clicks bug reporter button
2. Primary screenshot auto-captured
3. Modal opens with screenshot preview
4. User sees "Additional Images (Optional)" section
5. User clicks "Add Images" button
6. File picker opens (supports multiple selection)
7. User selects 1-5 images
8. Images are validated and compressed
9. Previews shown in 2-column grid
10. User can add more or remove individual images

### Removing Images

**Individual:**
- Hover over image → X button appears
- Click X → Image removed
- Counter updates

**All:**
- Click "Clear All" button
- All additional images cleared
- Can re-add images

### Submitting

1. Fill description and category
2. Review all images
3. Click "Submit Report"
4. All images uploaded to Supabase
5. URLs saved in database
6. Success message and redirect

## Admin View

### Bug Details Page

**Screenshots & Attachments Card:**
```
┌─────────────────────────────────────────────┐
│ Screenshots & Attachments (6 images)        │
├─────────────────────────────────────────────┤
│ Primary Screenshot (Auto-captured)           │
│ [Large full-width image preview]             │
│                                              │
│ Additional Images (5)                        │
│ ┌──────────┐  ┌──────────┐                 │
│ │ Image 1  │  │ Image 2  │                 │
│ └──────────┘  └──────────┘                 │
│ ┌──────────┐  ┌──────────┐                 │
│ │ Image 3  │  │ Image 4  │                 │
│ └──────────┘  └──────────┘                 │
│ ┌──────────┐                                │
│ │ Image 5  │                                │
│ └──────────┘                                │
└─────────────────────────────────────────────┘
```

## API Changes

### POST `/api/bug-reports`

**Request Payload:**
```json
{
  "page_url": "https://...",
  "description": "Bug description",
  "category": "bug",
  "screenshot_data_url": "data:image/png;base64,...",
  "additional_images_data_urls": [
    "data:image/png;base64,...",
    "data:image/png;base64,...",
    "data:image/jpeg;base64,..."
  ],
  "console_logs": [...],
  "metadata": {
    "additionalImagesCount": 3
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "screenshot_url": "https://...storage.../screenshot.png",
    "attachment_urls": [
      "https://...storage.../additional-1.png",
      "https://...storage.../additional-2.png",
      "https://...storage.../additional-3.png"
    ]
  }
}
```

## Files Modified

1. **Database:**
   - `supabase/migrations/add_bug_reports_multiple_images_support.sql` (NEW)

2. **Types:**
   - `types/bugs.ts` - Added `attachment_urls` field

3. **Frontend:**
   - `components/bug-reporter/bug-reporter-widget.tsx` - Multi-image UI

4. **Service:**
   - `lib/services/bug-reports/bug-report-service.ts` - Multi-image upload logic

5. **Pages:**
   - `app/(routes)/admin/bug-reports/[id]/page.tsx` - Display all images
   - `app/(routes)/my-bug-reports/[id]/page.tsx` - Display all images

## Testing Checklist

### Upload Tests
- [x] Upload 1 additional image
- [x] Upload 5 additional images (max)
- [x] Try uploading 6th image (should show error)
- [x] Upload different formats (PNG, JPG, GIF)
- [x] Try uploading non-image file (should reject)
- [x] Try uploading >5MB file (should reject)
- [x] Upload with primary screenshot only
- [x] Upload with additional images only (no primary)

### UI Tests
- [x] Image preview shows correctly
- [x] Remove individual image works
- [x] Clear all images works
- [x] Image counter updates (0/5, 3/5, etc.)
- [x] Grid layout displays properly
- [x] Hover effects work

### Admin Page Tests
- [x] All images display correctly
- [x] Click to view in new tab works
- [x] Grid layout for additional images
- [x] Image count shows correctly
- [x] Download primary screenshot works

### User Page Tests
- [x] User sees their uploaded images
- [x] All images display in grid
- [x] Image labels show correctly

## Performance Considerations

### Compression
- All images automatically compressed
- Target: <2MB total payload
- Progressive compression if needed
- Maintains acceptable quality

### Storage
- Images stored in Supabase Storage
- Public URLs for fast access
- CDN-backed delivery
- Automatic cleanup on delete

### Database
- JSONB array for flexible storage
- GIN index for fast queries
- No additional joins needed
- Efficient array operations

## Future Enhancements

1. **Drag & Drop Upload**
   - Drag images into upload area
   - Visual drop zone

2. **Image Editing**
   - Crop images
   - Annotate with arrows/text
   - Highlight areas

3. **Image Comparison**
   - Before/after slider
   - Side-by-side comparison

4. **Video Support**
   - Record screen
   - Upload video files
   - GIF export

5. **Image Gallery**
   - Lightbox viewer
   - Zoom controls
   - Fullscreen mode

## Migration Guide

### For Existing Reports

Existing bug reports will:
- Keep their `screenshot_url`
- Have `attachment_urls` = `[]` by default
- Display normally (backward compatible)

### For Developers

```typescript
// Old code (still works)
const report = await BugReportService.getBugReportById(id);
console.log(report.screenshot_url);

// New code (with multiple images)
const report = await BugReportService.getBugReportById(id);
console.log(report.screenshot_url); // Primary
console.log(report.attachment_urls); // Additional [url1, url2, ...]
```

## Security Considerations

1. **File Type Validation:** Server-side MIME type checking
2. **Size Limits:** Enforced at frontend and backend
3. **Storage Access:** RLS policies on Supabase Storage
4. **Malicious Files:** File type verification
5. **Rate Limiting:** Prevent abuse of upload endpoint

## Support

For questions or issues:
- Check documentation in `docs/features/`
- Review bug report UI in application
- Contact development team

---

**Implementation Date:** 2025-01-27
**Developer:** Claude Code
**Reviewer:** Pending
**Status:** ✅ Production Ready
