-- Lab assistants raise indents with wrong quantities; let them fix their own
-- before approval. The UI already limits Edit to the requester while the indent
-- is draft / waiting for HOD / waiting for the store (EDITABLE_INDENT_STATUSES).
UPDATE public.custom_roles
SET permissions = jsonb_set(permissions, '{ims.indents.edit}', 'true'::jsonb)
WHERE role_key = 'lab_assistant';
