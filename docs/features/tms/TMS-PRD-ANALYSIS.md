# Transport Management System (TMS) — Product Requirements Document

> **Document Type**: Reverse-Engineered PRD from Existing Codebase
> **Date**: March 15, 2026
> **Applications Analyzed**: TMS-ADMIN-main, TMS-PASSENGER-NEW-main
> **Analysis Method**: Multi-perspective agent team (Architecture, UX, Devil's Advocate)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Technology Stack](#3-technology-stack)
4. [User Roles & Personas](#4-user-roles--personas)
5. [Feature Inventory — Admin Portal](#5-feature-inventory--admin-portal)
6. [Feature Inventory — Passenger/Driver App](#6-feature-inventory--passengerdriverstaff-app)
7. [Core User Flows](#7-core-user-flows)
8. [Database Schema & Data Model](#8-database-schema--data-model)
9. [API Architecture](#9-api-architecture)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [Business Rules & Logic](#11-business-rules--logic)
12. [Third-Party Integrations](#12-third-party-integrations)
13. [Real-Time Features](#13-real-time-features)
14. [UI/UX Design System](#14-uiux-design-system)
15. [Notifications System](#15-notifications-system)
16. [Payment System](#16-payment-system)
17. [Grievance Management System](#17-grievance-management-system)
18. [GPS & Location Tracking](#18-gps--location-tracking)
19. [Route Optimization Engine](#19-route-optimization-engine)
20. [Reporting & Analytics](#20-reporting--analytics)
21. [Accessibility & Internationalization](#21-accessibility--internationalization)
22. [Identified Gaps & Missing Features](#22-identified-gaps--missing-features)
23. [Security Concerns & Vulnerabilities](#23-security-concerns--vulnerabilities)
24. [Performance & Scalability Issues](#24-performance--scalability-issues)
25. [Technical Debt Inventory](#25-technical-debt-inventory)
26. [Recommendations for Rebuild](#26-recommendations-for-rebuild)
27. [Appendix — File & Component Inventory](#27-appendix--file--component-inventory)

---

## 1. Executive Summary

The TMS (Transport Management System) is a comprehensive, multi-application transport management platform built for **JKKN College** to manage student bus transport operations. It consists of two interconnected Next.js 15 applications sharing a single Supabase (PostgreSQL) database:

| Application | Port | Purpose | Users |
|---|---|---|---|
| **TMS-ADMIN** | 3001 | Administrative dashboard for managing all transport operations | Super Admins, Transport Managers, Finance Admins, Operations Staff, Data Entry |
| **TMS-PASSENGER** | 3003 | Student/Driver/Staff-facing app for booking, tracking, and payments | Students, Drivers, Staff |

### Key Metrics from Analysis

| Metric | TMS-ADMIN | TMS-PASSENGER | Total |
|---|---|---|---|
| API Endpoints | ~104 | ~106 | ~210 |
| UI Components | ~97 | ~84 | ~181 |
| Pages/Screens | 23 | 20+ | 43+ |
| Database Tables | ~30+ shared | — | 30+ |
| User Roles | 5 admin roles | 3 app roles | 8 |

### Core Capabilities
- **Fleet Management**: Vehicles, drivers, GPS tracking, maintenance scheduling
- **Route Management**: Static routes with stops, fare configuration, route optimization
- **Schedule & Booking**: Date-based scheduling, seat management, QR-code check-in
- **Payment Processing**: Razorpay integration, semester fees, trip fares, receipts
- **Real-Time Tracking**: Live bus tracking via Leaflet maps, driver location sharing
- **Grievance System**: Multi-stage workflow with assignment, escalation, and SLA tracking
- **Notification Engine**: Push notifications, in-app alerts, email/SMS integration
- **Enrollment Workflow**: Student transport enrollment with admin approval
- **Analytics & Reporting**: Dashboard metrics, grievance analytics, bug bounty system

---

## 2. System Overview

### Architecture Diagram (Conceptual)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Centralized Auth Server                        │
│                   (https://auth.jkkn.ai)                         │
│              OAuth/SSO for all JKKN applications                 │
└─────────────┬──────────────────────────────┬─────────────────────┘
              │ OAuth Tokens                  │ OAuth Tokens
              ▼                               ▼
┌─────────────────────────┐    ┌──────────────────────────────────┐
│     TMS-ADMIN           │    │      TMS-PASSENGER               │
│     (Port 3001)         │    │      (Port 3003)                 │
│                         │    │                                  │
│  • Dashboard            │    │  • Student Dashboard             │
│  • Student CRUD         │    │  • Driver Dashboard              │
│  • Driver CRUD          │    │  • Staff Dashboard               │
│  • Vehicle CRUD         │    │  • Booking & Payments            │
│  • Route CRUD           │    │  • Live Tracking (Maps)          │
│  • Schedule CRUD        │    │  • Grievances                    │
│  • Payment Mgmt         │    │  • Profile & Settings            │
│  • GPS Device Mgmt      │    │  • Notifications                 │
│  • Grievance Mgmt       │    │  • QR Attendance                 │
│  • Analytics            │    │  • Bug Reports                   │
│  • Route Optimization   │    │                                  │
│  • Notification Mgmt    │    │                                  │
│  • Bug Bounty System    │    │                                  │
└────────────┬────────────┘    └────────────┬─────────────────────┘
             │                               │
             ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                            │
│           gsvbrytleqdxpdfbykqh.supabase.co                       │
│                                                                  │
│  students | routes | schedules | bookings | payments | drivers   │
│  vehicles | grievances | notifications | gps_devices | locations │
└──────────────────────────────────────────────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────┐    ┌───────────────────────────────────────┐
│   Razorpay           │    │   MERCYDA GPS Tracking               │
│   (Payment Gateway)  │    │   (console.mercydatrack.com)          │
└─────────────────────┘    └───────────────────────────────────────┘
```

### Data Flow Between Applications

| Action | Source App | Target App | Mechanism |
|---|---|---|---|
| Admin creates routes/schedules | TMS-ADMIN | TMS-PASSENGER reads | Shared Supabase DB |
| Student creates booking | TMS-PASSENGER | TMS-ADMIN manages | Shared Supabase DB |
| Student files grievance | TMS-PASSENGER | TMS-ADMIN resolves | Shared Supabase DB |
| Admin sends notification | TMS-ADMIN | TMS-PASSENGER displays | Push API + DB |
| Driver shares location | TMS-PASSENGER | Both apps display | Shared Supabase DB |
| Student makes payment | TMS-PASSENGER | TMS-ADMIN tracks | Razorpay + DB |
| Staff marks attendance | TMS-PASSENGER | TMS-ADMIN reports | Shared Supabase DB |

---

## 3. Technology Stack

### Shared Stack (Both Applications)

| Category | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router) | 15.3.4 |
| **UI Library** | React | 19.0.0 |
| **Language** | TypeScript | 5.x (strict mode) |
| **Styling** | Tailwind CSS | 4.x |
| **Database** | Supabase (PostgreSQL) | Latest |
| **Auth** | Centralized OAuth (auth.jkkn.ai) | Custom |
| **Icons** | Lucide React | 0.460.0 |
| **Charts** | Recharts | 2.15.4 |
| **Maps** | Leaflet + react-leaflet | 1.9.4 / 5.0.0 |
| **Animations** | Framer Motion | 11.18.2 |
| **Toast** | React Hot Toast | 2.4.1+ |
| **Dates** | date-fns | 2.30.0 |
| **HTTP** | Axios | 1.11.0+ |
| **QR Codes** | qrcode.react + html5-qrcode | 4.2.0 / 2.3.8 |
| **Payments** | Razorpay | 2.9.6 |
| **Push** | web-push (VAPID) | 3.6.7 |
| **Bug Reports** | @boobalan_jkkn/bug-reporter-sdk | 1.0.6 |

### TMS-ADMIN Specific

| Category | Technology |
|---|---|
| **UI Components** | Radix UI (Dialog, Alert, Tabs, Scroll Area) |
| **Toast (alt)** | Sonner 2.0.7 |
| **Deployment** | Docker + Docker Compose + Nginx |

### TMS-PASSENGER Specific

| Category | Technology |
|---|---|
| **UI Components** | Shadcn/ui-inspired custom components |
| **Testing** | Jest 30 + Playwright 1.54 + Testing Library |
| **PWA** | Web Manifest + Service Worker |

---

## 4. User Roles & Personas

### Admin Portal Roles (TMS-ADMIN)

| Role | Permissions | Description |
|---|---|---|
| **Super Admin** | Full access to all features | System owner, can manage users, settings, and all operations |
| **Transport Manager** | Routes, schedules, vehicles, drivers | Manages transport infrastructure and logistics |
| **Finance Admin** | Payments, fees, receipts, refunds | Handles all financial operations |
| **Operations Admin** | Bookings, grievances, notifications, attendance | Day-to-day operational management |
| **Data Entry** | Student records, basic data updates | Limited to data entry operations |

### Passenger App Roles (TMS-PASSENGER)

| Role | Access Level | Description |
|---|---|---|
| **Student/Passenger** | Dashboard, routes, bookings, payments, grievances, live tracking, profile | Primary end-user of the transport service |
| **Driver** | Dashboard, assigned routes, passenger list, location sharing, attendance | Operates buses and shares live location |
| **Staff** | Dashboard, assigned routes, attendance marking, student management, grievances | Administrative staff supporting transport operations |

### User Personas

**Enrolled Student (Primary User)**
- Views assigned route and schedule
- Tracks bus in real-time on map
- Makes semester/trip payments via Razorpay
- Files grievances about service quality
- Receives push notifications about schedule changes

**Bus Driver**
- Logs in with direct credentials
- Starts/stops location sharing for real-time tracking
- Views passenger list for current route
- Marks attendance via QR code scanning

**Transport Staff**
- Manages attendance across routes
- Reviews and resolves grievances
- Monitors route operations
- Generates operational reports

**Super Admin**
- Full fleet management (vehicles, drivers, routes)
- Creates and manages schedules
- Configures payment plans and semester fees
- Monitors analytics dashboard
- Handles enrollment approvals
- Manages GPS devices
- Sends bulk notifications

---

## 5. Feature Inventory — Admin Portal

### 5.1 Dashboard (`/dashboard`)
- **Overview Statistics**: Total students, drivers, routes, vehicles, bookings, revenue
- **Quick Metrics**: Confirmed bookings, pending payments, open grievances, today's revenue
- **Visual Charts**: Booking trends, revenue charts, grievance distribution

### 5.2 Student Management (`/students`)
- **CRUD Operations**: Add, edit, view, delete students
- **Enrollment Management**: Approve/reject transport enrollment requests
- **Route Allocation**: Assign students to routes with boarding points
- **Transport Profile**: Track payment status, fines, outstanding amounts
- **Location Tracking**: View real-time student location (if enabled)
- **External Data Sync**: Import student data from external API
- **Filters**: By department, program, enrollment status, transport status

### 5.3 Driver Management (`/drivers`)
- **CRUD Operations**: Add, edit, view, delete drivers
- **Profile Tracking**: License number, expiry, medical certification, experience
- **Route Assignment**: Assign drivers to one or multiple routes
- **Performance Metrics**: Rating, total trips, completion rate
- **Location Monitoring**: Real-time driver location tracking
- **Status Management**: active / inactive / on_leave

### 5.4 Vehicle Management (`/vehicles`)
- **CRUD Operations**: Add, edit, view, delete vehicles
- **Fleet Tracking**: Registration, model, capacity, fuel type
- **Compliance**: Insurance expiry, fitness certificate, maintenance schedules
- **Status Management**: active / maintenance / retired
- **Route Assignment**: Link vehicles to specific routes
- **Mileage Tracking**: Track vehicle mileage

### 5.5 Route Management (`/routes`)
- **CRUD Operations**: Create, edit, delete routes
- **Stop Configuration**: Define stops with sequence order, coordinates, times
- **Fare Setting**: Per-route fare configuration
- **Capacity Management**: Track total capacity vs current passengers
- **Map Visualization**: Display routes on Leaflet map with stop markers
- **Stop Search**: Search and add stops by name/location

### 5.6 Schedule Management (`/schedules`)
- **Bulk Creation**: Create multiple schedules at once
- **Calendar View**: Global calendar with all scheduled trips
- **Seat Management**: Track available vs booked seats
- **Booking Controls**: Enable/disable booking per schedule
- **Status Transitions**: scheduled → in_progress → completed / cancelled
- **Driver/Vehicle Assignment**: Optional per-schedule assignment
- **Trip Completion**: Mark trips as completed with metrics
- **Auto-complete**: Auto-fill route information

### 5.7 Booking Management (`/bookings`)
- **View All Bookings**: List with filters (date, route, status, student)
- **Booking CRUD**: Create, update, cancel bookings
- **Status Tracking**: confirmed → completed / cancelled → no_show
- **QR Code Generation**: For student check-in
- **Payment Status**: Track payment for each booking

### 5.8 Payment Management (`/payments`)
- **Payment Processing**: Record and track payments
- **Semester Fees**: Configure semester fee structures (3-term academic year)
- **Payment Plans**: Define payment plan options
- **Receipt Generation**: Auto-generate receipts with transaction IDs
- **Status Tracking**: pending → completed / failed / refunded
- **Payment Methods**: Cash, UPI, Card, Net Banking, Wallet
- **Financial Reports**: Revenue tracking, pending amounts, refund management

### 5.9 GPS & Device Management (`/gps-devices`)
- **Device Registry**: Add, activate, deactivate GPS devices
- **MERCYDA Integration**: Sync with MERCYDA tracking platform
- **Auto-Sync**: Automatic location synchronization
- **Direct Tracking**: Real-time vehicle tracking without device middleware
- **Alert System**: Geofence and speed alerts

### 5.10 Real-Time Vehicle Tracking (`/track-all`)
- **Map Dashboard**: All vehicles displayed on single Leaflet map
- **Driver Markers**: Real-time driver positions with metadata
- **Route Overlays**: Visual route polylines on map
- **Status Indicators**: Online/offline/recent status per driver

### 5.11 Grievance Management (`/grievances`)
- **Full Workflow**: SUBMITTED → TRIAGED → ASSIGNED → INVESTIGATING → PENDING_APPROVAL → IMPLEMENTING → RESOLVED → CLOSED
- **Assignment**: Assign grievances to specific admin users
- **Bulk Operations**: Bulk assign, bulk status change
- **Communication**: Internal/external threaded communications
- **Activity Log**: Full audit trail of all state changes
- **Attachments**: File upload support
- **SLA Tracking**: Deadline and progress monitoring
- **Analytics**: Category/priority/status breakdowns, resolution time metrics
- **Escalation**: Multi-level escalation workflow

### 5.12 Notification Management (`/notifications`)
- **Create Notifications**: Title, message, type, category, target audience
- **Push Notifications**: Web push via VAPID keys
- **Bulk Push**: Send to all students, drivers, or specific users
- **Scheduling**: Schedule notifications for future delivery
- **Expiry**: Set notification expiry dates
- **Analytics**: Delivery tracking, read rates, reach estimation
- **Email/SMS**: Optional email and SMS delivery

### 5.13 Enrollment Requests (`/enrollment-requests`)
- **Pending Queue**: View all pending enrollment requests
- **Approval Workflow**: Approve with route allocation
- **Rejection**: Reject with reason
- **Route Assignment**: Assign route and boarding point on approval
- **Notification**: Auto-notify student of decision

### 5.14 Route Optimization (`/route-optimization`)
- **Algorithm-Based**: Calculate optimized routes based on constraints
- **Student Transfers**: Plan and execute student transfers between routes
- **Cost-Benefit Analysis**: Compare optimization options
- **Enhanced Mode**: Advanced constraints and multi-variable optimization

### 5.15 Staff Route Assignments (`/staff-route-assignments`)
- **Assign Staff**: Link staff members to specific routes for oversight
- **Management View**: See all staff-route assignments

### 5.16 Analytics (`/analytics`)
- **Dashboard Metrics**: Student/driver/route/vehicle counts
- **Revenue Analytics**: Daily/monthly revenue breakdown
- **Booking Trends**: Booking volume over time
- **Grievance Analytics**: Category/priority distributions, resolution times
- **Bug Bounty Stats**: Hunter leaderboard, severity distribution

### 5.17 Bug Management (`/bug-management`)
- **Bug Reports**: View and manage submitted bug reports
- **Bounty System**: Track bug bounty hunters and rewards
- **Leaderboard**: Hunter performance rankings
- **Severity Tracking**: Critical/high/medium/low classification

### 5.18 Audit Logs
- **Action Tracking**: Log admin actions with user, resource, timestamp
- **Severity Levels**: Categorize log entries by importance
- **Searchable**: Filter audit logs by user, action, date

### 5.19 Settings (`/settings`)
- **System Configuration**: Global system settings
- **API Settings**: External API configuration
- **Booking Window**: Configure booking time constraints

---

## 6. Feature Inventory — Passenger/Driver/Staff App

### 6.1 Student/Passenger Features

#### Dashboard (`/dashboard`)
- Quick action cards (Book, Track, Pay, Report)
- Stats overview (upcoming trips, payment status)
- Recent bookings list
- Payment status summary
- Spending analytics charts
- Enrollment status (if not yet enrolled)

#### My Routes (`/dashboard/routes`)
- View allocated route details
- Route information: number, name, from/to, departure time
- Driver information card with contact details
- Route stops displayed in vertical stepper format
- Filter by status (active/upcoming/completed)

#### Live Tracking (`/dashboard/live-track`)
- Leaflet map with real-time bus position
- Route polyline overlay (start → stops → end)
- Stop markers with arrival time estimates
- GPS status indicators (online/recent/offline)
- Driver info card with contact
- ETA display to next stop
- Auto-center on bus location

#### Schedules (`/dashboard/schedules`)
- Calendar view of upcoming schedules
- Schedule details per route
- Available seats display
- Time and date filtering
- Status indicators (scheduled/in progress/completed)

#### Payments (`/dashboard/payments`)
- Semester fee breakdown and payment
- Trip fare payment
- Razorpay payment gateway (UPI, Card, Net Banking, Wallet)
- Payment history with filters (date, type, status)
- Invoice/receipt generation and download
- Payment status tracking (active/inactive/pending/failed)
- QR code on receipts

#### Grievances (`/dashboard/grievances`)
- Submit new grievance (route, category, priority, description)
- Track grievance status (open → in_progress → resolved → closed)
- Activity timeline with all updates
- Group chat for community discussion
- Rating system upon resolution
- Search and filter by status/category/priority/date

#### Notifications (`/dashboard/notifications`)
- Notification list with timestamps
- Filter by type (info/warning/error/success)
- Filter by category (transport/payment/system/emergency)
- Search functionality
- Mark as read / delete
- Push notification permission management

#### Profile (`/dashboard/profile`)
- Editable: phone, DOB, gender, address, emergency contact
- Read-only: name, email, roll number, department, program
- Profile completion percentage tracker
- Auto-save with validation

#### Settings (`/dashboard/settings`)
- Notification preferences (push/email/SMS toggles)
- Privacy settings (profile visibility, location sharing)
- Display preferences (dark/light theme, language, font size)
- Account security (password change, session management)

### 6.2 Driver Features

#### Driver Dashboard (`/driver`)
- Location sharing toggle (primary CTA — start/stop sharing)
- Assigned route information
- Route stops in vertical stepper format
- Daily trip summary
- Quick stats (total passengers, completed trips)

#### Routes (`/driver/routes`)
- View all assigned routes
- Route details with stops and timing
- Passenger count per route
- Route status indicators

#### Bookings/Passengers (`/driver/bookings`, `/driver/passengers`)
- View passenger list for current route
- Passenger boarding status (confirmed/no-show/cancelled)
- Check-in functionality
- Contact information display

#### Live Tracking (`/driver/live-tracking`)
- Start/stop location sharing
- Map display of current position
- Update frequency: every 30 seconds (configurable)
- GPS accuracy and speed display
- Heading direction indicator

#### Location Settings (`/driver/location`)
- Update interval slider (5-60 seconds)
- Enable/disable location sharing toggle
- Background location permission
- Privacy settings

#### Profile (`/driver/profile`)
- Name, license number, phone, experience
- Vehicle assignment display
- Trip statistics
- Document management (license, insurance)

### 6.3 Staff Features

#### Staff Dashboard (`/staff`)
- Route statistics overview
- Operations summary
- Quick access to key functions

#### Attendance (`/staff/attendance`, `/staff/attendance-manage`)
- QR-based attendance marking
- Scan student QR code for boarding/alighting
- Attendance history viewing
- Route-specific attendance reports
- Date picker for specific attendance records

#### Students (`/staff/students`)
- Student directory with search
- Filter by department, program, enrollment status
- Student transport status viewing

#### Assigned Routes (`/staff/assigned-routes`)
- View staff-assigned routes
- Route management details
- Booking management per route

#### Grievances (`/staff/grievances`)
- Review and resolve grievances
- Filter by assigned staff, resolution status
- Bulk actions (reassign, close)

#### Reports (`/staff/reports`)
- Generated reports and analytics
- Operational metrics

---

## 7. Core User Flows

### 7.1 Student Enrollment Flow

```
1. Student authenticates via OAuth (MYJKKN / Google SSO)
   └→ Fallback: email/password login
2. Dashboard shows "Enrollment Required" state
3. Student submits transport enrollment request
4. Admin reviews request in TMS-ADMIN → Enrollment Requests
5. Admin approves → assigns route + boarding point
   └→ OR Admin rejects → sends rejection reason
6. Student receives push notification of decision
7. If approved: Full dashboard unlocked (routes, tracking, payments, etc.)
8. Student completes semester fee payment via Razorpay
9. Student can now view schedules, track bus, file grievances
```

### 7.2 Booking & Trip Flow

```
1. Admin creates schedule for a route (date, time, driver, vehicle)
2. Admin enables booking for that schedule
3. Student views available schedules on calendar
4. Student selects schedule → chooses boarding stop
5. System checks seat availability
6. If seats available → booking confirmed → QR code generated
7. Payment processed (if per-trip model)
8. Day of trip:
   a. Driver starts location sharing
   b. Student tracks bus on live map
   c. Staff/Driver marks attendance via QR scan
   d. Student boards at designated stop
9. Trip completes → admin/system marks trip completed
10. Attendance records saved
```

### 7.3 Payment Flow

```
1. Student navigates to Payments section
2. System displays:
   - Semester fee (if due) with breakdown
   - Trip fare (if per-trip model)
   - Outstanding fines (if any)
3. Student selects payment type and amount
4. Razorpay modal opens with options:
   - UPI (Google Pay, PhonePe, Paytm, BHIM)
   - Card (Visa, Mastercard, Amex, Rupay)
   - Net Banking (all major banks)
   - Wallet (PayZapp, Airtel Money, MobiKwik)
5. Student completes payment
6. Server verifies payment signature via /api/payments/verify
7. Payment status updated in database
8. Receipt generated with:
   - Transaction ID, amount, date/time
   - Student details, QR code
   - Download/print options
9. Push notification sent confirming payment
```

### 7.4 Grievance Flow

```
1. Student submits grievance:
   - Selects route, category, priority
   - Writes subject + description
   - Optional: attaches files
2. Grievance status: SUBMITTED
3. Admin views in TMS-ADMIN → Grievances
4. Admin triages → TRIAGED
5. Admin assigns to specific staff → ASSIGNED
6. Staff investigates → INVESTIGATING
7. Staff sends communication to student (internal/external)
8. Student receives notification, can reply
9. If approval needed → PENDING_APPROVAL
10. Resolution implemented → IMPLEMENTING
11. Issue resolved → RESOLVED (resolution text recorded)
12. Student rates satisfaction
13. Grievance closed → CLOSED
14. Full activity log maintained throughout
```

### 7.5 Driver Location Sharing Flow

```
1. Driver logs in via direct authentication
2. Dashboard shows "Location Sharing" card (primary action)
3. Driver taps "Start Sharing" (green toggle)
4. DriverLocationTracker component activates:
   - Requests GPS permission
   - Starts sending location every 30 seconds
   - Updates: latitude, longitude, heading, speed, accuracy
5. Database updated in real-time (driver_locations table)
6. Students on that route see live bus position on map
7. GPS status shown: Online (active) / Recent (< 5 min) / Offline (> 5 min)
8. Driver taps "Stop Sharing" (red toggle) → updates cease
```

### 7.6 Admin Route Creation Flow

```
1. Admin navigates to Routes → Add Route
2. Fills in: route number, name, start/end locations (with coordinates)
3. Sets departure/arrival times, fare, capacity
4. Adds stops in sequence:
   - Stop name, coordinates, expected time, major/minor flag
5. Assigns driver and vehicle (optional)
6. Route saved → status: active
7. Creates schedules for the route (bulk creation available)
8. Assigns students to route via enrollment approval
9. Students see route in their dashboard
```

---

## 8. Database Schema & Data Model

### 8.1 Core Entity Relationship

```
┌─────────────┐       ┌──────────────┐       ┌────────────┐
│  students   │──────>│  bookings    │<──────│  schedules │
│             │       │              │       │            │
│ student_id  │       │ booking_id   │       │ schedule_id│
│ name        │       │ student_id   │       │ route_id   │
│ email       │       │ route_id     │       │ date       │
│ roll_number │       │ schedule_id  │       │ dep_time   │
│ department  │       │ boarding_stop│       │ arr_time   │
│ program     │       │ status       │       │ avail_seats│
│ institution │       │ payment_stat │       │ booked_seats│
└──────┬──────┘       │ qr_code     │       │ driver_id  │
       │              │ amount       │       │ vehicle_id │
       │              └──────────────┘       │ status     │
       │                                     └─────┬──────┘
       │                                           │
       ▼                                           ▼
┌──────────────────┐              ┌──────────────────────┐
│student_transport_ │              │      routes          │
│profiles           │              │                      │
│                   │──────────────│ route_id             │
│ student_id        │              │ route_number         │
│ allocated_route_id│              │ route_name           │
│ boarding_point    │              │ start/end_location   │
│ transport_status  │              │ departure/arrival    │
│ payment_status    │              │ distance, duration   │
│ total_fines       │              │ capacity, fare       │
│ outstanding_amt   │              │ driver_id            │
└──────────────────┘              │ vehicle_id           │
                                  │ status               │
                                  └──────┬───────────────┘
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                   ┌────────────┐ ┌──────────┐ ┌─────────────┐
                   │route_stops │ │ drivers  │ │  vehicles   │
                   │            │ │          │ │             │
                   │ stop_name  │ │ name     │ │ reg_number  │
                   │ sequence   │ │ license  │ │ model       │
                   │ time       │ │ phone    │ │ capacity    │
                   │ lat/long   │ │ rating   │ │ fuel_type   │
                   │ is_major   │ │ trips    │ │ insurance   │
                   └────────────┘ │ status   │ │ fitness     │
                                  └──────────┘ │ status      │
                                               └─────────────┘
```

### 8.2 Complete Table Inventory

#### User & Authentication
| Table | Purpose |
|---|---|
| `admin_users` | Admin portal users (id, name, email, role, is_active) |
| `admin_login_mapping` | Admin credential mapping (admin_id, password) |
| `auth_sessions` | Active session management |
| `push_subscriptions` | Web push notification subscriptions |

#### Transport Core
| Table | Purpose |
|---|---|
| `students` | Student master records (name, email, roll_number, department, program, institution) |
| `student_transport_profiles` | Transport-specific data (allocated_route, boarding_point, payment_status, fines) |
| `student_locations` | Real-time student location data |
| `routes` | Route definitions (number, name, start/end, times, fare, capacity) |
| `route_stops` | Ordered stops per route (name, time, sequence, coordinates, major flag) |
| `route_allocations` | Student-to-route assignments (student_id, route_id, date, type) |
| `drivers` | Driver profiles (name, license, phone, rating, trips, status) |
| `driver_locations` | Real-time driver GPS data (lat, long, heading, speed) |
| `vehicles` | Vehicle inventory (registration, model, capacity, fuel, insurance, fitness, maintenance) |

#### Scheduling & Bookings
| Table | Purpose |
|---|---|
| `schedules` | Trip schedules (route, date, times, seats, driver, vehicle, status) |
| `bookings` | Individual bookings (student, route, schedule, stop, status, payment, QR code) |

#### Payments & Finance
| Table | Purpose |
|---|---|
| `payments` | Payment transactions (student, booking, amount, type, method, status, transaction_id) |
| `semester_fees` | Semester fee rates (student, semester, amount, academic_year) |
| `semester_payments` | Semester payment records (student, semester, amount_paid, date, status) |
| `payment_plans` | Payment plan definitions (name, amount, tenure, description) |
| `audit_logs` | Financial audit trail |

#### Grievance Management
| Table | Purpose |
|---|---|
| `grievances` | Grievance records (student, route, category, priority, status, assigned_to, resolution) |
| `grievance_communications` | Threaded messages (grievance, message, sender, type, internal flag) |
| `grievance_activity_log` | State change audit trail |
| `grievance_progress_tracker` | SLA and deadline tracking |

#### Notifications
| Table | Purpose |
|---|---|
| `notifications` | Notification messages (title, message, type, category, target, schedule, expiry) |
| `notification_read_status` | Per-user read tracking |

#### GPS & Tracking
| Table | Purpose |
|---|---|
| `gps_devices` | GPS device registry (device_name, device_id, vehicle_id, status, mercyda_id) |
| `gps_locations` | Aggregated location history |
| `mercyda_sync_logs` | MERCYDA API sync history |

#### Administrative
| Table | Purpose |
|---|---|
| `admin_settings` | System-wide configuration |
| `staff_route_assignments` | Staff-to-route assignments |
| `enrollment_requests` | Pending enrollment queue |
| `bug_reports` | Bug bounty submissions |
| `bug_bounty_hunters` | Hunter profiles and leaderboard |

### 8.3 Semester Fee Structure

```
Academic Year: 2024-25
├── Term 1: June - November
├── Term 2: December - May (next year)
└── Term 3: (Configurable)

Fee Model:
- Per-route flat fare
- No distance-based pricing
- No stop-based pricing
- Discount support with reason tracking
- Late fee calculation on overdue
```

---

## 9. API Architecture

### 9.1 TMS-ADMIN API Endpoints (~104)

#### Authentication (3)
```
POST /api/auth/login          - Admin login (adminId + password)
POST /api/auth/token          - Token generation/refresh
POST /api/auth/validate       - Session validation
```

#### Dashboard & Analytics (4)
```
GET  /api/admin/dashboard     - Dashboard statistics
GET  /api/admin/analytics     - Detailed analytics data
GET  /api/admin/audit-logs    - Audit trail entries
GET  /api/admin/api-settings  - API configuration
```

#### Student Management (6)
```
GET    /api/admin/students               - List with filters & pagination
POST   /api/admin/students               - Create student
PUT    /api/admin/students/[id]          - Update student
DELETE /api/admin/students/[id]          - Delete student
GET    /api/admin/students/check-email   - Email uniqueness check
GET    /api/admin/students/[id]/location - Real-time location
```

#### Driver Management (6)
```
GET    /api/admin/drivers                           - List drivers
POST   /api/admin/drivers                           - Create driver
PUT    /api/admin/drivers/[id]                      - Update driver
DELETE /api/admin/drivers/[id]                      - Delete driver
GET    /api/admin/drivers/location/[id]             - Real-time location
GET/POST /api/admin/drivers/[id]/route-assignments  - Route assignments
```

#### Route Management (5)
```
GET    /api/admin/routes                    - List routes
POST   /api/admin/routes                    - Create route
PUT    /api/admin/routes/[id]               - Update route
DELETE /api/admin/routes/[id]               - Delete route
POST   /api/admin/routes/[id]/stops         - Manage route stops
POST   /api/admin/routes/search-stops       - Search stops
```

#### Vehicle Management (4)
```
GET    /api/admin/vehicles          - List vehicles
POST   /api/admin/vehicles          - Create vehicle
PUT    /api/admin/vehicles/[id]     - Update vehicle
DELETE /api/admin/vehicles/[id]     - Delete vehicle
```

#### Schedule Management (10+)
```
GET  /api/admin/schedules/enhanced-list       - List with details
POST /api/admin/schedules/create-bulk         - Bulk creation
PUT  /api/admin/schedules/bulk-update         - Bulk update
GET  /api/admin/schedules/global-calendar     - Calendar view
GET  /api/admin/schedules/booking-availability - Seat availability
POST /api/admin/schedules/booking-controls    - Configure controls
GET  /api/admin/schedules/passengers          - Passengers per schedule
POST /api/admin/schedules/complete-trip       - Mark trip complete
POST /api/admin/schedules/toggle-status       - Enable/disable
GET  /api/admin/schedules/route-summaries     - Route statistics
POST /api/admin/schedules/auto-complete       - Auto-fill route data
```

#### Grievance Management (15+)
```
GET    /api/admin/grievances                      - List with filters
POST   /api/admin/grievances                      - Create
GET    /api/admin/grievances/[id]                 - Details
PUT    /api/admin/grievances/[id]                 - Update
POST   /api/admin/grievances/[id]/assign          - Assign to staff
POST   /api/admin/grievances/[id]/resolve         - Mark resolved
POST   /api/admin/grievances/[id]/communications  - Add message
GET    /api/admin/grievances/[id]/communications  - Get messages
GET    /api/admin/grievances/[id]/activities       - Activity log
POST   /api/admin/grievances/[id]/attachments     - Upload file
POST   /api/admin/grievances/bulk                 - Bulk operations
POST   /api/admin/grievances/bulk-assign          - Bulk assign
GET    /api/admin/grievances/analytics            - Analytics
GET    /api/admin/grievances/assigned             - My assignments
GET    /api/admin/grievances/notifications        - Notifications
```

#### Notification Management (10+)
```
GET  /api/admin/notifications              - List
POST /api/admin/notifications              - Create
POST /api/admin/notifications/send         - Send notification
POST /api/admin/notifications/push         - Send push
POST /api/admin/notifications/bulk-push    - Bulk push
POST /api/admin/notifications/[id]/read    - Mark read
GET  /api/admin/notifications/stats        - Statistics
GET  /api/admin/notifications/analytics    - Analytics
GET  /api/admin/notifications/estimate-users - Reach estimation
POST /api/admin/notifications/test         - Test notification
```

#### GPS & Tracking (7)
```
GET  /api/admin/gps/devices              - List devices
POST /api/admin/gps/devices              - Register device
POST /api/admin/gps/devices/[id]/activate - Activate
GET  /api/admin/gps/location             - Vehicle locations
GET  /api/admin/gps/direct-tracking      - Direct tracking
POST /api/admin/gps/auto-sync            - Auto-sync
POST /api/admin/gps/mercyda-sync         - Manual MERCYDA sync
```

#### Payment & Finance (7)
```
GET  /api/admin/payments          - List payments
POST /api/admin/payments          - Record payment
PUT  /api/admin/payments/[id]     - Update payment
GET  /api/admin/semester-fees     - Fee configuration
POST /api/admin/semester-fees     - Create fees
GET  /api/admin/semester-payments - Payment records
GET  /api/admin/payment-plans     - Plan options
```

#### Route Optimization (3)
```
POST /api/admin/route-optimization              - Calculate
POST /api/admin/route-optimization/enhanced     - Enhanced optimization
POST /api/admin/route-optimization/execute-transfers - Execute transfers
```

#### Enrollment (3)
```
GET  /api/admin/enrollment-requests          - Pending requests
POST /api/admin/enrollment-requests/approve  - Approve
POST /api/admin/enrollment-requests/reject   - Reject
```

### 9.2 TMS-PASSENGER API Endpoints (~106)

#### Authentication (10+)
```
POST /api/auth/login                  - OAuth login
POST /api/auth/direct-login           - Email/password fallback
POST /api/auth/driver-direct-login    - Driver auth
POST /api/auth/driver-login           - Driver OAuth
POST /api/auth/staff-direct-login     - Staff auth
POST /api/auth/validate               - Token validation
POST /api/auth/token                  - Token refresh
POST /api/auth/sync-external-id       - External ID sync
POST /api/auth/oauth-workaround       - OAuth fallback
POST /api/auth/driver-password-reset  - Password reset
```

#### Driver APIs (10+)
```
GET  /api/driver/routes              - Assigned routes
GET  /api/driver/routes/[id]         - Route details
GET  /api/driver/bookings            - Route bookings
GET  /api/driver/passengers          - Enrolled passengers
POST /api/driver/location/update     - Update location
GET  /api/driver/locations           - Location history
GET  /api/driver/profile             - Get profile
POST /api/driver/profile/create      - Create profile
PUT  /api/driver/profile/update      - Update profile
GET  /api/driver/location/settings   - Location settings
```

#### Student/Passenger APIs
```
GET  /api/enrollment/status          - Check enrollment
POST /api/enrollment/request         - Request enrollment
GET  /api/grievances                 - List grievances
POST /api/grievances                 - Create grievance
GET  /api/grievances/[id]/comments   - Get comments
POST /api/grievances/[id]/comments   - Add comment
GET  /api/grievances/[id]/activities - Activity log
```

#### Staff APIs
```
GET  /api/staff/assigned-routes      - Staff routes
GET  /api/staff/attendance           - Get attendance
POST /api/staff/attendance/mark      - Mark attendance
GET  /api/staff/students             - Student list
GET  /api/staff/bookings             - Bookings
```

#### Payment APIs
```
POST /api/payments/initiate          - Start payment
POST /api/payments/verify            - Verify payment
GET  /api/payments/history           - Payment history
```

#### Notification APIs
```
POST /api/notifications/subscribe    - Subscribe to push
POST /api/notifications/unsubscribe  - Unsubscribe
GET  /api/notifications              - List notifications
```

#### Bug Report APIs
```
POST /api/bug-reports                - Submit report
GET  /api/bug-reports/my-reports     - User's reports
GET  /api/bug-reports/[id]           - Report details
```

---

## 10. Authentication & Authorization

### 10.1 Authentication Architecture

```
Primary Auth: Centralized OAuth Server
├── URL: https://auth.jkkn.ai
├── Protocol: OAuth 2.0 / SSO
├── Admin App ID: tms_admin_portal_mfhsyxnn
├── Passenger App ID: transport_management_system_menrm674
└── Callback Routes: /auth/callback per app

Fallback Auth: Direct Login
├── Email + Password
├── Stored in admin_login_mapping / Supabase auth
├── Used when OAuth unavailable
└── Separate endpoints per role (driver, staff, student)
```

### 10.2 Session Management
- **Storage**: localStorage for user data + JWT tokens
- **Context API**: AuthProvider wraps entire application
- **Auto-validation**: Optional session validation on app load
- **Auto-refresh**: Token refresh every 10 minutes (configurable)
- **Supabase**: Service role key for server-side operations

### 10.3 Role-Based Access Control

**Admin Navigation Adaptation:**
- Sidebar items shown/hidden based on user role
- API endpoints check role before processing
- Permission checks: create, read, update, delete, approve

**Passenger App Guards:**
- `ProtectedRoute` component wraps authenticated pages
- `DriverRouteGuard` protects driver-only routes
- Enrollment status checked for transport-specific features
- Role-based redirects (passenger→/dashboard, driver→/driver, staff→/staff)

---

## 11. Business Rules & Logic

### 11.1 Booking Rules
| Rule | Details |
|---|---|
| Booking Window | Strict cutoff at 7:00 PM |
| Day-Before Booking | Can only book for next day |
| Seat Capacity | Cannot exceed route total_capacity |
| Duplicate Prevention | One booking per student per schedule |
| Status Transitions | confirmed → completed / cancelled → no_show |
| QR Check-in | QR code generated per booking for attendance |
| Enrollment Required | Student must be enrolled to book |

### 11.2 Payment Rules
| Rule | Details |
|---|---|
| Semester Model | 3-term academic year (Jun-Nov, Dec-May, configurable) |
| Per-Trip Model | Individual trip fare based on route |
| Late Fees | Automatic fine on overdue payments |
| Payment Methods | Cash, UPI, Card, Net Banking, Wallet |
| Refund Policy | Supported (pending → refunded status) |
| Outstanding Amount | Tracked per student in transport profile |

### 11.3 Grievance Rules
| Rule | Details |
|---|---|
| Categories | complaint, suggestion, compliment, technical_issue |
| Priority | low, medium, high, urgent |
| Workflow States | SUBMITTED → TRIAGED → ASSIGNED → INVESTIGATING → PENDING_APPROVAL → IMPLEMENTING → RESOLVED → CLOSED |
| Escalation | Available at any state |
| SLA Tracking | Deadline monitoring with progress tracker |
| Communication | Internal (staff-only) and external (student-visible) threads |
| Auto-Notify | Status changes trigger notifications |

### 11.4 Route Rules
| Rule | Details |
|---|---|
| Unique Route Number | Each route has unique identifier |
| Stop Sequencing | Stops ordered by sequence_order |
| Major/Minor Stops | Classification for filtering and display |
| Fare Per Route | Single fare for all stops on same route |
| Capacity Tracking | Current passengers vs total capacity |
| Status Options | active / inactive / maintenance |

### 11.5 Schedule Rules
| Rule | Details |
|---|---|
| Date-Based | Each schedule is for a specific date (not recurring) |
| Seat Tracking | Available = total - booked |
| Status Flow | scheduled → in_progress → completed / cancelled |
| Booking Controls | Admin can enable/disable booking per schedule |
| Auto-Notify | New schedules trigger passenger notifications |
| Reminder Timing | 24 hours and 2 hours before departure |

### 11.6 Driver Rules
| Rule | Details |
|---|---|
| License Required | License number mandatory and unique |
| Medical Cert | Medical certificate expiry tracked |
| Multi-Route | Can be assigned to multiple routes |
| Location Update | Every 30 seconds when sharing enabled |
| Status Options | active / inactive / on_leave |
| Rating System | 0.00 - 5.00 decimal rating |

---

## 12. Third-Party Integrations

### 12.1 Supabase (Database + Auth + Storage)
- **Purpose**: Primary database, file storage, potential real-time subscriptions
- **URL**: gsvbrytleqdxpdfbykqh.supabase.co
- **Keys**: Anon key (client), Service role key (server)
- **RLS**: Row-Level Security policies applied (ongoing additions)

### 12.2 Razorpay (Payment Gateway)
- **Purpose**: Process student payments (fees, trip fares)
- **Mode**: Currently in TEST mode (rzp_test_*)
- **Methods**: UPI, Card, Net Banking, Wallet, EMI
- **Webhook**: Payment verification via server-side signature check
- **Demo Mode**: DummyPaymentGateway component for testing

### 12.3 MERCYDA GPS Tracking
- **Purpose**: Vehicle GPS device tracking
- **API**: console.mercydatrack.com/api
- **Auth**: Token-based authentication
- **Endpoints**: /auth/login, /vehicles/locations
- **Sync**: Auto-sync and manual sync options
- **Fallback**: SMS-based and TCP socket tracking alternatives

### 12.4 Centralized Auth Server (auth.jkkn.ai)
- **Purpose**: Federated SSO for all JKKN applications
- **Protocol**: OAuth 2.0
- **Integration**: Separate app IDs per application
- **Fallback**: Direct login when OAuth unavailable

### 12.5 Web Push (VAPID)
- **Purpose**: Browser push notifications
- **Standard**: Web Push API with VAPID keys
- **Service Worker**: Client-side SW for background delivery
- **Targeting**: By role, specific users, or all users

### 12.6 Bug Reporter SDK
- **Package**: @boobalan_jkkn/bug-reporter-sdk
- **External**: jkkn-centralized-bug-reporter.vercel.app
- **Purpose**: Cross-app bug reporting system

### 12.7 Leaflet Maps
- **Purpose**: Route visualization, live tracking, stop management
- **Tiles**: OpenStreetMap (default)
- **Features**: Polylines, markers, popups, real-time updates

---

## 13. Real-Time Features

### 13.1 Location Tracking (Polling-Based)

**Current Implementation**: Database polling (no WebSockets)

| Feature | Endpoint | Update Frequency |
|---|---|---|
| Driver Location | `/api/driver/location/update` | Every 30 seconds |
| Vehicle Tracking | `/api/admin/track-all/drivers` | On-demand / polling |
| GPS Device Sync | `/api/admin/gps/direct-tracking` | Auto-sync configurable |
| Student Location | `/api/admin/students/[id]/location` | On-demand |

### 13.2 Notification Delivery
- Push notifications via Web Push API + VAPID
- In-app notification center with read/unread status
- Toast notifications for immediate alerts (React Hot Toast)
- Email and SMS (configurable, placeholder integration)

### 13.3 Schedule & Booking Updates
- Real-time seat availability checking
- Schedule status transitions
- Booking confirmation/cancellation notifications

### 13.4 Current Limitations
- **No WebSocket implementation** — all real-time features use polling
- **No message queue** — location updates write directly to database
- **No Supabase real-time subscriptions** — potential but not activated

---

## 14. UI/UX Design System

### 14.1 Design Tokens

**Color Palette (Tailwind CSS):**
```
Primary:     Blue (#3B82F6) - Primary actions, links
Success:     Green (#22C55E) - Confirmations, active status
Warning:     Yellow (#EAB308) - Warnings, pending states
Danger:      Red (#EF4444) - Errors, destructive actions
Info:        Blue (#3B82F6) - Information alerts
Muted:       Gray (#6B7280) - Secondary text, borders

Dark Mode:
--dark-bg-primary:   #0f172a
--dark-bg-secondary: #1e293b
--neon-green:        #00ff88
--neon-orange:       #ff6600
```

**Breakpoints:**
```
sm:  640px   (Mobile landscape)
md:  768px   (Tablet)
lg:  1024px  (Desktop)
xl:  1280px  (Large desktop)
2xl: 1536px  (Ultra-wide)
```

### 14.2 Component Library

**Base UI (Radix/Shadcn-inspired):**
- Button (variants: default, outline, ghost, destructive)
- Card, Badge, Input, Label, Select, Tabs, Progress
- Dialog, Alert Dialog, Scroll Area

**Custom Components (80+ per app):**
- Enhanced form components with validation
- Loading states (skeleton, shimmer, pulse, spinners)
- Empty states with icons and CTAs
- Error states with retry actions
- Data visualization (Recharts integration)
- Map components (Leaflet integration)
- Mobile-optimized touch components
- Swipe gesture handlers

### 14.3 Navigation Patterns

**Admin (Desktop):**
- Collapsible sidebar with role-based items
- Top header with user profile and notifications

**Passenger (Mobile-First):**
- Bottom tab navigation (Dashboard, Routes, Schedules, Payments, More)
- Collapsible sidebar on desktop
- Floating action buttons for primary actions

**Driver (Mobile-First):**
- Bottom tab navigation (Dashboard, Tracking, Routes, Passengers, Profile)
- Location sharing toggle as primary CTA

---

## 15. Notifications System

### 15.1 Notification Types

| Type | Delivery | Trigger |
|---|---|---|
| Booking Confirmation | Push + In-app | Booking created |
| Payment Reminder | Push + In-app + Email | Fee due date approaching |
| Schedule Update | Push + In-app | New schedule / change |
| Route Change | Push + In-app | Route modification |
| Grievance Status | Push + In-app | Grievance state change |
| Enrollment Decision | Push + In-app + SMS | Approval/rejection |
| Trip Reminder | Push + In-app | 24h and 2h before departure |
| Emergency Alert | Push + In-app + SMS | System-wide emergency |
| Payment Success | Push + In-app | Payment confirmed |

### 15.2 Notification Categories
- **transport**: Route changes, schedule updates
- **payment**: Payment reminders, confirmations
- **system**: Maintenance, updates, announcements
- **emergency**: Critical alerts requiring immediate attention
- **enrollment**: Enrollment decisions

### 15.3 Targeting
- **all**: Broadcast to everyone
- **students**: All students
- **drivers**: All drivers
- **admins**: All admin users
- **specific_users**: Array of specific user IDs

---

## 16. Payment System

### 16.1 Fee Structure

```
┌──────────────────────────────────────────────┐
│              PAYMENT TYPES                    │
├──────────────────────────────────────────────┤
│ 1. Semester Fee  │ Annual transport pass      │
│                  │ 3-term structure            │
│                  │ Per-student, per-route      │
├──────────────────┤                            │
│ 2. Trip Fare     │ Per-trip payment            │
│                  │ Based on route fare         │
├──────────────────┤                            │
│ 3. Fine          │ Late payment penalties      │
│                  │ No-show charges             │
├──────────────────┤                            │
│ 4. Registration  │ One-time registration fee   │
└──────────────────────────────────────────────┘
```

### 16.2 Payment Methods (via Razorpay)
- UPI: Google Pay, PhonePe, Paytm, WhatsApp Pay, BHIM
- Cards: Visa, Mastercard, Amex, Rupay
- Net Banking: All major Indian banks
- Wallets: PayZapp, Airtel Money, MobiKwik
- EMI: Available for higher amounts

### 16.3 Payment Status Flow
```
initiated → pending → completed
                    → failed → retry → completed
completed → refunded (admin-initiated)
```

### 16.4 Receipt Generation
- Transaction ID, amount, date/time
- Student details (name, roll number, department)
- Payment method used
- QR code for verification
- Download/print options
- JKKN branding

---

## 17. Grievance Management System

### 17.1 Workflow State Machine

```
SUBMITTED ──→ TRIAGED ──→ ASSIGNED ──→ INVESTIGATING
                                              │
                                              ▼
                              PENDING_APPROVAL ──→ IMPLEMENTING
                                                        │
                                                        ▼
                                                   RESOLVED ──→ CLOSED
                                                        │
                                                   (Rating & Feedback)

At any stage: ──→ ESCALATED (to higher authority)
```

### 17.2 Grievance Properties

| Property | Options |
|---|---|
| Category | complaint, suggestion, compliment, technical_issue |
| Priority | low, medium, high, urgent |
| Urgency | Separate from priority (SLA-driven) |
| Status | SUBMITTED through CLOSED (8 states) |
| Assignment | To specific admin user |
| Escalation | Multi-level hierarchy |
| SLA | Deadline tracking with progress |
| Communication | Internal (staff-only) / External (student-visible) |
| Attachments | File upload support |
| Resolution | Resolution text + satisfaction rating |

### 17.3 Admin Capabilities
- Filter by: status, category, priority, urgency, assigned_to, date range, search text, tags
- Bulk assign to staff
- Bulk status changes
- Analytics dashboard (category breakdown, resolution times, assignee performance)
- Assignee dashboard (my assignments) and assigner dashboard (my delegations)

---

## 18. GPS & Location Tracking

### 18.1 GPS Service Architecture

```
┌────────────────────────────┐
│    GPS Tracking Services    │
├────────────────────────────┤
│ 1. MERCYDA API (Primary)   │ ← REST API integration
│    - Vehicle tracking       │    console.mercydatrack.com
│    - Token auth             │
│    - Auto-sync              │
├────────────────────────────┤
│ 2. SMS-Based (Fallback)    │ ← Parse GPS from SMS
│    - Location extraction    │
│    - Timestamp parsing      │
├────────────────────────────┤
│ 3. TCP Socket (Legacy)     │ ← Direct TCP connection
│    - Real-time streaming    │
│    - Packet parsing         │
├────────────────────────────┤
│ 4. App-Based (Primary)     │ ← Driver app GPS
│    - Browser geolocation    │
│    - 30-second intervals    │
│    - Speed, heading, accuracy│
└────────────────────────────┘
```

### 18.2 GPS Status Indicators
- **Online**: Active location sharing (updated within 1 min)
- **Recent**: Last update within 5 minutes
- **Offline**: No updates in 5+ minutes

### 18.3 Map Features
- Leaflet.js with OpenStreetMap tiles
- Route polyline overlays
- Stop markers with info popups
- Driver/vehicle markers with real-time position
- Auto-center on tracked vehicle
- Zoom controls
- ETA calculations

---

## 19. Route Optimization Engine

### 19.1 Optimization Features
- Algorithm-based route calculation
- Student transfer planning between routes
- Cost-benefit analysis for optimization decisions
- Constraint-based enhanced optimization
- Efficiency metrics output

### 19.2 Optimization Criteria
- Minimize total travel distance
- Maximize seat utilization
- Balance passenger load across routes
- Respect stop constraints and timing
- Consider driver availability

### 19.3 Output
- Optimized route configurations
- Student transfer recommendations
- Before/after efficiency comparison
- Execution capability (apply transfers)

---

## 20. Reporting & Analytics

### 20.1 Dashboard Metrics
| Metric | Source |
|---|---|
| Total Students | students table count |
| Total Drivers | drivers table count |
| Total Routes | routes table count |
| Total Vehicles | vehicles table count |
| Total Bookings | bookings table count |
| Confirmed Bookings | bookings where status=confirmed |
| Pending Payments | payments where status=pending |
| Open Grievances | grievances where status=open |
| Today's Revenue | payments where date=today, status=completed |

### 20.2 Grievance Analytics
- Category breakdown (pie chart)
- Status distribution
- Priority analysis
- Resolution time metrics (avg, min, max)
- Assignee performance
- Trend over time

### 20.3 Missing Analytics (Identified Gaps)
- Revenue trend analysis over time
- Route occupancy rate analysis
- Driver performance metrics (punctuality, ratings)
- Student utilization metrics
- Compliance/regulation reporting
- Predictive analytics
- Export to Excel/PDF

---

## 21. Accessibility & Internationalization

### 21.1 Accessibility (TMS-PASSENGER)
- ARIA labels on all interactive elements
- Semantic HTML with proper heading hierarchy
- Skip-to-content links
- Keyboard navigation support (Tab, Shift+Tab, Enter, Space, Arrow keys, Escape)
- Visible focus indicators
- WCAG AA color contrast (4.5:1 minimum)
- Alt text on images
- aria-live regions for dynamic content
- Form validation linked via aria-describedby

### 21.2 Internationalization
- **Languages**: English (default), Tamil
- **Implementation**: i18n context with translation keys
- **Persistence**: localStorage for language preference
- **Scope**: Driver pages primarily (expandable)
- **Switcher**: Language toggle in header

### 21.3 Dark Mode
- **Provider**: ThemeProvider context
- **Options**: Light, Dark, System (respects OS preference)
- **Storage**: localStorage key `tms-passenger-theme`
- **Design**: Dark gray backgrounds, neon accent colors

### 21.4 PWA Support (TMS-PASSENGER)
- Web App Manifest for installability
- Service Worker for offline capability
- Install prompt component
- Deployment version checking

---

## 22. Identified Gaps & Missing Features

### 22.1 Functional Gaps

| Gap | Impact | Priority |
|---|---|---|
| No recurring schedule templates | Manual schedule creation daily | HIGH |
| No automatic schedule generation | Admin burden for repetitive routes | HIGH |
| No dynamic pricing | Cannot adjust for demand/distance | MEDIUM |
| No multimodal routing | No connections between routes | MEDIUM |
| No installment payment plans | Limited payment flexibility | MEDIUM |
| No driver performance tracking | Cannot identify training needs | MEDIUM |
| No fleet maintenance cost history | Cannot track TCO | MEDIUM |
| No fuel efficiency tracking | No operational cost optimization | LOW |
| No accident/damage history | No incident tracking | LOW |
| No loyalty/rewards program | No retention incentives | LOW |
| No parent/guardian portal | No visibility for parents | LOW |
| No predicted wait times | No ETA at stops | MEDIUM |
| No route feedback from students | No quality measurement loop | MEDIUM |

### 22.2 Incomplete Implementations

| Feature | Status | Location |
|---|---|---|
| Distance calculation from coordinates | TODO comment | `api/location/tracking/driver/[driverId]/route.ts` |
| Grievance communication/rating modals | TODO comment | `dashboard/grievances/enhanced-v2-page.tsx` |
| Debug API endpoints still active | Should be removed | Multiple `/api/debug/*` routes |
| Error boundary components | Empty stubs | `error-boundary.tsx` |
| Email/SMS notification service | Placeholder | `lib/email-sms-service.ts` |

### 22.3 Missing from Typical TMS

- **No real-time chat** between admin and drivers
- **No emergency SOS** button for drivers or students
- **No vehicle inspection** checklist before trips
- **No driver duty roster** management
- **No automated reporting** (scheduled PDF/email reports)
- **No integration with academic calendar** (holidays, exam schedules)
- **No multi-institution support** (currently JKKN-specific)
- **No API rate limiting** on any endpoint
- **No audit trail for data access** (only for state changes)

---

## 23. Security Concerns & Vulnerabilities

### 23.1 CRITICAL Issues

| Issue | Risk | Details |
|---|---|---|
| **Exposed Service Role Key** | Full DB access bypass | Supabase service role key in .env.local (committed to git) |
| **Hardcoded API Keys in Code** | Credential exposure | API keys hardcoded in multiple route files |
| **Test Payment Keys in Code** | Financial risk if prod keys used similarly | Razorpay test keys in environment files |
| **Debug Endpoints Active** | Information disclosure | `/api/debug/*` routes accessible |
| **3,495+ console.log Statements** | PII leakage in logs | Logs contain sensitive user data |

### 23.2 HIGH Issues

| Issue | Risk | Details |
|---|---|---|
| Multiple incomplete auth implementations | Auth bypass potential | 5+ auth service versions |
| No CSRF protection | State-changing attacks | No CSRF tokens on forms |
| No input validation library | Injection attacks | Basic checks only, no Zod/Yup |
| No rate limiting | DDoS / brute force | All endpoints unprotected |
| Missing error boundaries | Crash-based info disclosure | Empty error boundary stubs |

### 23.3 MEDIUM Issues

| Issue | Risk | Details |
|---|---|---|
| No SSL pinning for external APIs | MITM attacks | MERCYDA, auth server calls |
| QR codes stored unencrypted | QR forgery | No encryption on stored codes |
| Direct database query endpoint | SQL injection | `/api/admin/database/route.ts` |
| No data access audit trail | Compliance risk | Only state changes logged |

### 23.4 Recommendations
1. **Immediately** rotate all exposed credentials
2. **Immediately** add `.env.local` to `.gitignore` and purge from git history
3. Remove all debug endpoints
4. Implement input validation with Zod
5. Add CSRF protection
6. Implement API rate limiting
7. Replace console.log with structured logging
8. Add error boundaries
9. Consolidate auth services (5 → 1)

---

## 24. Performance & Scalability Issues

### 24.1 Database Performance

| Issue | Impact | Recommendation |
|---|---|---|
| N+1 query patterns | Slow list loads | Batch queries, JOIN operations |
| Unbounded result sets | Memory overflow at scale | Add pagination to all endpoints |
| Missing indexes | Query degradation | Add composite indexes on FKs |
| Client-side filtering | Wasted bandwidth | Push filters to database |
| No caching layer | Repeated DB hits | Add Redis caching |

### 24.2 Scalability Bottlenecks

| Issue | Breaking Point | Recommendation |
|---|---|---|
| Single Supabase instance | ~200 concurrent connections | Connection pooling |
| Direct DB writes for location | 100 drivers × 2/min = 200 writes/min | Message queue (Redis/Bull) |
| Synchronous bulk push | Timeout at 1000+ recipients | Background job queue |
| No WebSocket implementation | Polling doesn't scale past 100 concurrent | Implement WebSockets/SSE |
| No data archival | Tables grow unbounded | Implement archival strategy |
| No horizontal scaling | Single instance limit | Containerized deployment |

### 24.3 Bundle Performance

| Issue | Impact | Recommendation |
|---|---|---|
| Large chart library (Recharts) | ~300KB+ | Dynamic import, lazy load |
| Map library (Leaflet) | ~150KB+ | Lazy load on map pages only |
| No code splitting visible | Large initial bundle | Dynamic imports for heavy pages |
| 3,495 console.logs | Runtime overhead | Strip in production build |

---

## 25. Technical Debt Inventory

### 25.1 Code Quality Debt

| Item | Severity | Details |
|---|---|---|
| 5 auth service versions | HIGH | parent-auth-service.ts, v2, debug, staff, student, driver |
| 40+ migration files | MEDIUM | Multiple "fix" migrations indicate schema design issues |
| Duplicate code across apps | MEDIUM | Similar booking/location logic in both apps |
| Inconsistent file naming | LOW | Mixed patterns: -debug, -v2, -enhanced, no suffix |
| Commented-out code | LOW | Old auth flows, alternative endpoints |
| Old auth directories | LOW | child-app-auth-flow-integration-master/ not cleaned up |

### 25.2 Missing Infrastructure

| Item | Impact |
|---|---|
| No structured logging | Cannot debug production issues |
| No monitoring/alerting | No Sentry, Datadog, or equivalent |
| No CI/CD pipeline | Manual deployment process |
| No automated testing in CI | Tests exist but not integrated |
| No API documentation | No Swagger/OpenAPI spec |
| No environment validation | App starts with missing env vars |

### 25.3 Architectural Debt

| Item | Impact |
|---|---|
| No state management library | Prop drilling, inconsistent state |
| No data caching layer | Every navigation triggers fresh API calls |
| No API abstraction layer | Direct Supabase calls scattered in components |
| No WebSocket infrastructure | Polling for real-time features |
| No background job system | All operations synchronous |

---

## 26. Recommendations for Rebuild

### 26.1 Architecture Improvements

**Phase 1: Foundation (Week 1-2)**
1. Implement proper environment validation (Zod env schema)
2. Consolidate authentication into single service
3. Implement structured logging (Pino/Winston)
4. Add Zod validation on all API inputs
5. Implement API rate limiting
6. Set up CI/CD pipeline
7. Remove all debug endpoints and console.logs

**Phase 2: Performance (Week 3-4)**
1. Add Redis caching layer for frequent queries
2. Implement connection pooling (PgBouncer/Supavisor)
3. Add pagination to ALL list endpoints
4. Implement dynamic imports for heavy components (maps, charts)
5. Add database indexes on all foreign keys and frequent query columns
6. Move location updates to message queue

**Phase 3: Real-Time (Week 5-6)**
1. Implement WebSocket/SSE for live tracking
2. Activate Supabase real-time subscriptions
3. Implement background job queue (Bull/BullMQ)
4. Move notification delivery to background jobs

**Phase 4: Features (Week 7-8)**
1. Recurring schedule templates
2. Dynamic pricing engine
3. Driver performance tracking
4. Fleet maintenance cost tracking
5. Automated reporting (scheduled PDF/email)
6. Emergency SOS system

### 26.2 Technology Recommendations

| Current | Recommended | Reason |
|---|---|---|
| No state management | Zustand or TanStack Query | Lightweight, TypeScript-native |
| Direct Supabase calls | Service layer pattern | Separation of concerns |
| Polling for real-time | WebSocket + Supabase Realtime | Efficient, scalable |
| No caching | Redis + TanStack Query | Reduce DB load |
| console.log | Pino structured logging | Production-grade |
| No monitoring | Sentry + Vercel Analytics | Error tracking + performance |
| No CI/CD | GitHub Actions | Automated testing and deployment |
| No API docs | OpenAPI/Swagger auto-gen | Developer experience |
| Basic validation | Zod schemas | Type-safe validation |

### 26.3 Security Hardening

1. **Rotate all credentials** immediately
2. **Implement CSRF protection** on all state-changing endpoints
3. **Add rate limiting** (100 req/min per IP default)
4. **Implement request signing** for inter-service communication
5. **Add WAF rules** if deployed behind CDN
6. **Encrypt QR codes** with HMAC signature
7. **Implement audit logging** for all data access
8. **Add penetration testing** to release process
9. **Implement CSP headers** properly
10. **Regular dependency audits** (npm audit)

---

## 27. Appendix — File & Component Inventory

### 27.1 TMS-ADMIN Component Count: ~97

**Key Components:**
- add-driver-modal.tsx, edit-driver-modal.tsx, driver-details-modal.tsx, driver-location-modal.tsx
- add-student-modal.tsx, enhanced-add-student-modal.tsx
- add-route-modal.tsx, edit-route-modal.tsx
- add-vehicle-modal.tsx, edit-vehicle-modal.tsx
- add-gps-device-modal.tsx
- create-schedule-modal.tsx
- assign-grievance-modal.tsx, bulk-assign-grievances-modal.tsx
- admin-push-notifications.tsx, bulk-push-notification-form.tsx
- admin-grievance-group-chat-modal.tsx
- admin-bug-management.tsx, bug-bounty-leaderboard.tsx
- comprehensive-tracking-system.tsx
- broadcast-modal.tsx
- error-boundary.tsx
- accessibility-enhancements.tsx
- performance-optimizer.tsx
- audit-logs.tsx, api-settings.tsx

### 27.2 TMS-PASSENGER Component Count: ~84

**Key Components:**
- enhanced-passenger-dashboard.tsx (26KB)
- enrollment-dashboard.tsx (37KB)
- live-bus-tracking-modal.tsx (27KB)
- enhanced-live-tracking-map.tsx (23KB)
- enhanced-payment-interface.tsx (24KB)
- semester-payment-interface.tsx (38KB)
- notification-center.tsx (24KB)
- invoice-receipt.tsx (21KB)
- grievance-action-tracker.tsx (19KB)
- grievance-group-chat-modal.tsx (16KB)
- driver-location-tracker.tsx (16KB)
- booking-reminder-notifications.tsx (18KB)
- push-notification-setup.tsx (11KB)
- accessibility-enhancements.tsx (13KB)
- mobile-optimized-components.tsx (13KB)
- data-visualization.tsx (16KB)
- enhanced-schedule-calendar.tsx (15KB)
- enhanced-loading-states.tsx (17KB)
- enhanced-notifications.tsx (20KB)
- mobile-bottom-navbar.tsx (7KB)

### 27.3 Database Migrations Count
- TMS-ADMIN: 40+ migration SQL files
- Supabase-specific: 35+ in supabase/migrations/

### 27.4 Environment Variables Required
- Supabase: URL, Anon Key, Service Role Key
- Auth Server: URL, App ID, API Key, Redirect URI
- Razorpay: Key ID, Key Secret, Public Key
- Push: VAPID Public Key, VAPID Private Key
- Email: SMTP Host, Port, User, Password
- App: URL, Auth Secret, Debug Flag
- Scheduler: Secret Key

---

> **Document Generated**: March 15, 2026
> **Analysis Agents**: Architecture Analyst, UX/Product Analyst, Devil's Advocate
> **Total Codebase Coverage**: ~210 API endpoints, ~181 components, 43+ pages, 30+ database tables
> **Confidence Level**: HIGH — Based on direct code analysis of both applications
