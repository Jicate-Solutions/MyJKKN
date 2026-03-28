# Exotel Integration — Database Setup (Production)

## Current State on Production

| Table | Exists? | Status |
|-------|---------|--------|
| `admission_call_logs` | YES | 22 columns, RLS configured, indexes present |
| `admission_sms_logs` | YES | 18 columns, RLS configured |
| `communication_cost_log` | NO | Must be created |
| `sms_provider` enum | YES | Has `msg91`, `twilio` — needs `exotel` added |

## SQL to Run on Production

### Step 1: Add 'exotel' to sms_provider enum

```sql
-- Add 'exotel' to the existing sms_provider enum
ALTER TYPE sms_provider ADD VALUE IF NOT EXISTS 'exotel';
```

### Step 2: Create communication_cost_log table

```sql
-- Communication cost tracking for calls, SMS, WhatsApp, email
CREATE TABLE IF NOT EXISTS communication_cost_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'call', 'voice_broadcast')),
  event_type TEXT NOT NULL CHECK (event_type IN ('send', 'receive', 'call_minute', 'template_message')),
  unit_cost NUMERIC(10, 4) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_cost NUMERIC(10, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  reference_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_log_institution ON communication_cost_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_channel ON communication_cost_log(channel);
CREATE INDEX IF NOT EXISTS idx_cost_log_reference ON communication_cost_log(reference_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_created ON communication_cost_log(created_at DESC);

-- RLS
ALTER TABLE communication_cost_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_log_select" ON communication_cost_log
  FOR SELECT USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "cost_log_insert" ON communication_cost_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY "cost_log_update" ON communication_cost_log
  FOR UPDATE USING (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );
```

## Existing Schema: admission_call_logs (Production — Verified)

```
Column                    | Type        | Nullable | Default
--------------------------|-------------|----------|--------
id                        | uuid        | NO       | gen_random_uuid()
institution_id            | uuid        | NO       |
lead_id                   | uuid        | YES      |
counselor_id              | uuid        | NO       |
call_sid                  | text        | NO       |
direction                 | text        | NO       | 'outbound'
from_number               | text        | NO       |
to_number                 | text        | NO       |
status                    | text        | NO       | 'initiated'
duration_seconds          | integer     | YES      |
recording_url             | text        | YES      |
recording_duration_seconds| integer     | YES      |
call_notes                | text        | YES      |
call_disposition          | text        | YES      |
follow_up_date            | date        | YES      |
cost_amount               | numeric     | YES      |
cost_currency             | text        | YES      | 'INR'
started_at                | timestamptz | YES      |
answered_at               | timestamptz | YES      |
ended_at                  | timestamptz | YES      |
created_at                | timestamptz | NO       | now()
updated_at                | timestamptz | NO       | now()
```

**RLS Policies** (all 4 CRUD operations):
- Scoped to `institution_id = auth_institution_id()`
- Super admin bypass: `profiles.role = 'super_admin'`
- Admission role bypass: `custom_roles.role_key = 'admission'`

**Status**: Ready — no changes needed.

## Existing Schema: admission_sms_logs (Production — Verified)

```
Column             | Type            | Nullable
-------------------|-----------------|----------
id                 | uuid            | NO
institution_id     | uuid            | NO
lead_id            | uuid            | NO
template_id        | uuid            | YES
phone_number       | varchar         | NO
message_content    | text            | NO
provider           | sms_provider    | NO       ← enum: msg91, twilio (add 'exotel')
provider_message_id| varchar         | YES
status             | sms_delivery_   | NO
error_message      | text            | YES
dlt_template_id    | varchar         | YES
dlt_entity_id      | varchar         | YES
cost               | numeric         | YES
segments           | integer         | NO
sent_at            | timestamptz     | YES
delivered_at       | timestamptz     | YES
created_at         | timestamptz     | NO
updated_at         | timestamptz     | NO
```

**Status**: Needs `ALTER TYPE sms_provider ADD VALUE 'exotel'` (Step 1 above).
