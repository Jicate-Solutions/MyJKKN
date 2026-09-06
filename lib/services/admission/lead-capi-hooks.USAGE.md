# lead-capi-hooks — Usage guide

Server-side helpers that lead-creation / lead-conversion code paths CAN call
to fire a Meta Conversions API (CAPI) event. **Existing lead service is NOT
modified by this substrate PR** — call-sites opt in when ready.

## Why a sibling module instead of inline edits to `lead-service.ts`?

- Keeps the CAPI substrate fully retractable. Deleting `lib/meta/*` + this
  hook file is the entire surgery if we ever rip out Meta attribution.
- Lets multiple call-sites (web form, WhatsApp ingest, COE-feed, …) wire in
  without each re-implementing policy resolve + audit-write boilerplate.

## Two exported hooks

### `fireLeadCreatedCapi(input: LeadCreatedInput)` → `Promise<CapiHookResult>`

Emits a Meta `Lead` event with `event_id = "lead-${leadId}"`. Never throws.

### `fireLeadConvertedCapi(input: LeadConvertedInput)` → `Promise<CapiHookResult>`

Emits a Meta `Purchase` event with `event_id = "purchase-${orderId}"`.
Never throws. `value` and `currency` are required.

## Recommended call sites (NOT done in this PR — for follow-up)

The substrate PR ships only the helpers + audit substrate. The follow-up PR
that wires them in should land in these spots:

| Call-site | When | What to call |
|-----------|------|--------------|
| `services/admission/lead-service.ts → createLead()` | After `INSERT INTO admission_leads` succeeds | `fireLeadCreatedCapi({ leadId: lead.id, … })` |
| `app/api/admission/leads/route.ts` (POST handler) | After lead row created | Same |
| `services/admission/whatsapp-lead-ingest.ts` | After lead row created from inbound WA message | Same, with `leadSource: 'whatsapp'` |
| `services/admission/applications-service.ts → confirmPayment()` | After payment row marked `paid` | `fireLeadConvertedCapi({ orderId: payment.id, value: payment.amount, currency: 'INR', … })` |

## How to wire — example for `createLead()`

```ts
// services/admission/lead-service.ts (FUTURE — not done in this PR)
import { fireLeadCreatedCapi } from '@/lib/services/admission/lead-capi-hooks';

export async function createLead(input: CreateLeadInput, ctx: Ctx) {
  const lead = await insertLeadRow(input);

  // Fire-and-forget. Hook never throws; failures are audited to
  // meta_capi_events but do NOT cascade into the lead-creation result.
  void fireLeadCreatedCapi({
    leadId: lead.id,
    institutionId: lead.institution_id,
    email: lead.email,
    phone: lead.phone,
    firstName: lead.first_name,
    lastName: lead.last_name,
    country: lead.country ?? 'IN',
    sourceUrl: ctx.requestUrl,
    leadSource: lead.source_label,
    clientIp: ctx.headers.get('x-forwarded-for') ?? undefined,
    clientUserAgent: ctx.headers.get('user-agent') ?? undefined,
    fbc: ctx.cookies.get('_fbc')?.value,
    fbp: ctx.cookies.get('_fbp')?.value,
    value: 100,
    currency: 'INR',
  });

  return lead;
}
```

## Critical: dedupe contract with browser Pixel

The browser-side Pixel call for the same conversion MUST emit the same
`event_id`. Otherwise Meta double-counts.

```tsx
// Server: fires Lead with event_id = "lead-9a7b..."
// Browser (on the thank-you page): MUST also fire with eventID = "lead-9a7b..."
fbq('track', 'Lead',
    { value: 100, currency: 'INR' },
    { eventID: `lead-${leadId}` });
```

The `<MetaPixelLoader />` component (this PR) attaches `fbq` to the page; the
caller chooses where to fire it.

## What this PR DOES NOT do

- Does NOT modify `services/admission/lead-service.ts`.
- Does NOT modify any existing admission API route handler.
- Does NOT add browser `fbq` calls — only the loader. Each form/page owns
  its browser-side fire.
- Does NOT register the integration page into `lib/permissions-audit/module-mappings.ts`
  or `lib/constants/table-module-map.ts` — see `.agent-handoff/epsilon.json`
  for the follow-up payload.

## Where to look for failures

`SELECT institution_id, event_name, event_id, response_status, error, sent_at
 FROM meta_capi_events
 ORDER BY sent_at DESC LIMIT 50;`

Or visit `/admission/social/meta-pixel` (this PR) which surfaces the same
view via the admin UI.
