# BOS Sidebar Navigation

## Overview

A responsive sidebar navigation component has been added to the Board of Studies module. The sidebar provides quick access to all BOS features and displays contextual information about the user's role and permissions.

## Features

### Navigation Sections

**Main**
- **Syllabi** — View and manage course syllabi (requires view permission)
- **Dashboard** — Overview of syllabi metrics and health checks (requires view permission)

**Management**
- **Manage Taxonomy** — Configure boards and regulations (requires manage_taxonomy permission)
- **Meetings** — Board of Studies meetings (new feature)
- **Members** — BoS members and attendance (new feature)

**Resources**
- **Documentation** — Help and guides

### Permission-Based Visibility

The sidebar automatically hides navigation items for which the user lacks permission. For example:
- If user can't manage taxonomy → "Manage Taxonomy" is hidden
- If user can't view syllabi → All main section items are hidden

### Active Route Highlighting

The current page is highlighted with:
- Blue background and text color
- Right-side chevron indicator
- Bold styling for emphasis

### Quick Stats

Shows the user's effective role based on their permissions:
- **Admin** — User can manage taxonomy
- **Editor** — User can edit but not manage taxonomy
- **Viewer** — User has view-only access

### Permission Alerts

If user lacks BOS access entirely:
- A red alert box displays in the sidebar
- Text explains to contact administrator
- Sidebar remains usable for navigation to get help

## Implementation Details

### Component: `BosSidebar`

Located in `components/bos/bos-sidebar.tsx`

**Props:** None (uses `useBosPermissions()` hook internally)

**Features:**
- Checks permissions for each navigation item
- Responsive design (collapses on mobile via SidebarProvider)
- Badge support for "New" and "Beta" features
- Quick stats display
- Logo and branding

### Usage

Wrap pages with `SidebarProvider` and include `<BosSidebar />`:

```tsx
import { SidebarProvider } from '@/components/ui/sidebar';
import { BosSidebar } from '@/components/bos/bos-sidebar';

export default function Page() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <BosSidebar />
        <main className="flex-1">
          {/* Page content */}
        </main>
      </div>
    </SidebarProvider>
  );
}
```

### Mobile Responsiveness

The SidebarProvider automatically:
- Collapses sidebar to icon-only view on small screens
- Shows hamburger menu toggle in mobile viewport
- Provides sheet-based drawer for touch interactions
- Maintains sidebar state in browser cookie

### Styling

- **Colors**: Blue accent for active items, gray for inactive
- **Spacing**: 16rem default width, 3rem icon-only width
- **Borders**: Subtle gray border for definition
- **Icons**: Lucide React icons throughout

## Related Files

- `components/ui/sidebar.tsx` — Base sidebar UI components (SidebarProvider, etc.)
- `components/bos/bos-sidebar.tsx` — BOS-specific sidebar implementation
- `hooks/bos/use-bos-permissions.ts` — Permission checking logic
- `app/bos/syllabi/page.tsx` — Syllabi page with sidebar integration
- `app/bos/syllabi/dashboard/page.tsx` — Dashboard page with sidebar integration

## Future Enhancements

- [ ] Add meeting count badge
- [ ] Show recent documents in sidebar
- [ ] Add search functionality
- [ ] Persistent navigation history
- [ ] Customizable navigation order per institution
