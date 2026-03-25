# WhatsApp Template Media & Emoji Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add media attachments (image/video/document via URL paste or file upload) and an emoji picker to WhatsApp communication templates in the Admission module.

**Architecture:** Two new nullable DB columns (`attachment_type`, `attachment_url`) on `admission_communication_templates` hold the media metadata. A Supabase Storage bucket (`admission-template-media`) stores uploaded files. emoji-mart renders in a Radix Popover on the textarea. Media section conditionally renders only when `channel === 'whatsapp'`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Storage + Postgres), React Query (via hooks), shadcn/ui (Popover, Tabs), `@emoji-mart/react` + `@emoji-mart/data`

**Design doc:** `docs/plans/2026-02-28-whatsapp-template-media-design.md`

---

### Task 1: DB Migration — Add Attachment Columns

**Files:**
- Create: `supabase/migrations/20260228_whatsapp_template_attachments.sql`

**Step 1: Create the migration file**

```sql
-- supabase/migrations/20260228_whatsapp_template_attachments.sql
-- Add WhatsApp media attachment support to communication templates

ALTER TABLE admission_communication_templates
  ADD COLUMN IF NOT EXISTS attachment_type TEXT
    CHECK (attachment_type IN ('image', 'video', 'document')),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN admission_communication_templates.attachment_type IS
  'WhatsApp media type: image | video | document. NULL = text-only template.';
COMMENT ON COLUMN admission_communication_templates.attachment_url IS
  'Public URL of the attached media. NULL when no attachment.';
```

**Step 2: Apply migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with the SQL above.

Expected result: two new nullable columns appear on `admission_communication_templates`.

**Step 3: Create Supabase Storage bucket**

Run the following SQL via `mcp__supabase__execute_sql`:

```sql
-- Create public storage bucket for template media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admission-template-media',
  'admission-template-media',
  true,
  10485760,  -- 10 MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload template media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'admission-template-media');

-- Allow public reads
CREATE POLICY "Public can read template media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'admission-template-media');

-- Allow users to delete their own uploads
CREATE POLICY "Authenticated users can delete template media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'admission-template-media');
```

**Step 4: Verify columns exist**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'admission_communication_templates'
  AND column_name IN ('attachment_type', 'attachment_url');
```

Expected: 2 rows, both with `is_nullable = YES`.

**Step 5: Commit**

```bash
git add supabase/migrations/20260228_whatsapp_template_attachments.sql
git commit -m "feat(db): add attachment_type/url columns + media storage bucket"
```

---

### Task 2: Install emoji-mart

**Step 1: Install packages**

```bash
npm install @emoji-mart/react @emoji-mart/data
```

**Step 2: Verify install**

```bash
npm ls @emoji-mart/react @emoji-mart/data
```

Expected: both packages listed with version `~5.x.x`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add emoji-mart for WhatsApp template emoji picker"
```

---

### Task 3: Update Service Layer Types and Methods

**Files:**
- Modify: `lib/services/admission/communication-templates-service.ts`

**Step 1: Update the `CommunicationTemplate` interface**

In `lib/services/admission/communication-templates-service.ts`, find the `CommunicationTemplate` interface and add two fields after `content`:

```typescript
export interface CommunicationTemplate {
  id: string;
  institution_id: string;
  name: string;
  channel: TemplateChannel;
  subject: string | null;
  content: string;
  attachment_type: 'image' | 'video' | 'document' | null;  // ADD THIS
  attachment_url: string | null;                            // ADD THIS
  description: string | null;
  category: string | null;
  variables: TemplateVariable[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count?: number;
}
```

**Step 2: Update `CreateTemplateInput`**

Add optional attachment fields after `variables`:

```typescript
export interface CreateTemplateInput {
  institution_id: string;
  name: string;
  channel: TemplateChannel;
  subject?: string;
  content: string;
  description?: string;
  category?: string;
  variables?: TemplateVariable[];
  attachment_type?: 'image' | 'video' | 'document' | null;  // ADD THIS
  attachment_url?: string | null;                            // ADD THIS
  is_active?: boolean;
}
```

**Step 3: Update `UpdateTemplateInput`**

Add optional attachment fields:

```typescript
export interface UpdateTemplateInput {
  name?: string;
  channel?: TemplateChannel;
  subject?: string | null;
  content?: string;
  description?: string;
  category?: string;
  variables?: TemplateVariable[];
  attachment_type?: 'image' | 'video' | 'document' | null;  // ADD THIS
  attachment_url?: string | null;                            // ADD THIS
  is_active?: boolean;
}
```

**Step 4: Update `createTemplate` to pass new fields**

In the `createTemplate` static method, in the `.insert({...})` call, add after `variables`:

```typescript
attachment_type: input.attachment_type ?? null,
attachment_url: input.attachment_url ?? null,
```

**Step 5: Update `updateTemplate` to pass new fields**

In the `updateTemplate` static method, after the existing `if (input.variables ...)` block, add:

```typescript
if (input.attachment_type !== undefined) updateData.attachment_type = input.attachment_type;
if (input.attachment_url !== undefined) updateData.attachment_url = input.attachment_url;
```

**Step 6: Update `duplicateTemplate` to copy attachment fields**

In `duplicateTemplate`, the `createTemplate` call already spreads `original.*`. Add explicit fields:

```typescript
return this.createTemplate({
  institution_id: original.institution_id,
  name: `${original.name} (Copy)`,
  channel: original.channel,
  subject: original.subject || undefined,
  content: original.content,
  description: original.description || undefined,
  category: original.category || undefined,
  variables: original.variables,
  attachment_type: original.attachment_type ?? undefined,   // ADD THIS
  attachment_url: original.attachment_url ?? undefined,     // ADD THIS
  is_active: false,
});
```

**Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors in service file.

**Step 8: Commit**

```bash
git add lib/services/admission/communication-templates-service.ts
git commit -m "feat(service): add attachment_type/url to template types and CRUD"
```

---

### Task 4: Add Emoji Picker to Templates Page

**Files:**
- Modify: `app/(routes)/admission/settings/templates/page.tsx`

**Context:** This is a large single-file component. The emoji picker needs to use `dynamic` import to avoid Next.js SSR errors. The textarea uses `id="content"` for create and `id="edit-content"` for edit — we need a ref-based approach instead to handle cursor position correctly.

**Step 1: Add imports at the top of the file**

After the existing imports, add:

```typescript
import dynamic from 'next/dynamic';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile, Image as ImageIcon, Film, FileText as DocIcon, Upload, Link2, X as XIcon } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { EmojiMartData } from '@emoji-mart/data';

// Dynamic import prevents SSR crash (emoji-mart uses browser APIs)
const EmojiPicker = dynamic(() => import('@emoji-mart/react'), { ssr: false });
```

**Step 2: Add emoji-mart data import**

After the dynamic import line add:

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports
const emojiData = require('@emoji-mart/data') as EmojiMartData;
```

**Step 3: Add textarea refs and emoji state inside `AdmissionTemplatesPageContent`**

Inside the component function, after the existing `useState` declarations, add:

```typescript
const contentRef = useRef<HTMLTextAreaElement>(null);
const editContentRef = useRef<HTMLTextAreaElement>(null);
const [isEmojiOpen, setIsEmojiOpen] = useState(false);
const [isEditEmojiOpen, setIsEditEmojiOpen] = useState(false);
```

Also add `useRef` to the React import at the top: change `import { useCallback, useState } from 'react';` to `import { useCallback, useState, useRef } from 'react';`.

**Step 4: Add the `insertEmoji` helper**

Inside the component function, after the ref declarations, add:

```typescript
const insertEmoji = (emoji: { native: string }, ref: React.RefObject<HTMLTextAreaElement | null>, closeEmojiState: () => void) => {
  const textarea = ref.current;
  if (!textarea) return;
  const start = textarea.selectionStart ?? (formData.content || '').length;
  const end = textarea.selectionEnd ?? start;
  const current = formData.content || '';
  const updated = current.substring(0, start) + emoji.native + current.substring(end);
  setFormData({ ...formData, content: updated });
  closeEmojiState();
  // Restore cursor after React re-render
  setTimeout(() => {
    textarea.selectionStart = start + emoji.native.length;
    textarea.selectionEnd = start + emoji.native.length;
    textarea.focus();
  }, 0);
};
```

**Step 5: Update the Create dialog textarea**

Find the Create dialog textarea (id="content") and:
1. Add `ref={contentRef}` to the textarea
2. Change the label row to include an emoji button:

Replace:
```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="content">Message Content *</Label>
  <span className="text-xs text-muted-foreground">
    {formData.channel === 'sms' && formData.content
      ? `${formData.content.length}/160 characters`
      : ''}
  </span>
</div>
<Textarea
  id="content"
  placeholder="Enter your message content. Use {{variable_name}} for dynamic values."
  rows={6}
  value={formData.content}
  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
/>
```

With:
```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="content">Message Content *</Label>
  <div className="flex items-center gap-2">
    {formData.channel === 'sms' && formData.content && (
      <span className="text-xs text-muted-foreground">
        {formData.content.length}/160 characters
      </span>
    )}
    <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" type="button" className="h-7 px-2">
          <Smile className="h-4 w-4 mr-1" />
          Emoji
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-0" align="end">
        <EmojiPicker
          data={emojiData}
          onEmojiSelect={(emoji: { native: string }) =>
            insertEmoji(emoji, contentRef, () => setIsEmojiOpen(false))
          }
          theme="light"
          previewPosition="none"
          skinTonePosition="none"
        />
      </PopoverContent>
    </Popover>
  </div>
</div>
<Textarea
  id="content"
  ref={contentRef}
  placeholder="Enter your message content. Use {{variable_name}} for dynamic values."
  rows={6}
  value={formData.content}
  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
/>
```

**Step 6: Update the Edit dialog textarea similarly**

Find the Edit dialog textarea (id="edit-content"). Apply the same pattern using `editContentRef` and `isEditEmojiOpen`/`setIsEditEmojiOpen`.

Replace the label+textarea block in the Edit dialog with:
```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="edit-content">Message Content *</Label>
  <div className="flex items-center gap-2">
    {formData.channel === 'sms' && formData.content && (
      <span className="text-xs text-muted-foreground">
        {formData.content.length}/160 characters
      </span>
    )}
    <Popover open={isEditEmojiOpen} onOpenChange={setIsEditEmojiOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" type="button" className="h-7 px-2">
          <Smile className="h-4 w-4 mr-1" />
          Emoji
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-0" align="end">
        <EmojiPicker
          data={emojiData}
          onEmojiSelect={(emoji: { native: string }) =>
            insertEmoji(emoji, editContentRef, () => setIsEditEmojiOpen(false))
          }
          theme="light"
          previewPosition="none"
          skinTonePosition="none"
        />
      </PopoverContent>
    </Popover>
  </div>
</div>
<Textarea
  id="edit-content"
  ref={editContentRef}
  placeholder="Enter your message content. Use {{variable_name}} for dynamic values."
  rows={6}
  value={formData.content}
  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
/>
```

**Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors before proceeding.

**Step 8: Commit**

```bash
git add app/"(routes)"/admission/settings/templates/page.tsx package.json package-lock.json
git commit -m "feat(templates): add emoji picker to WhatsApp template content textarea"
```

---

### Task 5: Add WhatsApp Media Attachment State and Upload Handler

**Files:**
- Modify: `app/(routes)/admission/settings/templates/page.tsx`

**Context:** We need two new state variables (`mediaInputMode` and `isUploadingMedia`) and an upload handler that uses the Supabase client to upload files to the `admission-template-media` bucket.

**Step 1: Extend form data type**

The `formData` is typed as `Partial<CreateTemplateInput>`. Since we added `attachment_type` and `attachment_url` to `CreateTemplateInput`, the type already covers these fields after Task 3. Verify by checking the import at the top.

**Step 2: Add media UI state inside the component**

After the emoji state declarations, add:

```typescript
const [mediaInputMode, setMediaInputMode] = useState<'url' | 'upload'>('url');
const [isUploadingMedia, setIsUploadingMedia] = useState(false);
```

**Step 3: Add the upload handler**

After `insertEmoji`, add:

```typescript
const handleMediaUpload = async (file: File) => {
  if (!selectedInstitutionId) {
    toast.error('No institution selected');
    return;
  }
  setIsUploadingMedia(true);
  try {
    const supabase = createClientSupabaseClient();
    const ext = file.name.split('.').pop();
    const path = `${selectedInstitutionId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('admission-template-media')
      .upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage
      .from('admission-template-media')
      .getPublicUrl(path);
    setFormData({ ...formData, attachment_url: urlData.publicUrl });
    toast.success('Media uploaded successfully');
  } catch (err) {
    console.error('[admission/templates] Media upload failed:', err);
    toast.error('Failed to upload media');
  } finally {
    setIsUploadingMedia(false);
  }
};
```

**Step 4: Update `resetForm` to clear attachment fields**

Find `resetForm` and update it to:

```typescript
const resetForm = () => {
  setFormData({
    name: '',
    channel: 'email',
    subject: '',
    content: '',
    is_active: true,
    attachment_type: null,
    attachment_url: null,
  });
  setMediaInputMode('url');
};
```

**Step 5: Update `handleCreateTemplate` to pass attachment fields**

In `handleCreateTemplate`, update the `mutateAsync` call to include attachment fields:

```typescript
await createTemplate.mutateAsync({
  institution_id: selectedInstitutionId,
  name: formData.name || '',
  channel: formData.channel || 'email',
  subject: formData.subject,
  content: formData.content || '',
  is_active: formData.is_active ?? true,
  attachment_type: formData.attachment_type ?? null,   // ADD THIS
  attachment_url: formData.attachment_url ?? null,     // ADD THIS
});
```

**Step 6: Update `handleUpdateTemplate` to pass attachment fields**

In `handleUpdateTemplate`, update the `input` object:

```typescript
await updateTemplate.mutateAsync({
  id: editingTemplate,
  input: {
    name: formData.name,
    channel: formData.channel,
    subject: formData.subject || null,
    content: formData.content,
    is_active: formData.is_active ?? true,
    attachment_type: formData.attachment_type ?? null,   // ADD THIS
    attachment_url: formData.attachment_url ?? null,     // ADD THIS
  }
});
```

**Step 7: Update Edit dialog open handler to pre-fill attachment fields**

Find the Edit dropdown menu item `onClick` that sets `editingTemplate` and `setFormData`. Update it to include:

```typescript
onClick={() => {
  setEditingTemplate(template.id);
  setFormData({
    name: template.name,
    channel: template.channel,
    subject: template.subject || '',
    content: template.content,
    is_active: template.is_active,
    attachment_type: template.attachment_type ?? null,   // ADD THIS
    attachment_url: template.attachment_url ?? null,     // ADD THIS
  });
  setMediaInputMode('url');  // ADD THIS - reset to URL tab
}}
```

**Step 8: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 9: Commit**

```bash
git add app/"(routes)"/admission/settings/templates/page.tsx
git commit -m "feat(templates): add media upload state and handler for WhatsApp templates"
```

---

### Task 6: Add WhatsApp Media Attachment Section to Both Dialogs

**Files:**
- Modify: `app/(routes)/admission/settings/templates/page.tsx`

**Context:** The media section renders only when `formData.channel === 'whatsapp'`. It has an attachment type selector (None/Image/Video/Document) and, when a type is selected, shows two tabs: Paste URL and Upload File. Add this section to both Create and Edit dialogs.

**Step 1: Create the media section JSX**

This section will be placed inside both dialogs, right before the "Available Variables" block. It is identical in both dialogs (same `formData` state), so note the exact text to paste in both places.

The media section JSX to insert:

```tsx
{/* WhatsApp Media Attachment — only shown for WhatsApp channel */}
{formData.channel === 'whatsapp' && (
  <div className="space-y-3 p-3 border rounded-md bg-muted/30">
    <Label className="flex items-center gap-2 text-sm font-medium">
      <ImageIcon className="h-4 w-4" />
      Media Attachment
      <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
    </Label>

    {/* Attachment type selector */}
    <div className="flex gap-2 flex-wrap">
      {(
        [
          { value: null, label: 'None' },
          { value: 'image' as const, label: 'Image', icon: ImageIcon },
          { value: 'video' as const, label: 'Video', icon: Film },
          { value: 'document' as const, label: 'Document', icon: DocIcon },
        ] as const
      ).map((opt) => (
        <Button
          key={String(opt.value)}
          type="button"
          variant={formData.attachment_type === opt.value ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            setFormData({ ...formData, attachment_type: opt.value, attachment_url: null })
          }
        >
          {'icon' in opt && opt.icon ? <opt.icon className="h-3 w-3 mr-1" /> : null}
          {opt.label}
        </Button>
      ))}
    </div>

    {/* URL / Upload tabs — only show when a type is selected */}
    {formData.attachment_type && (
      <div className="space-y-2">
        {/* Tab switcher */}
        <div className="flex gap-1 border-b">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
              mediaInputMode === 'url'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMediaInputMode('url')}
          >
            <Link2 className="h-3 w-3 inline mr-1" />
            Paste URL
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
              mediaInputMode === 'upload'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMediaInputMode('upload')}
          >
            <Upload className="h-3 w-3 inline mr-1" />
            Upload File
          </button>
        </div>

        {/* Paste URL tab */}
        {mediaInputMode === 'url' && (
          <div className="flex gap-2">
            <Input
              placeholder={
                formData.attachment_type === 'image'
                  ? 'https://example.com/photo.jpg'
                  : formData.attachment_type === 'video'
                  ? 'https://example.com/video.mp4'
                  : 'https://example.com/brochure.pdf'
              }
              value={formData.attachment_url || ''}
              onChange={(e) =>
                setFormData({ ...formData, attachment_url: e.target.value || null })
              }
            />
            {formData.attachment_url && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setFormData({ ...formData, attachment_url: null })}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Upload File tab */}
        {mediaInputMode === 'upload' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept={
                    formData.attachment_type === 'image'
                      ? 'image/jpeg,image/png,image/gif,image/webp'
                      : formData.attachment_type === 'video'
                      ? 'video/mp4,video/quicktime'
                      : 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaUpload(file);
                  }}
                  disabled={isUploadingMedia}
                />
                <Button type="button" variant="outline" size="sm" asChild disabled={isUploadingMedia}>
                  <span>
                    {isUploadingMedia ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {isUploadingMedia ? 'Uploading…' : 'Choose File'}
                  </span>
                </Button>
              </label>
              {formData.attachment_url && !isUploadingMedia && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  ✓ Uploaded
                </span>
              )}
            </div>
            {formData.attachment_url && (
              <p className="text-xs text-muted-foreground truncate max-w-sm">
                {formData.attachment_url}
              </p>
            )}
          </div>
        )}

        {/* Preview for image URL */}
        {formData.attachment_type === 'image' && formData.attachment_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={formData.attachment_url}
            alt="Attachment preview"
            className="rounded border max-h-32 object-contain mt-1"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>
    )}
  </div>
)}
```

**Step 2: Insert media section into the Create dialog**

In the Create dialog, find the "Available Variables" `<div className="space-y-2">` block. Insert the media section JSX from Step 1 **immediately before** that block (before the `<div className="space-y-2">` that has the `Variable` icon Label).

**Step 3: Insert media section into the Edit dialog**

In the Edit dialog, find the same "Available Variables" block. Insert the same media section JSX immediately before it.

**Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any type errors (common issues: `opt.value` union narrowing — add `as const` satisfiers if needed).

**Step 5: Commit**

```bash
git add app/"(routes)"/admission/settings/templates/page.tsx
git commit -m "feat(templates): add WhatsApp media attachment section to create/edit dialogs"
```

---

### Task 7: Update Preview Dialog to Show Media

**Files:**
- Modify: `app/(routes)/admission/settings/templates/page.tsx`

**Context:** The preview dialog (already exists, shows template content) should also show an image thumbnail or a media icon+link when `attachment_type` and `attachment_url` are set.

**Step 1: Add media preview to the Preview dialog**

In the Preview dialog content (inside the IIFE), find the `</div>` that closes the variables section (last content block before `<DialogFooter>`). Insert this block after the variables section and before `</div>`:

```tsx
{/* Media attachment preview */}
{previewTemplate.attachment_type && previewTemplate.attachment_url && (
  <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      Media Attachment
    </p>
    {previewTemplate.attachment_type === 'image' ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={previewTemplate.attachment_url}
        alt="Template media"
        className="rounded border max-h-48 object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    ) : (
      <a
        href={previewTemplate.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary underline"
      >
        {previewTemplate.attachment_type === 'video' ? (
          <Film className="h-4 w-4 shrink-0" />
        ) : (
          <DocIcon className="h-4 w-4 shrink-0" />
        )}
        View {previewTemplate.attachment_type}
      </a>
    )}
  </div>
)}
```

**Step 2: Also show attachment badge in the template card grid**

In the template card grid (the `templates.map` block), find `<CardContent>` and after the existing `template.subject` block, add:

```tsx
{template.attachment_type && (
  <div className="flex items-center gap-1 mt-1">
    {template.attachment_type === 'image' && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
    {template.attachment_type === 'video' && <Film className="h-3 w-3 text-muted-foreground" />}
    {template.attachment_type === 'document' && <DocIcon className="h-3 w-3 text-muted-foreground" />}
    <span className="text-xs text-muted-foreground capitalize">{template.attachment_type}</span>
  </div>
)}
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -50
```

**Step 4: Commit**

```bash
git add app/"(routes)"/admission/settings/templates/page.tsx
git commit -m "feat(templates): show media thumbnail/icon in preview and card grid"
```

---

### Task 8: Final Verification

**Step 1: TypeScript full check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -50
```

Expected: 0 errors in project files.

**Step 2: Manual browser test — Create WhatsApp template with image URL**

1. Go to `/admission/settings/templates`
2. Click "New Template"
3. Set Channel to "WhatsApp"
4. Verify "Media Attachment" section appears
5. Click "Image" type button
6. Paste URL tab: enter `https://www.w3schools.com/css/img_5terre.jpg`
7. Verify image thumbnail preview appears below URL input
8. Click emoji button → picker opens → click an emoji → appears in textarea
9. Click "Create Template" → success toast

**Step 3: Manual browser test — Edit WhatsApp template**

1. Click the ⋮ menu on the WhatsApp template created above
2. Click "Edit"
3. Verify: attachment type "Image" is pre-selected, URL is pre-filled
4. Change to "Video" type → URL clears
5. Switch to "Upload File" tab → Choose a small image file
6. Verify upload progress → "✓ Uploaded" message appears
7. Save changes → success toast

**Step 4: Manual test — Preview dialog**

1. Click ⋮ → Preview on the template
2. Verify image thumbnail appears in preview
3. For a video/document template, verify icon+link appears

**Step 5: Verify SMS and Email templates unchanged**

1. Open any SMS or Email template in Edit
2. Verify no "Media Attachment" section is shown

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(templates): WhatsApp media attachments + emoji picker complete"
```
