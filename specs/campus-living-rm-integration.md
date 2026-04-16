# Campus Living ⇄ Resource Management Integration Plan

**Owner:** Campus Living module
**Status:** Draft — informs a sequence of follow-up PRs
**Related PR:** `feat(campus-living): multi-hostel safety + block scoping + Resource Management integration`

## Why

Campus Living and Resource Management (RM) both track "things that need
maintenance." For hostel infrastructure (beds, CCTV, kitchen appliances,
HVAC, fire & safety, etc.) we have the full RM catalog — vendor details,
contracts, preventive maintenance schedules, maintenance logs — and we
should be routing Campus Living maintenance through it instead of through
the Campus-Living-specific table `hostel_maintenance_requests`.

## Current State

| Service / Table | Purpose | Problem |
|---|---|---|
| `MaintenanceService` / `hostel_maintenance_requests` | Free-form hostel maintenance tickets — water leak, AC not working, room painting. Has learner-filed incident flow (photos, priority, SLA). | Duplicates RM's `resource_maintenance_logs`. Not linked to RM catalog, so wardens cannot see a resource's full maintenance history. Vendor and AMC data lives separately. |
| `AmcContractService` / `resources` (new) | AMC contracts for hostel infrastructure | Clean, RM-backed — the direction we want to go. |
| `PreventiveMaintenanceService` / `resource_maintenance_schedules` (new) | Recurring PM for hostel infrastructure | Clean, RM-backed. |

## Target State

| Concern | Canonical Home |
|---|---|
| Resource catalog (what we own) | `resources` (Hostel Infrastructure parent category) |
| AMC contracts | `resources.vendor_*` + `resources.warranty_expiry_date` |
| Preventive maintenance schedules | `resource_maintenance_schedules` |
| Maintenance history (what was done) | `resource_maintenance_logs` |
| Learner-filed incident (still on CL side) | new `hostel_incidents` table OR RM work order |

## Migration Steps

**PR-1 (this PR):** New Campus Living pages (AMC Contracts, Preventive
Maintenance) land on RM. `MaintenanceService` marked `@deprecated` with a
clear note. Existing Campus Living maintenance flows left untouched for
backward compatibility.

**PR-2 (follow-up):**
- Introduce a `hostel_incident` flow — either
    - renamed `hostel_maintenance_requests` → `hostel_incidents`, or
    - new thin table for learner-raised incidents only
- Incidents trigger a corresponding `resource_maintenance_logs` row
  when a warden confirms the incident is an RM work order (e.g. "AC
  compressor failed" → log against the AC resource).
- Add a `resource_id` nullable column on the incident table. Incidents
  without a resource stay Campus-Living-only (e.g. "curtain torn in
  common room"); incidents with a resource sync both ways.

**PR-3 (cleanup):**
- Migrate residual `hostel_maintenance_requests` rows into RM logs where
  possible.
- Delete `lib/services/campus-living/maintenance-service.ts` and
  `hooks/campus-living/use-hostel-maintenance.ts`.
- Remove `hostel_maintenance_requests` table after retention period.

## Why This Ordering

- Shipping the RM-backed pages first gives wardens an immediate benefit
  (contract visibility, PM calendar) without breaking the existing
  incident flow.
- The `@deprecated` marker prevents new callers from growing on the
  old service while the migration is in flight.
- Splitting the table rename and the data migration into separate PRs
  keeps each review small and reversible.
