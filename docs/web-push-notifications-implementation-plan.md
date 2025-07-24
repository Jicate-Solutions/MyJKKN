# Web Push & In-App Notification Module: Implementation Plan

This document outlines the plan for implementing a comprehensive notification system within the MyJKKN application. The system will include both web push notifications and a real-time in-app notification center.

## 1. Overview & Goals

The primary goal is to build a robust notification module that allows administrators to send targeted messages to users. The system will be role-based, with granular targeting capabilities, and will provide users with real-time updates through an in-app UI.

**Key Features:**

- Admin panel for creating, managing, and viewing notifications.
- Role-based access control (Super Admin, Institution Admin, etc.).
- Targeted notifications by institution, department, program, semester, or section.
- Web push notifications to alert users even when they are not on the site.
- Real-time in-app notification center.
- A clear and intuitive UI for both admins and end-users.

## 2. Technology Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **Real-time:** Supabase Realtime
- **Web Push Service:** `web-push` library with VAPID protocol.

## 3. Database Schema Design

New SQL migration files will be created in the `supabase/migrations/` directory to add the following tables.

### `push_subscriptions`

Stores the web push subscription details for each user's device/browser.

```sql
CREATE TABLE public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.push_subscriptions IS 'Stores user push notification subscriptions.';
```

### `notifications`

Stores the content and targeting criteria for each notification sent.

```sql
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT, -- Optional URL to open on click
    created_by UUID REFERENCES public.users(id),
    sent_at TIMESTAMPTZ DEFAULT now(),
    -- Targeting columns
    target_institution_id UUID REFERENCES public.institutions(id),
    target_department_id UUID REFERENCES public.departments(id),
    target_program_id UUID REFERENCES public.courses(id), -- Assuming courses table is for programs
    target_semester INT,
    target_section VARCHAR(255)
);
COMMENT ON TABLE public.notifications IS 'Stores all notifications sent through the system.';
```

### `user_notifications`

A join table to link notifications to individual users for the in-app feed. This enables tracking read status.

```sql
CREATE TABLE public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, notification_id)
);
COMMENT ON TABLE public.user_notifications IS 'Links notifications to users and tracks read status.';

-- Enable Realtime on this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
```

## 4. Backend Implementation (API Routes)

API routes will be placed under `app/api/notifications/`.

### `POST /api/notifications/subscribe`

- **Action:** Subscribes a user to web push notifications.
- **Logic:**
  1.  Receives the push subscription object from the client.
  2.  Validates the user session.
  3.  Saves the subscription object along with the `user_id` to the `push_subscriptions` table.

### `POST /api/notifications/send`

- **Action:** Creates and sends a new notification.
- **Protection:** Protected route, accessible only to authorized roles (e.g., Super Admin, Institution Admin).
- **Logic:**
  1.  Receives notification content (title, body, url) and targeting criteria.
  2.  Inserts a new record into the `notifications` table.
  3.  Identifies all target users based on the criteria (querying users, students, institutions, etc.).
  4.  For each target user, insert a record into the `user_notifications` table. This will trigger the real-time update in the app.
  5.  Fetches `push_subscriptions` for all target users.
  6.  Loops through subscriptions and uses the `web-push` library to dispatch the push notifications.

### `GET /api/notifications`

- **Action:** Fetches all notifications for the currently logged-in user.
- **Logic:**
  1.  Gets the current `user_id`.
  2.  Joins `user_notifications` and `notifications` tables to retrieve the user's notifications.
  3.  Returns a list of notifications, including read status.

### `POST /api/notifications/read`

- **Action:** Marks specific or all notifications as read for the current user.
- **Logic:**
  1.  Receives a list of `notification_id`s or a flag to mark all as read.
  2.  Updates the `read_at` timestamp in the `user_notifications` table for the given user and notifications.

## 5. Frontend Implementation

### Service Worker

- **File:** `public/service-worker.js`
- **Purpose:** To run in the background in the user's browser, listen for incoming push messages, and display them as system notifications.

### Push Notification Hook

- **File:** `hooks/use-push-notifications.ts`
- **Purpose:** A client-side hook to manage the push notification lifecycle.
- **Logic:**
  1.  Checks if push notifications are supported and permission is granted.
  2.  If not granted, provides a function to request permission.
  3.  On permission grant, creates a push subscription and sends it to the `/api/notifications/subscribe` endpoint.

### Admin Notification Module

- **Path:** `app/(routes)/admin/notifications/`
- **`page.tsx`:** Displays a data table of previously sent notifications with details and targeting info.
- **`new/page.tsx`:** A page containing the form to create and send a new notification.
- **`_components/notification-form.tsx`:** A client component for the notification creation form. It will include fields for title, body, and dropdowns for selecting target institution, department, program, etc. These dropdowns will be populated by fetching data from their respective APIs.
- **`_components/notifications-table.tsx`:** A component to display historical notifications.

### In-App Notification Center

- **File:** `components/notifications/notification-bell.tsx`
- **Placement:** This component will be added to `components/Navbar/Navbar.tsx`.
- **Functionality:**
  1.  A client component (`'use client'`).
  2.  Displays a bell icon. A badge on the icon will show the count of unread notifications.
  3.  On click, it opens a dropdown/popover listing the most recent notifications.
  4.  Fetches notifications via a hook (`hooks/use-notifications.ts`).
  5.  Implements a "Mark all as read" button.

### Real-time Hook

- **File:** `hooks/use-notifications.ts`
- **Functionality:**
  1.  Fetches initial notifications from `/api/notifications`.
  2.  Uses the Supabase client to subscribe to inserts on the `user_notifications` table for the current user.
  3.  When a new notification arrives via the real-time subscription, it updates the notification list and unread count, triggering a re-render of the `NotificationBell`.

## 6. Permissions & Access Control

- A new permission, `manage_notifications`, will be added to `lib/constants/permissions.ts`.
- The Super Admin role will be granted this permission by default.
- The `app/(routes)/admin/notifications/**` routes will be protected using the existing `components/auth/admin-permission-guard.tsx`, requiring the `manage_notifications` permission.
- Future enhancements could introduce more granular permissions (e.g., `send_institution_notifications`) and assign them to roles like Institution Admin.

## 7. Step-by-Step Implementation Plan

1.  **Phase 1: Backend & Database Setup**

    - Create the SQL migration files for the new tables (`push_subscriptions`, `notifications`, `user_notifications`).
    - Apply migrations to the local and staging Supabase projects.
    - Set up VAPID keys for the web-push service and store them as environment variables.
    - Implement the four API routes (`/subscribe`, `/send`, `/`, `/read`).

2.  **Phase 2: Client-Side Subscription & Service Worker**

    - Create the `public/service-worker.js`.
    - Implement the `usePushNotifications` hook.
    - Integrate the hook into the main layout (`components/layout/main-layout.tsx`) to prompt users to subscribe.

3.  **Phase 3: Admin Management UI**

    - Create the new admin pages under `app/(routes)/admin/notifications/`.
    - Build the `notification-form.tsx` component with all targeting fields.
    - Build the `notifications-table.tsx` component for the history view.
    - Protect the routes using the permission guard.

4.  **Phase 4: In-App Notification Center**

    - Develop the `use-notifications.ts` hook with initial data fetching and the Supabase Realtime subscription.
    - Create the `notification-bell.tsx` component.
    - Add the `NotificationBell` to the main `Navbar`.

5.  **Phase 5: Testing & Refinement**
    - End-to-end testing: Send a notification from the admin panel and verify it's received as a push notification and in the in-app feed on a target user's account.
    - Test all targeting options (institution, department, etc.).
    - Test read/unread functionality.
    - Test on different browsers and devices.
