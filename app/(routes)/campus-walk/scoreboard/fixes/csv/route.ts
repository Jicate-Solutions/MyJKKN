// app/(routes)/campus-walk/scoreboard/fixes/csv/route.ts
// ============================================================================
// GET /campus-walk/scoreboard/fixes/csv — the fixes board's department totals
// as a CSV, for the IQAC file (Director, 2026-09-30).
//
// Same gate (gateFixesBoard), same reads and the same builder as the board
// page, so the download can never show more than the screen. The builder
// returns department rows only — no person is loaded to build it — and
// fixBoardToCsv() writes exactly those rows plus the all-departments total.
//
// A refusal is a plain-text 403 with the reason, never a redirect (rule #27).
// ============================================================================

import { NextResponse } from 'next/server';
import { buildFixBoard, fixBoardToCsv, isVerifiedClosure } from '@/lib/campus-walk/scoreboard';
import {
  adminClient,
  gateFixesBoard,
  loadStaffDepartments,
  loadTaskStars,
  loadWalkTasks,
  resolveCampusOpsProjectId
} from '../../_lib/scoreboard-page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function plain(text: string, status: number) {
  return new NextResponse(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function GET() {
  const gate = await gateFixesBoard();
  if (!gate.ok) return plain(`${gate.heading}. ${gate.reason}`, gate.heading.includes('signed in') ? 401 : 403);

  const admin = adminClient();
  const projectId = await resolveCampusOpsProjectId(admin);
  if (!projectId) {
    return plain('Campus Operations is not set up yet, so there is nothing to download.', 404);
  }

  let csv: string;
  try {
    const now = new Date();
    const tasks = await loadWalkTasks(admin, projectId);
    const staffIndex = await loadStaffDepartments(
      admin,
      tasks.map((t) => t.owner_staff_id).filter((id): id is string => Boolean(id))
    );
    const stars = await loadTaskStars(
      admin,
      tasks.filter(isVerifiedClosure).map((t) => t.id)
    );
    csv = fixBoardToCsv(buildFixBoard(tasks, staffIndex, now, stars));
  } catch {
    return plain('We could not read the campus jobs just now. Please try again in a moment.', 502);
  }

  const day = new Date().toISOString().slice(0, 10);
  // A byte-order mark so Excel opens the file as UTF-8 (department names can
  // carry non-ASCII characters).
  return new NextResponse(`﻿${csv}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="campus-fixes-by-department-${day}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
}
