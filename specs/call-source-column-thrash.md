# Fix 3 — `call_source` Column Assumption-Thrash

**Status:** DEFERRED until Exotel pipe is restored (see `project_exotel_silent_since_april_11.md`).
**Drafted:** 2026-04-20 01:30 IST by Claude for Omm to answer in one shot next session.
**Purpose:** Unblock Fix 3 PR without re-hydrating audit context.

---

## Context (why this column exists)

Audit 2026-04-19 revealed:
- `admission_call_logs` captures Exotel-driven calls
- Only 3 rows in `admission_lead_activities.activity_type='call'` ever exist
- Thousands of counselor personal-phone calls are INVISIBLE to the CRM
- Need to distinguish: Exotel inbound vs Exotel outbound CTC vs manual-log vs WhatsApp-initiated voice

Proposed column on `admission_call_logs`:
```sql
call_source TEXT DEFAULT 'exotel_inbound'
  CHECK (call_source IN ('exotel_inbound','exotel_ctc','manual','whatsapp_call'))
```

---

## The 14 Assumption Questions (answer in order)

### 1. Enum scope — are these the right 4 values?
- `exotel_inbound` — prospect called JKKN, Exotel delivered webhook
- `exotel_ctc` — counselor clicked CTC in MyJKKN, Exotel bridged
- `manual` — counselor called from personal phone, logged after
- `whatsapp_call` — voice call initiated via WhatsApp Business (future)

**Q1a:** Should `whatsapp_call` be in scope NOW, or added later when that feature exists?
**Q1b:** Should we add `sms_triggered_callback` (if SMS links trigger calls)?
**Q1c:** Should we split `manual` into `manual_outbound` (counselor called) vs `manual_inbound_followup` (counselor returned a missed call)?

### 2. Default value for legacy rows
Current design: `DEFAULT 'exotel_inbound'` for all 1,164 existing rows.
**Q2:** Is that correct? Or should legacy rows get `call_source=NULL` to distinguish "pre-audit unknown" from new rows?

### 3. Backfill logic
Proposed:
```sql
WHEN call_sid LIKE 'pending-%' THEN 'exotel_ctc'
WHEN direction='outbound' THEN 'exotel_ctc'
ELSE 'exotel_inbound'
```
**Q3a:** The 3 existing `pending-%` rows have `from_number=''` and `status='failed'` — should they be backfilled as `exotel_ctc` (they were attempted) or as `failed_ctc_attempt` (new enum value)?
**Q3b:** If any legacy outbound row has a non-pending call_sid (Exotel completed it), is it still `exotel_ctc` or something else?

### 4. Who sets `call_source` on INSERT?
- `TelephonyService.initiateCall()` → hardcode `call_source='exotel_ctc'`?
- `TelephonyService.logManualCall()` → hardcode `call_source='manual'`?
- Webhook handler (`/api/webhooks/telephony`) → hardcode `call_source='exotel_inbound'`?
- CDR sync (`InboundCallSyncService`) → hardcode `call_source='exotel_inbound'`?

**Q4:** Are these 4 paths the complete set? Are there any I'm missing?

### 5. RLS policy update — does `call_source` need to appear in policy?
Current policies use `admission.leads.*` permissions. The column itself is read-only metadata.
**Q5:** Should a super-admin be able to see all sources, but a counselor see only `manual` + their own `exotel_ctc` rows? Or same visibility across all sources?

### 6. Index strategy
Proposed partial index:
```sql
CREATE INDEX idx_call_logs_source ON admission_call_logs(institution_id, call_source, created_at DESC);
```
**Q6:** Is `(institution_id, call_source, created_at DESC)` the right column order for the query "show me all manual calls this week"? Or should `call_source` come first?

### 7. What happens when a counselor logs a manual call for a lead that already has an `exotel_inbound` row?
Current `admission_call_logs` schema allows this — two rows per lead, different sources.
**Q7:** Should we DE-DUPE or allow both to coexist? If coexist, which one does the funnel view show?

### 8. Mobile UX — where does "Log Call" button lead?
Elevating `LogCallDialog` was mentioned. Before Fix 3, we need to confirm:
**Q8a:** On the lead detail page, should "Log Call" be a primary button (prominent green) or secondary?
**Q8b:** Should it auto-open on every missed-call notification, or only via explicit tap?
**Q8c:** Should the dialog remember last disposition + interest level (per counselor) as default?

### 9. Reporting — what dashboards will use `call_source`?
Fix 3's value is visibility. But a column without a dashboard is wasted.
**Q9a:** Should I build a "Counselor Activity" tile that shows `manual` count per counselor?
**Q9b:** Should the existing Call Stats page filter by `call_source`?
**Q9c:** Should PDF exports include `call_source` breakdown?

### 10. Data export / compliance
Call data is PII-sensitive.
**Q10:** Do `manual` rows with counselor-only notes need different export gating than `exotel_inbound` rows (which have Exotel recordings)?

### 11. Audit trail — who logged the manual call?
Manual calls will have counselor_id. But what if counselor edits disposition later?
**Q11:** Should we add `logged_by` + `last_edited_by` + `edit_count` columns? Or just use updated_at?

### 12. Backward compatibility — will this break existing queries?
`getCallStats`, `getCallLogs`, `getInboundCallStats` all exist in telephony-service.ts.
**Q12:** Should they ALL be updated to filter by call_source, or only new consumer code?

### 13. Failure mode — what if the CHECK constraint is violated?
If a code path forgets to set `call_source` and schema hasn't been updated on prod yet, the DEFAULT fires → `exotel_inbound`. That could misclassify thousands of manual entries.
**Q13:** Should we flip DEFAULT to NULL + NOT NULL constraint so forgotten paths crash loud?

### 14. Rollback safety
If we realize the enum is wrong 2 weeks from now:
**Q14a:** Is the migration reversible? (Dropping the CHECK + column should be safe since DEFAULT means every row has a value)
**Q14b:** Should we add a `call_source_v2` column later instead of altering the enum in place?

---

## Once Answered → Direct Path to PR

After 14 answers, the PR plan is:
1. Create worktree from `jicate/main`
2. Add migration SQL to `supabase/setup/01_tables.sql`:
   - New column with CHECK constraint
   - Partial index
   - Backfill statement
3. Update `supabase/setup/03_policies.sql` if Q5 changed RLS
4. Update `lib/services/telephony/telephony-service.ts`:
   - `initiateCall` → insert `call_source='exotel_ctc'`
   - `logManualCall` → insert `call_source='manual'`
   - `handleCallStatusCallback` (webhook) → insert `call_source='exotel_inbound'` (for new inbound)
5. Update `lib/services/telephony/inbound-call-sync-service.ts` → upsert `call_source='exotel_inbound'`
6. (Optional) Update dashboards per Q9
7. Run `/silent-failure-auditor` → fix findings
8. Run `/pr-preflight` → confirm no overlap
9. Push + open PR
10. **User merges manually per CLAUDE.md rule.**

---

## Estimated effort
- Interview: 10 min (14 questions, 1-sentence answers each)
- Implementation: 45 min (SQL + 4 service edits + index + backfill)
- Audit gates: 15 min (silent-failure, pr-preflight, tsc)
- PR open + review: 5 min
- **Total: ~75 min from "answer the 14" to "PR ready for merge"**

---

## Why this is queued behind Exotel pipe restoration

If Exotel is not webhook-calling us (current state since April 11), the new `call_source='exotel_inbound'` values will never populate organically. The column becomes dead decoration. Ship Fix 3 only after a test call lands in DB and flows through the webhook path correctly.
