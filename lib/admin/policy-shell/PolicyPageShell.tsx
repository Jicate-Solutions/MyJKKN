// ============================================================================
// PolicyPageShell — page wrapper used by all 3 policy-shell shapes.
// Created: 2026-05-07. Companion: docs/architecture/policy-page-pattern.md.
//
// Wraps the SuperAdminOnly / AdminPermissionGuard gate, the ContentLayout
// header, and a Director-friendly explainer banner. The shape primitives
// (CascadeStepList / SettingsPanel / LookupTable) render INSIDE this shell —
// pages compose: <PolicyPageShell><Cascade/></PolicyPageShell>.
// ============================================================================

import type { ReactNode } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  AdminPermissionGuard,
  SuperAdminOnly,
} from '@/components/auth/admin-permission-guard';

import type { PolicyPermission } from './types';

interface PolicyPageShellProps {
  /** Page header text. Plain English, not the table name. */
  title: string;
  /**
   * Plain English explainer rendered above the page content. Should describe
   * (a) what this page configures and (b) what changes when Director edits it.
   * Example: "When a new lead comes in, MyJKKN tries to assign a counselor in
   * the order shown below. The first match wins."
   */
  explainer?: ReactNode;
  /** Permission level required to view/edit. Default: 'super_admin'. */
  permission?: PolicyPermission;
  /** Optional custom permission-denied message. */
  permissionDeniedMessage?: ReactNode;
  /** Page content (typically one of the shape primitives). */
  children: ReactNode;
}

const DEFAULT_DENIED_MESSAGE = (
  <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
    This page is restricted. Configuration here drives production behavior — only authorized administrators can view or edit.
  </div>
);

export function PolicyPageShell({
  title,
  explainer,
  permission = 'super_admin',
  permissionDeniedMessage,
  children,
}: PolicyPageShellProps) {
  const fallback = (
    <ContentLayout title={title}>
      {permissionDeniedMessage ?? DEFAULT_DENIED_MESSAGE}
    </ContentLayout>
  );

  const body = (
    <ContentLayout title={title}>
      <div className="space-y-6">
        {explainer && (
          <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
            {explainer}
          </div>
        )}
        {children}
      </div>
    </ContentLayout>
  );

  if (permission === 'super_admin') {
    return <SuperAdminOnly fallback={fallback}>{body}</SuperAdminOnly>;
  }

  return (
    <AdminPermissionGuard fallback={fallback}>{body}</AdminPermissionGuard>
  );
}
