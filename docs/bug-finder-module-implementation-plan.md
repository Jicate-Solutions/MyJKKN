# Advanced Bug Finder Module: Implementation Plan

## 1. Introduction

This document outlines the implementation strategy for an advanced, gamified bug reporting module within the MyJKKN application. The goal is to create an intuitive and engaging system for users to report issues, and a powerful dashboard for administrators to manage and resolve them. This module will enhance user engagement, streamline the feedback process, and improve the overall quality and stability of the platform by enabling rapid identification and resolution of bugs.

## 2. Core Features

The module will include the following key features:

- **Global Bug Reporting Widget:** A floating icon consistently available across all pages.
- **Screenshot & Feedback:** Users can capture a screenshot of the current page and attach a description.
- **Automatic Console Log Capture:** Automatically captures client-side console errors and warnings to provide developers with technical context.
- **Admin Bug Management Dashboard:** A dedicated section in the admin panel for super admins to view, manage, and update the status of bug reports.
- **User-Facing Bug Status Tracking:** A page where users can view the status of their submitted reports.
- **Gamified Leaderboard:** A leaderboard to incentivize users to find and report valid bugs, ranking them based on their contributions.

## 3. Codebase Integration Analysis

The new module will be integrated into the existing Next.js application structure as follows:

- **Database Schema:** New tables will be added via a new migration script in `supabase/migrations/`.
- **Backend Services:** A new service class, `BugReportService`, will be created in `lib/services/` to handle all business logic related to bug reports.
- **API Endpoints:** New route handlers will be added under `app/api/bug-reports/` to expose the service logic to the client.
- **Global Widget:** The floating reporter widget will be a client component (`'use client'`) integrated into the root layout at `app/(routes)/layout.tsx`.
- **Components:** All new components for the widget, admin dashboard, user tracking page, and leaderboard will be placed in `components/bug-reporter/`.
- **Admin Panel:** A new route and page will be created for the bug management dashboard, likely at `app/(routes)/admin/bug-reports/page.tsx`.
- **Types & Hooks:** New type definitions will be added to `types/bugs.ts` and new React Query hooks to `hooks/use-bug-reports.ts`.

## 4. Database Schema Design

Two new database entities will be created: a table to store bug reports and a view to handle the leaderboard logic.

### `bug_reports` Table

This table will store all the details for each bug report.

```sql
-- supabase/migrations/XXX_create_bug_finder_module.sql

CREATE TABLE public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reporter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    page_url TEXT NOT NULL,
    description TEXT NOT NULL,
    screenshot_url TEXT, -- URL to the screenshot in Supabase Storage
    console_logs JSONB,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'in_progress', 'resolved', 'wont_fix')),
    resolved_at TIMESTAMPTZ,
    metadata JSONB -- For storing browser, OS info, etc.
);

-- RLS Policy: Allow users to view their own reports
CREATE POLICY "Allow users to view their own reports"
ON public.bug_reports FOR SELECT
USING (auth.uid() = reporter_user_id);

-- RLS Policy: Allow admins to manage all reports (Assuming an admin check function exists)
CREATE POLICY "Allow admins to manage all reports"
ON public.bug_reports FOR ALL
USING (is_admin(auth.uid())); -- Replace is_admin with your actual admin-check logic

-- Enable RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
```

### `bug_reporters_leaderboard` View

This view will calculate the number of resolved bugs per user for the leaderboard.

```sql
-- supabase/migrations/XXX_create_bug_finder_module.sql (continued)

CREATE VIEW public.bug_reporters_leaderboard AS
SELECT
    reporter_user_id,
    p.raw_user_meta_data->>'full_name' as user_name,
    p.raw_user_meta_data->>'avatar_url' as avatar_url,
    COUNT(*) AS resolved_bugs_count
FROM
    public.bug_reports br
JOIN
    auth.users u ON br.reporter_user_id = u.id
JOIN
    public.profiles p ON br.reporter_user_id = p.id
WHERE
    br.status = 'resolved'
GROUP BY
    reporter_user_id, p.raw_user_meta_data
ORDER BY
    resolved_bugs_count DESC;

-- RLS Policy: Allow all authenticated users to view the leaderboard
CREATE POLICY "Allow all users to view leaderboard"
ON public.bug_reporters_leaderboard FOR SELECT
USING (auth.role() = 'authenticated');

-- Enable RLS
ALTER TABLE public.bug_reporters_leaderboard ENABLE ROW LEVEL SECURITY;
```

## 5. Component & UI Architecture

- **`BugReporterWidget` (`components/bug-reporter/bug-reporter-widget.tsx`):** A `'use client'` component containing the floating button, which opens a modal. The modal will contain a form for the description, automatically trigger a screenshot, and capture console logs upon submission.
- **`AdminBugDashboard` (`app/(routes)/admin/bug-reports/page.tsx`):** A server component that fetches and displays a list of bug reports in a data table. It will allow admins to view details and update the status of each report.
- **`BugReportDetails` (`app/(routes)/admin/bug-reports/[id]/page.tsx`):** A page to display the full details of a single bug report, including the screenshot and console logs.
- **`UserBugTracker` (`app/(routes)/my-bug-reports/page.tsx`):** A page where authenticated users can see a list of their submitted bugs and the current status of each.
- **`BugLeaderboard` (`app/(routes)/bug-leaderboard/page.tsx`):** A page displaying the gamified leaderboard, fetched from the `bug_reporters_leaderboard` view.

## 6. API Endpoints Design

A new set of API endpoints will be created under `app/api/bug-reports/`.

- **`POST /api/bug-reports`**

  - **Description:** Submits a new bug report. Handles screenshot upload to Supabase Storage.
  - **Request Body:** `{ description: string, page_url: string, screenshot_data_url: string, console_logs: object[] }`
  - **Response:** The created bug report object.

- **`GET /api/bug-reports`**

  - **Description:** Retrieves a paginated list of all bug reports for admins.
  - **Query Params:** `page`, `limit`, `status`
  - **Response:** Paginated list of bug reports.

- **`GET /api/bug-reports/me`**

  - **Description:** Retrieves bug reports submitted by the currently authenticated user.
  - **Response:** List of the user's bug reports.

- **`PATCH /api/bug-reports/[id]`**
  - **Description:** Updates the status of a bug report. (Admin only)
  - **Request Body:** `{ status: 'seen' | 'in_progress' | 'resolved' | 'wont_fix' }`
  - **Response:** The updated bug report object.

## 7. Step-by-Step Implementation Guide

### Phase 1: Backend & Database Setup (2-3 hours)

1.  **Create Migration File:** Create a new SQL file in `supabase/migrations/` with the schema defined in section 4.
2.  **Add Types:** Create `types/bugs.ts` with TypeScript interfaces for `BugReport` and `BugReportLeaderboardEntry`.
3.  **Implement Service:** Create `lib/services/bug-report-service.ts` to handle the logic for creating, fetching, and updating bug reports. This service will interact directly with the Supabase client.
4.  **Create API Routes:** Implement the API endpoints defined in section 6. Ensure admin routes are protected.

### Phase 2: Frontend - Reporting Widget (3-4 hours)

1.  **Install Dependencies:** `npm install html2canvas` and `npm install -D @types/html2canvas`.
2.  **Develop Widget Component:** Build `components/bug-reporter/bug-reporter-widget.tsx`.
3.  **Implement Screenshot Logic:** Use `html2canvas` to capture the `<body>` element and convert it to a Data URL.
4.  **Implement Console Capture:** Wrap `console.log`, `console.warn`, `console.error` in a utility that also stores logs in a state variable within the widget.
5.  **Integrate Widget:** Import and render the `BugReporterWidget` in the root layout file `app/(routes)/layout.tsx`.

### Phase 3: Frontend - Admin & User Views (4-5 hours)

1.  **Create React Query Hooks:** In `hooks/use-bug-reports.ts`, create hooks like `useBugReports` (for admin), `useMyBugReports` (for users), and `useUpdateBugReport` (for status changes).
2.  **Build Admin Dashboard:** Develop the `AdminBugDashboard` page with a data table to list reports, with links to the detail page.
3.  **Build Detail Page:** Create the `BugReportDetails` page to show all information, including rendering the screenshot.
4.  **Build User Tracking Page:** Develop the `UserBugTracker` page.

### Phase 4: Gamification (2-3 hours)

1.  **Create Leaderboard Hook:** Add a `useBugLeaderboard` hook to fetch data from the `bug_reporters_leaderboard` view.
2.  **Build Leaderboard Component:** Develop the `BugLeaderboard` component to display ranked users.
3.  **Add Navigation:** Add links to the leaderboard and "My Bug Reports" pages in the user profile dropdown or sidebar.

## 8. Dependencies

- `html2canvas`: To capture screenshots from the DOM.
- `@supabase/ssr`: For server-side Supabase interactions.
- `zod`: For API input validation.

## 9. Security & Performance Considerations

- **Row Level Security (RLS):** RLS policies are critical to ensure users can only access their own reports and that only admins can access all reports.
- **Secure Uploads:** Screenshots should be uploaded directly to a secure Supabase Storage bucket from the client, with policies that restrict uploads to authenticated users and specific file types/sizes.
- **API Rate Limiting:** Consider adding rate limiting to the `POST /api/bug-reports` endpoint to prevent abuse.
- **Data Sanitization:** All user-provided input (like the description) must be properly sanitized before being rendered in the admin panel to prevent XSS attacks.
- **Lazy Loading:** The `BugReporterWidget` can be dynamically imported to avoid increasing the initial bundle size for all users.

## 10. Future Enhancements

- **Session Replay:** Integrate a tool like LogRocket or OpenReplay to provide video-like recordings of user sessions along with bug reports.
- **Browser/OS Metadata:** Automatically capture and send metadata (browser, version, OS) with the report.
- **Jira/Linear Integration:** Add functionality to create an issue in an external project management tool directly from the admin dashboard.
- **AI-Powered Analysis:** Use AI to automatically categorize bug reports or suggest potential duplicates.
