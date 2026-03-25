# JKKN Transport Management System (TMS) — Master Specification

> **Document Type**: Architecture & Feature Specification
> **Version**: 1.0
> **Date**: March 15, 2026
> **Status**: FINALIZED — All decisions locked
> **Parent Platform**: MyJKKN (educational platform, 83 tables, Next.js 16, Supabase)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Authentication & Access Control](#4-authentication--access-control)
5. [Access Gate & Grace Period](#5-access-gate--grace-period)
6. [Data Sync & Caching Strategy](#6-data-sync--caching-strategy)
7. [User Roles & Dashboards](#7-user-roles--dashboards)
8. [Enrollment Flow](#8-enrollment-flow)
9. [Route & Stop Management](#9-route--stop-management)
10. [Vehicle Management](#10-vehicle-management)
11. [Driver Management](#11-driver-management)
12. [Scheduling System](#12-scheduling-system)
13. [Booking Model](#13-booking-model)
14. [Live Tracking](#14-live-tracking)
15. [QR Attendance](#15-qr-attendance)
16. [Grievance System](#16-grievance-system)
17. [Notifications](#17-notifications)
18. [Auto-Renewal](#18-auto-renewal)
19. [PWA & Offline Support](#19-pwa--offline-support)
20. [Database Schema](#20-database-schema)
21. [RLS Policies](#21-rls-policies)
22. [B2A API Contracts](#22-b2a-api-contracts)
23. [Security](#23-security)
24. [v1 Feature Scope](#24-v1-feature-scope)
25. [v2 Deferred Features](#25-v2-deferred-features)
26. [Appendix: Index Recommendations](#26-appendix-index-recommendations)

---

## 1. Executive Summary

TMS is a **separate Next.js 16 application** that manages college bus transport for JKKN institutions. It is NOT a module inside MyJKKN — it is a standalone app deployed at `tms.jkkn.ai` that integrates with MyJKKN for authentication, user profiles, billing, and notifications via the B2A API layer.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment | Separate app at tms.jkkn.ai | Transport complexity warrants isolation |
| Database | Separate Supabase project | Independent scaling, no schema pollution |
| Auth | Shared JWT secret | Zero-friction SSO, no additional login |
| User data | Mirror table (tms_users) | Offline resilience, reduced B2A calls |
| Billing | MyJKKN owns all financial data | Single source of truth for payments |
| Multi-tenant | institution_id on every table | Day-1 isolation for all JKKN colleges |
| Client | PWA with offline support | Installable, works on low-connectivity campus buses |

---

## 2. Architecture Overview

### System Architecture Diagram

```
+------------------------------------------------------------------+
|                         BROWSER / PWA                             |
|                                                                   |
|  +---------------------------+  +------------------------------+  |
|  |   MyJKKN Web App          |  |   TMS PWA (tms.jkkn.ai)     |  |
|  |   (app.jkkn.ai)           |  |                              |  |
|  |                           |  |  +--------+ +--------+       |  |
|  |  Sidebar: "Transport" ------>|  |Student | |Driver  |       |  |
|  |  link opens TMS           |  |  |Dash    | |Dash    |       |  |
|  |                           |  |  +--------+ +--------+       |  |
|  |  Auth: Google OAuth       |  |  +--------+ +--------+       |  |
|  |  Issues JWT               |  |  |Staff   | |Admin   |       |  |
|  |                           |  |  |Dash    | |Dash    |       |  |
|  +---------------------------+  |  +--------+ +--------+       |  |
|                                 +------------------------------+  |
+------------------------------------------------------------------+
         |                                    |
         | Supabase JWT                       | Same JWT
         v                                    v
+-------------------+              +------------------------+
|  MyJKKN Supabase  |              |  TMS Supabase          |
|  (83 tables)      |              |  (17 tables)           |
|                   |              |                        |
|  profiles         |   B2A API   |  tms_users (mirror)    |
|  billing     <----|-------------|  tms_routes            |
|  custom_roles     |             |  tms_vehicles          |
|  notifications    |   Webhook   |  tms_schedules         |
|  service_requests |------------>|  tms_attendance        |
|  institutions     |             |  tms_driver_locations  |
|                   |             |  ...                   |
+-------------------+              +------------------------+
                                          |
                                   Supabase Realtime
                                   (broadcast channels)
                                          |
                                   +------v-------+
                                   | Live Tracking |
                                   | route:{id}    |
                                   +--------------+
```

### Data Flow Overview

```
+----------+     Google OAuth      +----------+     JWT (shared secret)     +----------+
|  Student  | ------------------> |  MyJKKN   | --------------------------> |   TMS    |
+----------+                      +----------+                             +----------+
                                       |                                        |
                                       | B2A: profile, billing,                 |
                                       | permissions, notifications             |
                                       |<---------------------------------------|
                                       |                                        |
                                       | Webhook: payment-confirmed             |
                                       |--------------------------------------->|
                                       |                                        |
                                       |                                   +----v-----+
                                       |                                   | tms_users |
                                       |                                   | (cache)   |
                                       |                                   +----------+
```

### Cross-System Integration Points

```
+-------------------------------------------------------------------+
|                    MyJKKN (Source of Truth)                        |
|                                                                   |
|  +-----------+  +----------+  +------------+  +----------------+  |
|  | profiles  |  | billing  |  | custom_    |  | service_       |  |
|  |           |  |          |  | roles      |  | requests       |  |
|  +-----------+  +----------+  +------------+  +----------------+  |
|       |              |              |                |             |
+-------|--------------|--------------|----------------|-------------+
        |              |              |                |
   B2A /users/batch  Webhook     B2A /permissions   Enrollment
        |              |              |              Approval
        v              v              v                v
+-------------------------------------------------------------------+
|                    TMS (Transport Domain)                          |
|                                                                   |
|  +-----------+  +----------+  +------------+  +----------------+  |
|  | tms_users |  | access   |  | permission |  | tms_           |  |
|  | (mirror)  |  | gate     |  | checks     |  | enrollments   |  |
|  +-----------+  +----------+  +------------+  +----------------+  |
+-------------------------------------------------------------------+
```

---

## 3. Technology Stack

Identical to MyJKKN for developer consistency and code sharing.

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 16 |
| UI Library | React | 19 |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS | 4 |
| Component Library | shadcn/ui | Latest |
| Database | Supabase (PostgreSQL) | Separate project |
| Maps | Leaflet | Latest |
| Charts | Recharts | Latest |
| Forms | React Hook Form + Zod | Latest |
| Data Fetching | TanStack Query | Latest |
| Animation | Framer Motion | Latest |
| QR Codes | qrcode.react + html5-qrcode | Latest |
| PWA | next-pwa | Latest |
| Realtime | Supabase Realtime (Broadcast) | Built-in |

---

## 4. Authentication & Access Control

### Shared JWT Architecture

TMS does NOT have its own auth system. It piggybacks on MyJKKN's Supabase auth.

```
  MyJKKN Supabase                        TMS Supabase
  +--------------+                       +--------------+
  | auth.users   | <-- Google OAuth      | auth.users   | <-- EMPTY
  | JWT secret:  |     login here        | JWT secret:  |     (same secret)
  | "abc123..."  |                       | "abc123..."  |
  +--------------+                       +--------------+
        |                                       |
        | Issues JWT with                       | Validates JWT with
        | sub = user_id                         | same secret
        v                                       v
  +-------------------------------------------+
  | JWT payload:                              |
  | {                                         |
  |   sub: "uuid-of-user",                   |
  |   email: "student@jkkn.ac.in",           |
  |   role: "authenticated",                 |
  |   aud: "authenticated"                   |
  | }                                         |
  +-------------------------------------------+
```

**Key implications**:
- `auth.uid()` works in TMS RLS policies (returns the MyJKKN user UUID)
- `auth.users` table in TMS Supabase is empty — no user records exist there
- TMS CANNOT refresh tokens. If JWT expires, redirect to MyJKKN for re-auth.

### JWT Health Check

TMS runs a background health check every 60 seconds:

```
Every 60s:
  1. Decode current JWT
  2. Check exp > now + 5min buffer
  3. If expiring soon: show "Session expiring" banner
  4. If expired: redirect to MyJKKN login
  5. If decode fails: alert + redirect
```

### Token Refresh Strategy

```
  TMS detects 401
       |
       v
  Show modal: "Session expired. Redirecting to login..."
       |
       v
  window.location.href = "https://app.jkkn.ai/login?redirect=tms"
       |
       v
  MyJKKN re-authenticates (Google OAuth)
       |
       v
  Redirect back to tms.jkkn.ai with fresh JWT
```

### Permission Model

TMS reuses MyJKKN's `custom_roles` system with TMS-specific permission keys:

| Permission Key | Description | Default Roles |
|---------------|-------------|---------------|
| `tms.routes.manage` | Create/edit/delete routes and stops | admin |
| `tms.vehicles.manage` | Manage fleet vehicles | admin |
| `tms.drivers.manage` | Assign/manage drivers | admin |
| `tms.schedules.manage` | Create/edit schedule templates | admin, staff |
| `tms.bookings.view_all` | View all bookings (not just own) | admin, staff |
| `tms.attendance.manage` | Scan QR codes, mark attendance | admin, staff, driver |
| `tms.reports.view` | Access analytics and reports | admin |

Permissions fetched via B2A at login and cached in `tms_users.permissions` (JSONB).

---

## 5. Access Gate & Grace Period

### Single Gate Rule

> **Transport bill fully paid = TMS access granted.**

There is exactly ONE gate. No partial access, no feature toggleing.

### Access Check Flow

```
  Student opens TMS
       |
       v
  Check tms_users.access_status
       |
       +-- "active" --> ALLOW (bill paid, semester valid)
       |
       +-- "grace"  --> ALLOW + show banner
       |                "Payment due by [date]"
       |
       +-- "expired" --> BLOCK
       |                 "Pay transport bill to access"
       |
       +-- "not_found" --> Call B2A /verify-access
                           |
                           +-- paid --> set "active", ALLOW
                           +-- unpaid + within 7 days of assignment --> set "grace", ALLOW
                           +-- unpaid + past 7 days --> set "expired", BLOCK
                           +-- no enrollment --> BLOCK "Request transport first"
```

### Grace Period Logic

```sql
-- Fields on tms_users
grace_period_start    TIMESTAMPTZ,  -- Set when admin assigns route
access_expires_at     TIMESTAMPTZ,  -- grace_period_start + 7 days
billing_status        TEXT,         -- 'paid', 'unpaid', 'overdue'
access_status         TEXT          -- 'active', 'grace', 'expired', 'none'
```

**Rules**:
1. Admin assigns route to student in MyJKKN -> triggers B2A call -> TMS sets `grace_period_start = NOW()`, `access_expires_at = NOW() + 7 days`, `access_status = 'grace'`
2. Student pays bill -> MyJKKN webhook fires -> TMS sets `access_status = 'active'`, `billing_status = 'paid'`
3. Grace period expires without payment -> Cron sets `access_status = 'expired'`

---

## 6. Data Sync & Caching Strategy

### Two-Tier Cache Model

| Cache Type | Staleness Tolerance | Data | Refresh Trigger |
|-----------|-------------------|------|-----------------|
| **Soft cache** | 24 hours | Name, avatar, email, phone | On login, daily cron |
| **Hard cache** | 15 minutes | Billing status, permissions, enrollment | On login, webhook, manual |

### Sync Triggers

```
+------------------+-----------------------------------+--------------------+
| Trigger          | Action                            | Data Refreshed     |
+------------------+-----------------------------------+--------------------+
| Student login    | B2A GET /verify-access            | billing, access    |
|                  | B2A GET /permissions              | permissions        |
|                  | B2A POST /users/batch (if stale)  | profile            |
+------------------+-----------------------------------+--------------------+
| Payment webhook  | POST /api/webhooks/payment-       | billing_status,    |
|                  | confirmed                         | access_status      |
+------------------+-----------------------------------+--------------------+
| Daily cron       | B2A POST /users/batch (all active)| profile soft cache |
+------------------+-----------------------------------+--------------------+
| Manual button    | Admin clicks "Sync Users"         | all fields         |
+------------------+-----------------------------------+--------------------+
```

### B2A Failure Resilience

```
  TMS calls B2A endpoint
       |
       +-- Success --> Update cache, proceed
       |
       +-- Failure (network/500)
            |
            +-- tms_users.last_synced_at < 24h ago
            |       --> Allow login with cached data
            |       --> Log warning, retry in background
            |
            +-- tms_users.last_synced_at >= 24h ago
                    --> Show error: "Unable to verify access"
                    --> Retry button
```

### Batch Sync (Avoiding Rate Limits)

MyJKKN B2A has a 60 req/min rate limit. For bulk operations:

```
POST /api/b2a/tms/users/batch
Body: { user_ids: ["uuid1", "uuid2", ...], fields: ["profile", "billing"] }
Response: { users: [ { user_id, name, email, billing_status, ... } ] }
Limit: 100 users per request
```

---

## 7. User Roles & Dashboards

### Role Detection & Routing

```
  JWT decoded -> auth.uid()
       |
       v
  Fetch tms_users WHERE myjkkn_user_id = auth.uid()
       |
       v
  Check role field (synced from MyJKKN profiles.role)
       |
       +-- "student" --> /dashboard
       +-- "driver"  --> /driver
       +-- "staff"   --> /staff
       +-- "admin"   --> /admin
       +-- unknown   --> /unauthorized
```

### Dashboard Features by Role

| Feature | Student | Driver | Staff | Admin |
|---------|---------|--------|-------|-------|
| View assigned route | Y | Y | Y | Y |
| Live bus tracking | Y | - | Y | Y |
| QR code display | Y | - | - | - |
| QR code scan | - | Y | Y | Y |
| Share GPS location | - | Y | - | - |
| View passenger list | - | Y | Y | Y |
| Submit grievance | Y | - | - | - |
| Manage grievances | - | - | Y | Y |
| Route CRUD | - | - | - | Y |
| Vehicle CRUD | - | - | - | Y |
| Driver management | - | - | - | Y |
| Schedule management | - | - | Y | Y |
| Enrollment management | - | - | Y | Y |
| View reports | - | - | - | Y |
| Ad-hoc booking | Y | - | - | - |

---

## 8. Enrollment Flow

### Internal 6-Step Flow

```
                          MyJKKN Side                          TMS Side
                    ========================            ===================

Step 1:  Student submits transport service request
         (pickup/drop location, timing, bus type)
                          |
Step 2:  Admin approves + assigns route + boarding point
         Creates enrollment record
                          |
Step 3:  Transport bill auto-created in billing module
         (admin can override amount)
                          |                    -------->  Grace period starts
                          |                              (7-day provisional access)
                          |
Step 4:  Student pays via HDFC SmartGateway
                          |                    -------->  Webhook fires
                          |                              access_status = 'active'
                          |
Step 5:                                                  TMS access fully enabled
                                                         Enrollment finalized
                                                                |
Step 6:                                                  Student sees assigned
                                                         route in TMS dashboard
```

### Student-Facing Mental Model (3 Steps)

```
+------------------------------------------------------+
|                                                      |
|  Step 1: "Request Transport"                         |
|  +-------------------------------------------------+ |
|  | Select pickup area, preferred timing, bus type  | |
|  | Submit request                                  | |
|  | Status: "We're finding you a route"             | |
|  +-------------------------------------------------+ |
|                         |                            |
|  Step 2: "Pay Your Bill"                             |
|  +-------------------------------------------------+ |
|  | Route assigned! Your stop: [stop name]          | |
|  | Transport fee: Rs. X,XXX                        | |
|  | [Pay Now] button -> MyJKKN billing              | |
|  | Status: "Your route is confirmed, pay to        | |
|  |          activate"                              | |
|  +-------------------------------------------------+ |
|                         |                            |
|  Step 3: "You're In!"                                |
|  +-------------------------------------------------+ |
|  | Your bus: Route 7 - Namakkal Express            | |
|  | Boarding: Stop #3 (Main Gate)                   | |
|  | Time: 8:15 AM                                   | |
|  | [Open TMS] -> tms.jkkn.ai/dashboard             | |
|  +-------------------------------------------------+ |
|                                                      |
+------------------------------------------------------+
```

---

## 9. Route & Stop Management

### Route Data Model

A route is an ordered sequence of stops with a defined path. Each route belongs to an institution and has a direction (to-campus / from-campus / both).

```
  Route: "Namakkal Express" (route_code: NMK-01)
  Direction: to_campus

  Stop 1: Namakkal Bus Stand    (08:00, order: 1, lat/lng)
       |
  Stop 2: Mohanur Junction      (08:12, order: 2, lat/lng)
       |
  Stop 3: Tiruchengode          (08:25, order: 3, lat/lng)
       |
  Stop 4: JKKN Main Gate        (08:45, order: 4, lat/lng, is_campus: true)
```

### Admin Operations

- **Create route**: name, code, direction, status, institution_id
- **Add stops**: ordered list with name, lat/lng, estimated_time, is_campus flag
- **Edit route**: Reorder stops, adjust timings, change status
- **Deactivate route**: Soft-delete (status = 'inactive'), prevent new enrollments
- **Clone route**: Duplicate route + stops for reverse direction

---

## 10. Vehicle Management

### Vehicle Data Model

Each vehicle is tracked with its capacity, registration, and current assignment.

### Admin Operations

- **Add vehicle**: registration_number, make, model, year, capacity, vehicle_type, status
- **Assign to route**: Via schedule templates (not direct vehicle-route link)
- **Track status**: active, maintenance, retired
- **Capacity management**: Total seats used for booking limits

---

## 11. Driver Management

### Driver Model

Drivers are MyJKKN users with `role='driver'`. They authenticate via Google OAuth through MyJKKN. TMS stores transport-specific details.

```
  MyJKKN profiles                    TMS tms_drivers
  +------------------+              +---------------------------+
  | id (UUID)        |              | id (UUID)                 |
  | full_name        | -- synced -> | myjkkn_user_id (FK)       |
  | email            |   to cache   | license_number            |
  | role = 'driver'  |              | license_expiry            |
  | institution_id   |              | current_vehicle_id (FK)   |
  +------------------+              | status: active/inactive   |
                                    | emergency_contact         |
                                    +---------------------------+
```

### Admin Operations

- **Register driver**: Link MyJKKN user to TMS driver record, add license info
- **Assign vehicle**: Set current_vehicle_id
- **Assign to schedule**: Via schedule templates
- **Track status**: active, on_leave, inactive

---

## 12. Scheduling System

### Two-Tier Scheduling

```
  TEMPLATE LAYER (recurring)              INSTANCE LAYER (daily)
  +--------------------------+           +-------------------------+
  | tms_schedule_templates   |  cron     | tms_schedules           |
  |                          | -------> |                         |
  | route_id                 | generates| template_id             |
  | days_of_week: [1,2,3,4,5]|  7 days | schedule_date           |
  | departure_time: 08:00   |  ahead   | actual_departure_time   |
  | vehicle_id               |          | vehicle_id              |
  | driver_id                |          | driver_id               |
  | is_active: true          |          | status: scheduled/      |
  |                          |          |   in_progress/completed/|
  |                          |          |   cancelled             |
  +--------------------------+          +-------------------------+
```

### Auto-Generation Process

```
  Cron (daily at 00:00 UTC)
       |
       v
  For each active template:
       |
       v
  For each day in next 7 days:
       |
       +-- Is day_of_week in template.days_of_week?
       |       |
       |       +-- No  --> Skip
       |       +-- Yes --> Is date in tms_holidays?
       |                       |
       |                       +-- Yes --> Skip
       |                       +-- No  --> Does schedule already exist?
       |                                       |
       |                                       +-- Yes --> Skip (idempotent)
       |                                       +-- No  --> INSERT schedule
       |
       v
  Completeness check:
       |
       v
  For each active route, verify schedules exist for next 3 days
       |
       +-- Missing? --> Alert admin via notification
```

**Key rules**:
- Generated schedules are **immutable snapshots**. Template changes only affect future generations.
- Admin can manually create or edit individual schedules (override).
- "Generate Now" button triggers the generation process on demand.
- Holidays in `tms_holidays` cause schedule generation to skip that date.

---

## 13. Booking Model

### Dual Booking System

```
  +-------------------+          +-------------------+
  | SEMESTER          |          | AD-HOC            |
  | ENROLLMENT        |          | BOOKING           |
  |                   |          |                   |
  | Student allocated |          | Student books     |
  | to route for full |          | specific trip     |
  | semester          |          | if seats available|
  |                   |          |                   |
  | Rides daily       |          | Charged per-trip  |
  | without booking   |          | via MyJKKN billing|
  |                   |          |                   |
  | Primary model     |          | Secondary model   |
  +-------------------+          +-------------------+
           |                              |
           v                              v
  +---------------------------------------------------+
  |         tms_trip_seat_assignments                  |
  |                                                   |
  |  schedule_id | seat_number | user_id | type       |
  |  ------------|-------------|---------|----------- |
  |  sched-001   | 1           | uuid-a  | enrolled   |
  |  sched-001   | 2           | uuid-b  | enrolled   |
  |  sched-001   | 3           | uuid-c  | adhoc      |
  |                                                   |
  |  UNIQUE(schedule_id, seat_number)                 |
  |  -- prevents double-booking                       |
  +---------------------------------------------------+
```

### Capacity Management

```sql
-- Capacity check before ad-hoc booking
SELECT
  v.capacity AS total_seats,
  COUNT(tsa.id) AS assigned_seats,
  v.capacity - COUNT(tsa.id) AS available_seats
FROM tms_schedules s
JOIN tms_vehicles v ON v.id = s.vehicle_id
LEFT JOIN tms_trip_seat_assignments tsa ON tsa.schedule_id = s.id
WHERE s.id = $schedule_id
GROUP BY v.capacity;

-- Enrolled students auto-assigned when daily schedule generates
-- Ad-hoc bookings create additional seat assignments
-- Constraint: enrolled_count + adhoc_count <= vehicle_capacity
```

---

## 14. Live Tracking

### Architecture

```
  DRIVER DEVICE                   TMS SUPABASE                    STUDENT DEVICE
  +-------------+               +----------------+               +-------------+
  |             |  upsert       |                |  broadcast    |             |
  | GPS every   | -----------> | tms_driver_    | -----------> | Subscribe   |
  | 30 seconds  |  (one row    | locations      |  channel:    | to channel  |
  |             |   per driver)| (hot table)    |  route:{id}  | route:{id}  |
  | lat, lng,   |              |                |              |             |
  | heading,    |              | DB trigger:    |              | Update map  |
  | speed,      |              | pg_notify()    |              | marker      |
  | timestamp   |              |       |        |              |             |
  +-------------+              |       v        |              +-------------+
                               | Edge Function  |
                               | broadcasts to  |
                               | Realtime       |
                               +----------------+
                                      |
                                      | Every 5 min
                                      v
                               +----------------+
                               | tms_driver_    |
                               | location_      |
                               | history        |
                               | (analytics)    |
                               | Pruned to 24h  |
                               +----------------+
```

### Driver Location Upsert

```sql
-- Single row per driver, updated every 30 seconds
INSERT INTO tms_driver_locations (
  driver_id, lat, lng, heading, speed, accuracy, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (driver_id)
DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  heading = EXCLUDED.heading,
  speed = EXCLUDED.speed,
  accuracy = EXCLUDED.accuracy,
  updated_at = NOW();
```

### Student Map UX

**Default view** (Dashboard ETA card):
```
+---------------------------------------+
|  Bus 7 - Namakkal Express             |
|  Driver: Mr. Kumar                    |
|                                       |
|  [BUS ICON] 3 stops away             |
|  ETA: ~8 minutes                      |
|                                       |
|  Last updated: 2 seconds ago          |
|                                       |
|  [View on Map]                        |
+---------------------------------------+
```

**Expanded view** (Full-page Leaflet map):
- Route polyline drawn on map
- Stop markers with names
- Live bus position (animated marker)
- Student's boarding stop highlighted
- ETA recalculated on each location update

---

## 15. QR Attendance

### Time-Rotating HMAC QR Codes

```
  QR Code Content (regenerates every 30 seconds):
  +--------------------------------------------------+
  |                                                  |
  |  {                                               |
  |    "sid": "student-uuid",                        |
  |    "rid": "route-uuid",                          |
  |    "eid": "enrollment-uuid",                     |
  |    "ts":  1710500400,        // Unix timestamp   |
  |    "hmac": "a3f8c2d1..."     // HMAC-SHA256      |
  |  }                                               |
  |                                                  |
  +--------------------------------------------------+

  HMAC = SHA256(
    key: TMS_QR_SECRET,
    data: sid + rid + eid + floor(ts / 30)
  )
```

**Why 30-second rotation**: Prevents screenshot sharing. A screenshot older than 60 seconds is rejected.

### Scan Verification Flow

```
  Driver/Staff opens Scan screen
       |
       v
  Camera scans student QR code
       |
       v
  Parse JSON payload
       |
       v
  Verify HMAC:
    computed = SHA256(TMS_QR_SECRET, sid + rid + eid + floor(ts/30))
    valid = computed === payload.hmac
       |
       +-- Invalid HMAC --> Reject: "Invalid QR code"
       |
       v
  Check timestamp:
    age = now() - payload.ts
       |
       +-- age > 60s --> Reject: "QR code expired"
       |
       v
  Check enrollment:
    SELECT * FROM tms_enrollments
    WHERE id = payload.eid
      AND student_id = payload.sid
      AND route_id = payload.rid
      AND status = 'active'
       |
       +-- Not found --> Reject: "No active enrollment"
       |
       v
  Record attendance:
    INSERT INTO tms_attendance (
      student_id, schedule_id, scan_type,
      scanned_by, scanned_at, lat, lng
    ) VALUES (...)
    ON CONFLICT (student_id, schedule_id, scan_date)
    DO NOTHING;   -- prevents duplicate scans
       |
       v
  Show: "Checked in: [Student Name]"
```

### QR Display Screen (Student)

```
+---------------------------------------+
|  [MAX BRIGHTNESS FORCED]              |
|                                       |
|  Your Boarding Pass                   |
|  Route: Namakkal Express              |
|  Stop: Main Gate, 8:15 AM            |
|                                       |
|  +-------------------------------+   |
|  |                               |   |
|  |     [HIGH-CONTRAST QR CODE]   |   |
|  |     (no logo overlay)         |   |
|  |     Regenerates: 28s          |   |
|  |                               |   |
|  +-------------------------------+   |
|                                       |
|  Show this to the driver/scanner     |
|                                       |
+---------------------------------------+
```

### Offline Scan Support

```
  Scanner device offline:
       |
       v
  Scan QR -> verify HMAC locally (shared secret embedded)
       |
       v
  Store attendance record in IndexedDB
       |
       v
  When online:
       |
       v
  Sync to tms_attendance
  ON CONFLICT (student_id, schedule_id, scan_date) DO NOTHING
  -- idempotent, no duplicates
```

### Manual Fallback

If QR scan fails (camera issue, bright sunlight, etc.):
1. Driver/staff taps "Manual Check-in"
2. Sees passenger list for current schedule
3. Taps student name to mark attendance
4. Record marked with `scan_method = 'manual'`

---

## 16. Grievance System

### Dual-State Model

Students see a simplified 3-state flow. Admins see the full 6-state workflow.

```
  STUDENT VIEW                         ADMIN VIEW
  ============                         ==========

  Submitted ----------------------->  Submitted
       |                                  |
       |                               Triaged (category verified)
       |                                  |
  In Progress <--------------------  Assigned (to staff member)
       |                                  |
       |                              Investigating
       |                                  |
  Resolved <-----------------------  Resolved
                                         |
                                       Closed (archived)
```

### Quick Categories

| Category | Icon | Description |
|----------|------|-------------|
| Bus Late/Didn't Come | Clock | Schedule deviation |
| Overcrowding | Users | Capacity exceeded |
| Driver Behavior | AlertTriangle | Conduct issues |
| Vehicle Condition | Wrench | Maintenance issues |
| Route Issue | MapPin | Stop/route problems |
| Other | MessageCircle | Anything else |

### SLA Display

Students see: *"Typically resolved within 48 hours"*

Admin tracks: created_at -> resolved_at delta, displayed in grievance analytics.

---

## 17. Notifications

### Outbox Pattern

TMS does NOT send notifications directly. It queues them in `tms_notification_outbox` and a background process sends them via MyJKKN B2A.

```
  TMS Event (e.g., route cancelled)
       |
       v
  INSERT INTO tms_notification_outbox (
    user_ids, title, message, category, status, attempts
  ) VALUES (
    ['uuid1', 'uuid2'], 'Route Cancelled',
    'Route NMK-01 is cancelled today due to vehicle maintenance',
    'transport', 'pending', 0
  )
       |
       v
  Cron job (every 30s):
       |
       v
  SELECT * FROM tms_notification_outbox
  WHERE status = 'pending' AND attempts < 5
  ORDER BY created_at ASC
  LIMIT 10
       |
       v
  For each notification:
    POST MyJKKN /api/b2a/notifications/send
       |
       +-- Success --> status = 'sent'
       +-- Failure --> attempts++, retry_after = now + backoff
       +-- attempts >= 5 --> status = 'failed', alert admin
```

### Urgent Notifications (Dual Channel)

For time-critical events, TMS sends BOTH:
1. Outbox -> B2A (persistent notification)
2. Supabase Realtime broadcast (instant for connected PWA users)

Events that trigger dual-channel:
- Bus breakdown
- Route cancellation
- Schedule change (same day)
- Driver swap

---

## 18. Auto-Renewal

### Semester Boundary Flow

```
  2 weeks before semester end:
       |
       v
  Cron identifies active enrollments expiring soon
       |
       v
  Send notification: "Continue transport for next semester?"
  "Tap to opt out within 7 days. Otherwise, auto-renewed."
       |
       +-- Student opts out within 7 days
       |       --> enrollment.auto_renew = false
       |       --> No further action
       |
       +-- No opt-out after 7 days
               --> Auto-create service request in MyJKKN
               --> Same route, same stop
               --> Follows standard enrollment flow (bill -> pay -> access)
```

---

## 19. PWA & Offline Support

### Capabilities

| Feature | Offline Behavior |
|---------|-----------------|
| QR code display | Works offline (generated locally with HMAC) |
| QR code scan | Works offline (verify HMAC locally, store in IndexedDB) |
| GPS sharing (driver) | Background location continues, queued for sync |
| Dashboard | Shows cached data with "Offline" banner |
| Live tracking | Paused, shows last known position |
| Grievance submission | Queued locally, synced when online |
| Route/stop info | Cached via service worker |

### Service Worker Strategy

```
  Cache-first:
    - Static assets (JS, CSS, images)
    - Route/stop data (refreshed daily)
    - QR HMAC secret (encrypted in IndexedDB)

  Network-first:
    - Schedule data
    - Attendance records
    - Notification list

  Network-only:
    - Live tracking
    - B2A API calls
    - Payment flows
```

---

## 20. Database Schema

### Complete SQL Definitions

```sql
-- =============================================================
-- TMS DATABASE SCHEMA
-- Supabase project: TMS (separate from MyJKKN)
-- All tables prefixed with tms_ for clarity
-- =============================================================

-- -------------------------------------------
-- Helper function for RLS
-- Returns the institution_id for the current JWT user
-- -------------------------------------------
CREATE OR REPLACE FUNCTION tms_user_institution_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT institution_id
  FROM tms_users
  WHERE myjkkn_user_id = auth.uid()
  LIMIT 1;
$$;

-- -------------------------------------------
-- tms_users: Mirror table for MyJKKN profiles
-- -------------------------------------------
CREATE TABLE tms_users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  myjkkn_user_id          UUID NOT NULL UNIQUE,
  institution_id          UUID NOT NULL,
  full_name               TEXT NOT NULL,
  email                   TEXT,
  phone                   TEXT,
  avatar_url              TEXT,
  role                    TEXT NOT NULL DEFAULT 'student',
  permissions             JSONB DEFAULT '[]'::JSONB,
  billing_status          TEXT DEFAULT 'unknown',
  access_status           TEXT DEFAULT 'none'
                          CHECK (access_status IN ('active','grace','expired','none')),
  grace_period_start      TIMESTAMPTZ,
  access_expires_at       TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ DEFAULT NOW(),
  hard_cache_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_users_myjkkn_id ON tms_users (myjkkn_user_id);
CREATE INDEX idx_tms_users_institution ON tms_users (institution_id);
CREATE INDEX idx_tms_users_role ON tms_users (institution_id, role);
CREATE INDEX idx_tms_users_access ON tms_users (institution_id, access_status);

-- -------------------------------------------
-- tms_routes: Route definitions
-- -------------------------------------------
CREATE TABLE tms_routes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  route_name        TEXT NOT NULL,
  route_code        TEXT NOT NULL,
  direction         TEXT NOT NULL DEFAULT 'to_campus'
                    CHECK (direction IN ('to_campus','from_campus','both')),
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','archived')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (institution_id, route_code)
);

CREATE INDEX idx_tms_routes_institution ON tms_routes (institution_id);
CREATE INDEX idx_tms_routes_status ON tms_routes (institution_id, status);

-- -------------------------------------------
-- tms_route_stops: Ordered stops per route
-- -------------------------------------------
CREATE TABLE tms_route_stops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  route_id          UUID NOT NULL REFERENCES tms_routes(id) ON DELETE CASCADE,
  stop_name         TEXT NOT NULL,
  stop_order        INT NOT NULL,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  estimated_time    TIME,
  is_campus         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (route_id, stop_order)
);

CREATE INDEX idx_tms_route_stops_route ON tms_route_stops (route_id);
CREATE INDEX idx_tms_route_stops_institution ON tms_route_stops (institution_id);

-- -------------------------------------------
-- tms_vehicles: Fleet inventory
-- -------------------------------------------
CREATE TABLE tms_vehicles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL,
  registration_number   TEXT NOT NULL,
  make                  TEXT,
  model                 TEXT,
  year                  INT,
  capacity              INT NOT NULL,
  vehicle_type          TEXT DEFAULT 'bus'
                        CHECK (vehicle_type IN ('bus','minibus','van')),
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','maintenance','retired')),
  insurance_expiry      DATE,
  fitness_expiry        DATE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (institution_id, registration_number)
);

CREATE INDEX idx_tms_vehicles_institution ON tms_vehicles (institution_id);
CREATE INDEX idx_tms_vehicles_status ON tms_vehicles (institution_id, status);

-- -------------------------------------------
-- tms_drivers: Driver transport details
-- -------------------------------------------
CREATE TABLE tms_drivers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL,
  myjkkn_user_id        UUID NOT NULL UNIQUE,
  tms_user_id           UUID REFERENCES tms_users(id),
  license_number        TEXT NOT NULL,
  license_expiry        DATE NOT NULL,
  current_vehicle_id    UUID REFERENCES tms_vehicles(id),
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','on_leave','inactive')),
  emergency_contact     TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_drivers_institution ON tms_drivers (institution_id);
CREATE INDEX idx_tms_drivers_myjkkn ON tms_drivers (myjkkn_user_id);
CREATE INDEX idx_tms_drivers_vehicle ON tms_drivers (current_vehicle_id);

-- -------------------------------------------
-- tms_schedule_templates: Recurring patterns
-- -------------------------------------------
CREATE TABLE tms_schedule_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  route_id          UUID NOT NULL REFERENCES tms_routes(id),
  vehicle_id        UUID REFERENCES tms_vehicles(id),
  driver_id         UUID REFERENCES tms_drivers(id),
  days_of_week      INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  departure_time    TIME NOT NULL,
  arrival_time      TIME,
  direction         TEXT NOT NULL DEFAULT 'to_campus'
                    CHECK (direction IN ('to_campus','from_campus')),
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_sched_templates_institution ON tms_schedule_templates (institution_id);
CREATE INDEX idx_tms_sched_templates_route ON tms_schedule_templates (route_id);
CREATE INDEX idx_tms_sched_templates_active ON tms_schedule_templates (institution_id, is_active)
  WHERE is_active = TRUE;

-- -------------------------------------------
-- tms_holidays: Institution holidays
-- -------------------------------------------
CREATE TABLE tms_holidays (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  holiday_date      DATE NOT NULL,
  name              TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (institution_id, holiday_date)
);

CREATE INDEX idx_tms_holidays_institution ON tms_holidays (institution_id);
CREATE INDEX idx_tms_holidays_date ON tms_holidays (institution_id, holiday_date);

-- -------------------------------------------
-- tms_schedules: Daily schedule instances
-- -------------------------------------------
CREATE TABLE tms_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL,
  template_id           UUID REFERENCES tms_schedule_templates(id),
  route_id              UUID NOT NULL REFERENCES tms_routes(id),
  vehicle_id            UUID REFERENCES tms_vehicles(id),
  driver_id             UUID REFERENCES tms_drivers(id),
  schedule_date         DATE NOT NULL,
  departure_time        TIME NOT NULL,
  arrival_time          TIME,
  direction             TEXT NOT NULL DEFAULT 'to_campus'
                        CHECK (direction IN ('to_campus','from_campus')),
  status                TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN (
                          'scheduled','in_progress','completed','cancelled'
                        )),
  cancellation_reason   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (template_id, schedule_date, direction)
);

CREATE INDEX idx_tms_schedules_institution ON tms_schedules (institution_id);
CREATE INDEX idx_tms_schedules_date ON tms_schedules (institution_id, schedule_date);
CREATE INDEX idx_tms_schedules_route_date ON tms_schedules (route_id, schedule_date);
CREATE INDEX idx_tms_schedules_driver_date ON tms_schedules (driver_id, schedule_date);
CREATE INDEX idx_tms_schedules_status ON tms_schedules (institution_id, status, schedule_date);

-- -------------------------------------------
-- tms_enrollments: Semester route allocations
-- -------------------------------------------
CREATE TABLE tms_enrollments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL,
  student_id            UUID NOT NULL REFERENCES tms_users(id),
  route_id              UUID NOT NULL REFERENCES tms_routes(id),
  boarding_stop_id      UUID REFERENCES tms_route_stops(id),
  semester              TEXT NOT NULL,
  academic_year         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('pending','active','expired','cancelled')),
  auto_renew            BOOLEAN DEFAULT TRUE,
  service_request_id    UUID,
  enrolled_at           TIMESTAMPTZ DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, route_id, semester, academic_year)
);

CREATE INDEX idx_tms_enrollments_institution ON tms_enrollments (institution_id);
CREATE INDEX idx_tms_enrollments_student ON tms_enrollments (student_id);
CREATE INDEX idx_tms_enrollments_route ON tms_enrollments (route_id);
CREATE INDEX idx_tms_enrollments_status ON tms_enrollments (institution_id, status);
CREATE INDEX idx_tms_enrollments_semester ON tms_enrollments (institution_id, semester, academic_year);

-- -------------------------------------------
-- tms_bookings: Ad-hoc trip bookings
-- -------------------------------------------
CREATE TABLE tms_bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  student_id        UUID NOT NULL REFERENCES tms_users(id),
  schedule_id       UUID NOT NULL REFERENCES tms_schedules(id),
  boarding_stop_id  UUID REFERENCES tms_route_stops(id),
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  billing_reference TEXT,
  booked_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_bookings_institution ON tms_bookings (institution_id);
CREATE INDEX idx_tms_bookings_student ON tms_bookings (student_id);
CREATE INDEX idx_tms_bookings_schedule ON tms_bookings (schedule_id);

-- -------------------------------------------
-- tms_trip_seat_assignments: Unified capacity
-- -------------------------------------------
CREATE TABLE tms_trip_seat_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  schedule_id       UUID NOT NULL REFERENCES tms_schedules(id),
  seat_number       INT NOT NULL,
  user_id           UUID NOT NULL REFERENCES tms_users(id),
  assignment_type   TEXT NOT NULL
                    CHECK (assignment_type IN ('enrolled','adhoc')),
  enrollment_id     UUID REFERENCES tms_enrollments(id),
  booking_id        UUID REFERENCES tms_bookings(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (schedule_id, seat_number)
);

CREATE INDEX idx_tms_seat_assignments_schedule ON tms_trip_seat_assignments (schedule_id);
CREATE INDEX idx_tms_seat_assignments_user ON tms_trip_seat_assignments (user_id);
CREATE INDEX idx_tms_seat_assignments_institution ON tms_trip_seat_assignments (institution_id);

-- -------------------------------------------
-- tms_attendance: QR scan records
-- -------------------------------------------
CREATE TABLE tms_attendance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  student_id        UUID NOT NULL REFERENCES tms_users(id),
  schedule_id       UUID NOT NULL REFERENCES tms_schedules(id),
  scan_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  scan_type         TEXT NOT NULL
                    CHECK (scan_type IN ('boarding','alighting')),
  scan_method       TEXT NOT NULL DEFAULT 'qr'
                    CHECK (scan_method IN ('qr','manual')),
  scanned_by        UUID NOT NULL REFERENCES tms_users(id),
  scanned_at        TIMESTAMPTZ DEFAULT NOW(),
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, schedule_id, scan_date, scan_type)
);

CREATE INDEX idx_tms_attendance_schedule ON tms_attendance (schedule_id);
CREATE INDEX idx_tms_attendance_student ON tms_attendance (student_id);
CREATE INDEX idx_tms_attendance_date ON tms_attendance (institution_id, scan_date);
CREATE INDEX idx_tms_attendance_schedule_date ON tms_attendance (schedule_id, scan_date);

-- -------------------------------------------
-- tms_driver_locations: Real-time GPS (hot table)
-- One row per driver, upserted every 30s
-- -------------------------------------------
CREATE TABLE tms_driver_locations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  driver_id         UUID NOT NULL UNIQUE REFERENCES tms_drivers(id),
  schedule_id       UUID REFERENCES tms_schedules(id),
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  heading           DOUBLE PRECISION,
  speed             DOUBLE PRECISION,
  accuracy          DOUBLE PRECISION,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_driver_locations_driver ON tms_driver_locations (driver_id);
CREATE INDEX idx_tms_driver_locations_institution ON tms_driver_locations (institution_id);
CREATE INDEX idx_tms_driver_locations_schedule ON tms_driver_locations (schedule_id);

-- -------------------------------------------
-- tms_driver_location_history: Periodic snapshots
-- Pruned to 24 hours for analytics
-- -------------------------------------------
CREATE TABLE tms_driver_location_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  driver_id         UUID NOT NULL REFERENCES tms_drivers(id),
  schedule_id       UUID REFERENCES tms_schedules(id),
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  heading           DOUBLE PRECISION,
  speed             DOUBLE PRECISION,
  recorded_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_loc_history_driver ON tms_driver_location_history (driver_id, recorded_at);
CREATE INDEX idx_tms_loc_history_schedule ON tms_driver_location_history (schedule_id);
CREATE INDEX idx_tms_loc_history_time ON tms_driver_location_history (recorded_at);

-- -------------------------------------------
-- tms_grievances: Transport complaints
-- -------------------------------------------
CREATE TABLE tms_grievances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL,
  student_id            UUID NOT NULL REFERENCES tms_users(id),
  route_id              UUID REFERENCES tms_routes(id),
  schedule_id           UUID REFERENCES tms_schedules(id),
  category              TEXT NOT NULL
                        CHECK (category IN (
                          'bus_late','overcrowding','driver_behavior',
                          'vehicle_condition','route_issue','other'
                        )),
  description           TEXT NOT NULL,
  student_status        TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (student_status IN ('submitted','in_progress','resolved')),
  admin_status          TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (admin_status IN (
                          'submitted','triaged','assigned',
                          'investigating','resolved','closed'
                        )),
  assigned_to           UUID REFERENCES tms_users(id),
  resolution_text       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_grievances_institution ON tms_grievances (institution_id);
CREATE INDEX idx_tms_grievances_student ON tms_grievances (student_id);
CREATE INDEX idx_tms_grievances_status ON tms_grievances (institution_id, admin_status);
CREATE INDEX idx_tms_grievances_route ON tms_grievances (route_id);

-- -------------------------------------------
-- tms_grievance_comments: Comment thread
-- -------------------------------------------
CREATE TABLE tms_grievance_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  grievance_id      UUID NOT NULL REFERENCES tms_grievances(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES tms_users(id),
  body              TEXT NOT NULL,
  is_internal       BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_grievance_comments_grievance ON tms_grievance_comments (grievance_id);
CREATE INDEX idx_tms_grievance_comments_institution ON tms_grievance_comments (institution_id);

-- -------------------------------------------
-- tms_notification_outbox: Retry queue
-- -------------------------------------------
CREATE TABLE tms_notification_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  user_ids          UUID[] NOT NULL,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'transport',
  priority          TEXT DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','urgent')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed')),
  attempts          INT DEFAULT 0,
  max_attempts      INT DEFAULT 5,
  last_attempt_at   TIMESTAMPTZ,
  retry_after       TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX idx_tms_outbox_status ON tms_notification_outbox (status, retry_after)
  WHERE status = 'pending';
CREATE INDEX idx_tms_outbox_institution ON tms_notification_outbox (institution_id);

-- -------------------------------------------
-- tms_settings: Per-institution TMS config
-- -------------------------------------------
CREATE TABLE tms_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            UUID NOT NULL UNIQUE,
  grace_period_days         INT DEFAULT 7,
  qr_rotation_seconds       INT DEFAULT 30,
  qr_expiry_seconds         INT DEFAULT 60,
  location_update_interval  INT DEFAULT 30,
  history_snapshot_interval INT DEFAULT 300,
  history_retention_hours   INT DEFAULT 24,
  schedule_generation_days  INT DEFAULT 7,
  adhoc_booking_enabled     BOOLEAN DEFAULT TRUE,
  auto_renewal_enabled      BOOLEAN DEFAULT TRUE,
  renewal_notice_days       INT DEFAULT 14,
  renewal_optout_days       INT DEFAULT 7,
  b2a_api_key               TEXT,
  webhook_secret            TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tms_settings_institution ON tms_settings (institution_id);
```

### Entity Relationship Summary

```
tms_users
  |-- 1:N --> tms_enrollments (student_id)
  |-- 1:N --> tms_bookings (student_id)
  |-- 1:N --> tms_attendance (student_id)
  |-- 1:N --> tms_grievances (student_id)
  |-- 1:1 --> tms_drivers (myjkkn_user_id)

tms_routes
  |-- 1:N --> tms_route_stops
  |-- 1:N --> tms_schedule_templates
  |-- 1:N --> tms_schedules
  |-- 1:N --> tms_enrollments

tms_vehicles
  |-- 1:N --> tms_schedule_templates (vehicle_id)
  |-- 1:N --> tms_schedules (vehicle_id)
  |-- 1:1 <-- tms_drivers (current_vehicle_id)

tms_drivers
  |-- 1:N --> tms_schedule_templates (driver_id)
  |-- 1:N --> tms_schedules (driver_id)
  |-- 1:1 --> tms_driver_locations

tms_schedule_templates
  |-- 1:N --> tms_schedules (template_id)

tms_schedules
  |-- 1:N --> tms_trip_seat_assignments
  |-- 1:N --> tms_attendance
  |-- 1:N --> tms_bookings

tms_grievances
  |-- 1:N --> tms_grievance_comments
```

---

## 21. RLS Policies

All TMS tables have Row Level Security enabled. Policies use the `tms_user_institution_id()` helper to enforce multi-tenant isolation.

### Policy Pattern

```sql
-- Enable RLS on all tables
ALTER TABLE tms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_trip_seat_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_driver_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_grievance_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_settings ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------
-- Standard institution isolation policy
-- Applied to EVERY table
-- -------------------------------------------

-- Example: tms_routes
CREATE POLICY "Institution isolation"
  ON tms_routes
  FOR ALL
  USING (institution_id = tms_user_institution_id());

-- Example: tms_users (self + institution)
CREATE POLICY "Users can read own record"
  ON tms_users
  FOR SELECT
  USING (myjkkn_user_id = auth.uid());

CREATE POLICY "Admin reads institution users"
  ON tms_users
  FOR SELECT
  USING (institution_id = tms_user_institution_id());

-- Example: tms_enrollments (students see own, admin sees all in institution)
CREATE POLICY "Students see own enrollments"
  ON tms_enrollments
  FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM tms_users WHERE myjkkn_user_id = auth.uid()
    )
  );

CREATE POLICY "Admin manages institution enrollments"
  ON tms_enrollments
  FOR ALL
  USING (institution_id = tms_user_institution_id());

-- Example: tms_grievances (student sees own, admin sees institution)
CREATE POLICY "Students see own grievances"
  ON tms_grievances
  FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM tms_users WHERE myjkkn_user_id = auth.uid()
    )
  );

CREATE POLICY "Students create own grievances"
  ON tms_grievances
  FOR INSERT
  WITH CHECK (
    student_id IN (
      SELECT id FROM tms_users WHERE myjkkn_user_id = auth.uid()
    )
  );

CREATE POLICY "Admin manages institution grievances"
  ON tms_grievances
  FOR ALL
  USING (institution_id = tms_user_institution_id());

-- Example: tms_driver_locations (drivers update own, students read for route)
CREATE POLICY "Drivers update own location"
  ON tms_driver_locations
  FOR ALL
  USING (
    driver_id IN (
      SELECT id FROM tms_drivers WHERE myjkkn_user_id = auth.uid()
    )
  );

CREATE POLICY "Institution users read driver locations"
  ON tms_driver_locations
  FOR SELECT
  USING (institution_id = tms_user_institution_id());

-- Example: tms_attendance (scanned_by creates, institution reads)
CREATE POLICY "Scanners create attendance"
  ON tms_attendance
  FOR INSERT
  WITH CHECK (institution_id = tms_user_institution_id());

CREATE POLICY "Institution reads attendance"
  ON tms_attendance
  FOR SELECT
  USING (institution_id = tms_user_institution_id());

-- Example: tms_notification_outbox (service role only for writes)
CREATE POLICY "Service role manages outbox"
  ON tms_notification_outbox
  FOR ALL
  USING (institution_id = tms_user_institution_id());

-- Example: tms_settings (admin only)
CREATE POLICY "Admin manages settings"
  ON tms_settings
  FOR ALL
  USING (institution_id = tms_user_institution_id());
```

---

## 22. B2A API Contracts

### 1. GET /api/b2a/tms/verify-access

Checks whether a student has paid the transport bill and whether access should be granted.

**Request**:
```
GET /api/b2a/tms/verify-access
Headers:
  Authorization: Bearer <JWT>
  X-API-Key: <B2A API key>
Query:
  user_id: UUID (required)
  institution_id: UUID (required)
```

**Response** (200):
```json
{
  "user_id": "uuid",
  "institution_id": "uuid",
  "has_transport_bill": true,
  "bill_status": "paid",
  "bill_amount": 15000,
  "paid_amount": 15000,
  "bill_created_at": "2026-01-15T10:00:00Z",
  "paid_at": "2026-01-20T14:30:00Z",
  "semester": "2025-26-II",
  "enrollment_approved": true,
  "approved_at": "2026-01-14T09:00:00Z",
  "access_decision": "grant",
  "reason": "bill_paid"
}
```

**Response** (200, grace period):
```json
{
  "user_id": "uuid",
  "institution_id": "uuid",
  "has_transport_bill": true,
  "bill_status": "unpaid",
  "bill_amount": 15000,
  "paid_amount": 0,
  "enrollment_approved": true,
  "approved_at": "2026-03-12T09:00:00Z",
  "access_decision": "grace",
  "grace_expires_at": "2026-03-19T09:00:00Z",
  "reason": "within_grace_period"
}
```

**Response** (200, denied):
```json
{
  "user_id": "uuid",
  "access_decision": "deny",
  "reason": "grace_period_expired"
}
```

---

### 2. POST /api/b2a/tms/users/batch

Bulk fetch user profiles to avoid rate limits.

**Request**:
```
POST /api/b2a/tms/users/batch
Headers:
  Authorization: Bearer <JWT>
  X-API-Key: <B2A API key>
Body:
{
  "user_ids": ["uuid1", "uuid2", "uuid3"],
  "fields": ["profile", "billing", "permissions"]
}
Limit: 100 user_ids per request
```

**Response** (200):
```json
{
  "users": [
    {
      "user_id": "uuid1",
      "full_name": "Arun Kumar",
      "email": "arun@jkkn.ac.in",
      "phone": "+91-9876543210",
      "avatar_url": "https://...",
      "role": "student",
      "institution_id": "uuid",
      "billing_status": "paid",
      "permissions": ["tms.attendance.manage"]
    }
  ],
  "not_found": ["uuid3"],
  "fetched_at": "2026-03-15T10:00:00Z"
}
```

---

### 3. GET /api/b2a/auth/permissions

Fetch TMS-specific permissions for a user.

**Request**:
```
GET /api/b2a/auth/permissions
Headers:
  Authorization: Bearer <JWT>
  X-API-Key: <B2A API key>
Query:
  user_id: UUID (required)
  scope: "tms" (required)
```

**Response** (200):
```json
{
  "user_id": "uuid",
  "role": "staff",
  "permissions": [
    "tms.schedules.manage",
    "tms.attendance.manage",
    "tms.bookings.view_all"
  ],
  "custom_role_id": "uuid",
  "custom_role_name": "Transport Coordinator"
}
```

---

### 4. POST /api/b2a/notifications/send

Send notifications to MyJKKN users.

**Request**:
```
POST /api/b2a/notifications/send
Headers:
  Authorization: Bearer <JWT>
  X-API-Key: <B2A API key>
Body:
{
  "user_ids": ["uuid1", "uuid2"],
  "title": "Route Cancelled",
  "message": "Route NMK-01 is cancelled today due to maintenance.",
  "category": "transport",
  "priority": "urgent",
  "action_url": "https://tms.jkkn.ai/dashboard",
  "metadata": {
    "route_id": "uuid",
    "schedule_id": "uuid"
  }
}
```

**Response** (200):
```json
{
  "sent_count": 2,
  "failed_count": 0,
  "notification_ids": ["uuid-a", "uuid-b"]
}
```

---

### 5. POST /api/b2a/billing/create-transport-bill

Auto-create transport bill when enrollment is approved.

**Request**:
```
POST /api/b2a/billing/create-transport-bill
Headers:
  Authorization: Bearer <JWT>
  X-API-Key: <B2A API key>
Body:
{
  "student_id": "uuid",
  "institution_id": "uuid",
  "semester": "2025-26-II",
  "academic_year": "2025-26",
  "route_id": "uuid",
  "route_name": "Namakkal Express",
  "amount": 15000,
  "due_date": "2026-03-19",
  "description": "Transport fee - Namakkal Express (Semester II)",
  "admin_override": false,
  "override_amount": null
}
```

**Response** (201):
```json
{
  "bill_id": "uuid",
  "student_id": "uuid",
  "amount": 15000,
  "status": "unpaid",
  "due_date": "2026-03-19",
  "payment_url": "https://app.jkkn.ai/billing/pay/uuid",
  "created_at": "2026-03-12T09:00:00Z"
}
```

---

### 6. POST /api/webhooks/payment-confirmed (MyJKKN -> TMS)

Webhook fired by MyJKKN when a transport bill is paid.

**Request** (from MyJKKN to TMS):
```
POST https://tms.jkkn.ai/api/webhooks/payment-confirmed
Headers:
  X-Webhook-Signature: HMAC-SHA256(webhook_secret, body)
  Content-Type: application/json
Body:
{
  "event": "payment.confirmed",
  "bill_id": "uuid",
  "student_id": "uuid",
  "institution_id": "uuid",
  "amount_paid": 15000,
  "payment_method": "hdfc_smartgateway",
  "transaction_id": "TXN-2026-03-15-001",
  "paid_at": "2026-03-15T14:30:00Z",
  "semester": "2025-26-II"
}
```

**TMS Processing**:
```
1. Verify HMAC signature using webhook_secret from tms_settings
2. Find tms_users WHERE myjkkn_user_id = student_id
3. Update: billing_status = 'paid', access_status = 'active'
4. Update: hard_cache_refreshed_at = NOW()
5. Response: 200 { "status": "processed" }
```

**Response** (200):
```json
{
  "status": "processed",
  "user_id": "uuid",
  "access_status": "active"
}
```

**Response** (400 - invalid signature):
```json
{
  "status": "rejected",
  "reason": "invalid_signature"
}
```

---

## 23. Security

### Security Architecture Overview

```
+-------------------------------------------------------------------+
|                        SECURITY LAYERS                            |
|                                                                   |
|  Layer 1: JWT Authentication                                      |
|  +-------------------------------------------------------------+ |
|  | Shared JWT secret between MyJKKN and TMS Supabase projects  | |
|  | auth.uid() available in all RLS policies                    | |
|  | Health check every 60 seconds                               | |
|  | On 401: redirect to MyJKKN, no local refresh                | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  Layer 2: Row Level Security                                      |
|  +-------------------------------------------------------------+ |
|  | tms_user_institution_id() STABLE function for isolation     | |
|  | institution_id on EVERY table                               | |
|  | Students: own data only                                     | |
|  | Admin/Staff: institution-scoped                             | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  Layer 3: Permission Checks                                       |
|  +-------------------------------------------------------------+ |
|  | tms.* permission keys in MyJKKN custom_roles                | |
|  | Fetched via B2A, cached in tms_users.permissions            | |
|  | Checked at API route and UI level                           | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  Layer 4: HMAC Verification                                       |
|  +-------------------------------------------------------------+ |
|  | QR codes: HMAC-SHA256 with TMS_QR_SECRET                    | |
|  | Webhooks: HMAC-SHA256 with webhook_secret per institution   | |
|  | B2A calls: API key authentication                           | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  Layer 5: Offline Data Integrity                                  |
|  +-------------------------------------------------------------+ |
|  | Offline QR codes signed with embedded HMAC secret           | |
|  | Offline attendance records verified on sync                 | |
|  | ON CONFLICT DO NOTHING prevents duplicate injection         | |
|  +-------------------------------------------------------------+ |
+-------------------------------------------------------------------+
```

### API Key Management

| Key | Stored In | Purpose |
|-----|-----------|---------|
| B2A API Key | tms_settings.b2a_api_key | TMS -> MyJKKN B2A calls |
| Webhook Secret | tms_settings.webhook_secret | Verify MyJKKN webhooks |
| TMS_QR_SECRET | Environment variable | QR code HMAC signing |
| JWT Secret | Supabase project config | Token validation |

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| QR screenshot sharing | 30-second rotation + 60-second expiry + HMAC |
| Cross-institution data leak | RLS with tms_user_institution_id() on all tables |
| Stale billing bypass | Hard cache max 15 min, webhook for instant update |
| Replay attacks on webhook | HMAC signature + idempotent processing |
| Offline data tampering | HMAC verification on sync, ON CONFLICT DO NOTHING |
| JWT theft | 60-second health check, no refresh (limits window) |
| B2A rate limit abuse | Batch endpoint (100/req), 60 req/min limit |

---

## 24. v1 Feature Scope

### Essential Features for Launch

| # | Feature | Priority | Depends On |
|---|---------|----------|-----------|
| 1 | Routes + Stops CRUD | P0 | Database setup |
| 2 | Vehicles CRUD | P0 | Database setup |
| 3 | Driver management + route assignment | P0 | Routes, Vehicles |
| 4 | Schedule templates + auto-generation | P0 | Routes, Vehicles, Drivers |
| 5 | Semester enrollment (student-to-route) | P0 | Routes, B2A integration |
| 6 | Access gate with grace period | P0 | Enrollment, B2A billing |
| 7 | Ad-hoc booking with seat management | P1 | Schedules, Capacity |
| 8 | Live bus tracking (Realtime + Leaflet) | P1 | Drivers, Schedules |
| 9 | QR attendance (time-rotating HMAC) | P1 | Enrollment, Schedules |
| 10 | Grievance system (simplified) | P2 | Users, Routes |
| 11 | Notifications via B2A + outbox | P1 | B2A integration |
| 12 | Role-based dashboards (4 roles) | P0 | Auth, Permissions |
| 13 | PWA with offline support | P1 | Core features |
| 14 | Multi-tenant isolation | P0 | Database setup |
| 15 | Auto-renewal | P2 | Enrollment, B2A billing |

### Definition of Done (v1)

- All P0 features fully functional
- All P1 features functional (minor polish OK)
- P2 features functional with basic UX
- RLS policies on all tables, tested
- Offline QR display and scan working
- Live tracking working with 30s updates
- PWA installable on Android and iOS
- Tested with 2 institutions (multi-tenant)

---

## 25. v2 Deferred Features

| Feature | Reason for Deferral |
|---------|-------------------|
| GPS device integration (MERCYDA) | Hardware dependency, vendor coordination |
| Route optimization engine | Algorithmic complexity, needs real usage data |
| Analytics dashboard (rich charts) | v1 focuses on operational features |
| Bug bounty system | MyJKKN already has bug-reporter-sdk, integrate later |
| Push notifications (FCM/APNs) | B2A notification sufficient for v1 |
| Multi-language support | English-only for v1 |
| Parent portal | Student-facing sufficient for v1 |
| Maintenance scheduling | Manual tracking sufficient for v1 |

---

## 26. Appendix: Index Recommendations

### High-Traffic Query Patterns and Supporting Indexes

| Query Pattern | Table | Index | Notes |
|--------------|-------|-------|-------|
| Login: find user by JWT | tms_users | idx_tms_users_myjkkn_id | UNIQUE, point lookup |
| Dashboard: today's schedule | tms_schedules | idx_tms_schedules_route_date | Composite |
| Dashboard: enrollment check | tms_enrollments | idx_tms_enrollments_student | Per-student |
| Live tracking: driver location | tms_driver_locations | idx_tms_driver_locations_driver | UNIQUE (one row) |
| Attendance scan: dedup check | tms_attendance | UNIQUE(student_id, schedule_id, scan_date, scan_type) | Constraint index |
| Seat availability: count | tms_trip_seat_assignments | idx_tms_seat_assignments_schedule | Per-schedule |
| Outbox: pending notifications | tms_notification_outbox | idx_tms_outbox_status | Partial (pending only) |
| Schedule gen: holiday check | tms_holidays | idx_tms_holidays_date | Composite with institution |
| Admin: grievance list | tms_grievances | idx_tms_grievances_status | Composite with institution |
| History prune: old records | tms_driver_location_history | idx_tms_loc_history_time | For DELETE WHERE recorded_at < 24h |

### Database Triggers

```sql
-- 1. Broadcast driver location updates via pg_notify
CREATE OR REPLACE FUNCTION tms_notify_driver_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify(
    'driver_location_update',
    json_build_object(
      'driver_id', NEW.driver_id,
      'schedule_id', NEW.schedule_id,
      'lat', NEW.lat,
      'lng', NEW.lng,
      'heading', NEW.heading,
      'speed', NEW.speed,
      'updated_at', NEW.updated_at
    )::TEXT
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_driver_location_notify
  AFTER INSERT OR UPDATE ON tms_driver_locations
  FOR EACH ROW
  EXECUTE FUNCTION tms_notify_driver_location();

-- 2. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION tms_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_tms_users_updated BEFORE UPDATE ON tms_users
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_routes_updated BEFORE UPDATE ON tms_routes
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_route_stops_updated BEFORE UPDATE ON tms_route_stops
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_vehicles_updated BEFORE UPDATE ON tms_vehicles
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_drivers_updated BEFORE UPDATE ON tms_drivers
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_schedules_updated BEFORE UPDATE ON tms_schedules
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_enrollments_updated BEFORE UPDATE ON tms_enrollments
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_bookings_updated BEFORE UPDATE ON tms_bookings
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_grievances_updated BEFORE UPDATE ON tms_grievances
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();
CREATE TRIGGER trg_tms_settings_updated BEFORE UPDATE ON tms_settings
  FOR EACH ROW EXECUTE FUNCTION tms_set_updated_at();

-- 3. Snapshot driver location to history every 5 minutes
-- (Handled by Edge Function cron, not a DB trigger, to control frequency)

-- 4. Prune location history older than 24 hours
-- (pg_cron job)
-- SELECT cron.schedule(
--   'prune-location-history',
--   '0 * * * *',  -- every hour
--   $$DELETE FROM tms_driver_location_history WHERE recorded_at < NOW() - INTERVAL '24 hours'$$
-- );
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | Architecture Team | Initial specification — all decisions finalized |

---

*This document is the single source of truth for TMS architecture and features. All implementation must conform to this specification. Deviations require a spec amendment with documented rationale.*
