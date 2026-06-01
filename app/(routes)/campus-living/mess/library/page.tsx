// ============================================================================
// MESS MENU ITEM LIBRARY (Super-Admin)
// ============================================================================
// Created: 2026-05-26 (PR 2 — service + hooks + browse UI on top of PR #1091).
//
// Browse + audit page for the ~332-item global library that the menu editor
// pulls from. Director uses this to:
//   • audit Tamil names (314 of 332 rows still need Tamil filled — flagged via
//     needs_native_review = true)
//   • mark rows as native-reviewed once verified (single or bulk)
//   • add new items the chairperson asks for that aren't in the seed
//   • soft-delete (deactivate) items that shouldn't appear in the picker
//
// The menu editor (parallel agent's UI) imports ItemLibraryService +
// useItemSearch directly — no duplicate widget here.
// ============================================================================

export const navMeta = { label: 'Mess Menu Library', icon: 'BookOpen' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { ItemLibraryBrowser } from './_components/item-library-browser';

export default function MessMenuLibraryPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. The Mess Menu
            Library drives the autocomplete used by every weekly menu editor
            — edits propagate platform-wide.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <ItemLibraryBrowser />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
