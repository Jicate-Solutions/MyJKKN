# WhatsApp Template Media & Emoji Enhancement — Design Document

**Date:** 2026-02-28
**Module:** Admission → Settings → Communication Templates
**Status:** Approved

---

## Overview

Enhance the WhatsApp channel in `admission_communication_templates` to support media attachments (image, video, document) and an emoji picker in the message content textarea. These features are WhatsApp-only and do not affect SMS or Email templates.

---

## Goals

1. Allow media (image, video, document) to be attached to WhatsApp templates via URL paste or file upload to Supabase Storage
2. Provide a full emoji picker (emoji-mart) on the message content textarea for all WhatsApp templates
3. Show media thumbnail/icon in the template preview dialog
4. Keep the DB schema backward-compatible (nullable new columns)

---

## Database Schema Changes

**Table:** `admission_communication_templates`

Add two nullable columns:

```sql
ALTER TABLE admission_communication_templates
  ADD COLUMN IF NOT EXISTS attachment_type TEXT NULL
    CHECK (attachment_type IN ('image', 'video', 'document')),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT NULL;
```

These are NULL for SMS and email templates. Only populated for WhatsApp templates when the user explicitly adds media.

---

## Service Layer Changes

**File:** `lib/services/admission/communication-templates-service.ts`

Add to `CommunicationTemplate` interface:
```typescript
attachment_type: 'image' | 'video' | 'document' | null;
attachment_url: string | null;
```

Add to `CreateTemplateInput` and `UpdateTemplateInput`:
```typescript
attachment_type?: 'image' | 'video' | 'document' | null;
attachment_url?: string | null;
```

Update `createTemplate` and `updateTemplate` to pass these fields to Supabase.

---

## Supabase Storage

**Bucket:** `admission-template-media`
- Public reads (anyone can view media)
- Authenticated uploads only (via RLS)
- File path pattern: `{institution_id}/{timestamp}-{filename}`

Create via migration SQL:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('admission-template-media', 'admission-template-media', true)
ON CONFLICT DO NOTHING;
```

---

## Frontend UI Changes

**File:** `app/(routes)/admission/settings/templates/page.tsx`

### Form State Additions
```typescript
attachment_type: 'image' | 'video' | 'document' | null;
attachment_url: string | null;
// For UI tab tracking:
mediaInputMode: 'url' | 'upload';
```

### Emoji Picker
- Install `@emoji-mart/react` and `@emoji-mart/data`
- Dynamic import (Next.js) to avoid SSR issues
- Rendered as a Radix `Popover` button next to "Message Content" label
- On emoji click: insert emoji at textarea cursor position (using `selectionStart`/`selectionEnd`)
- Show for all channels (emoji is useful in any template)

### Media Attachment Section (WhatsApp only)
- Renders only when `formData.channel === 'whatsapp'`
- Attachment type selector: None / Image / Video / Document
  (using `ToggleGroup` or `Select`)
- When type !== null, show two tabs: "Paste URL" and "Upload File"
  - **Paste URL tab:** `Input` for the URL + Clear button
  - **Upload File tab:** `<input type="file">` styled as Button; on file select:
    1. Upload to `admission-template-media` bucket via Supabase client
    2. Get public URL
    3. Set `formData.attachment_url` to the public URL
- Show upload progress indicator (loading state)

### Preview Dialog Enhancement
- If `attachment_type === 'image'` and `attachment_url`: render `<img>` thumbnail (max-height 200px)
- If `attachment_type === 'video'`: render a video icon + link
- If `attachment_type === 'document'`: render a document icon + filename link

### resetForm() update
Add `attachment_type: null, attachment_url: null` to the reset.

---

## Dependencies

```bash
npm install @emoji-mart/react @emoji-mart/data
```

emoji-mart v5 works with Next.js via dynamic import:
```typescript
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
// Dynamic import in component to avoid SSR
```

---

## Acceptance Criteria

1. Creating a WhatsApp template shows a "Media Attachment" section with type selector
2. Selecting "Image" shows URL paste and Upload File tabs
3. Pasting a URL saves `attachment_url` to DB
4. Uploading a file sends it to `admission-template-media` bucket and saves the public URL
5. Emoji button opens picker; clicking emoji inserts it at cursor in textarea
6. Preview dialog shows image thumbnail or media icon when attachment is present
7. SMS and Email templates show no media section and are unaffected
8. Existing templates without attachments continue to work (attachment fields are NULL)
