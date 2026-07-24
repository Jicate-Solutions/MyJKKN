// lib/id-cards/responses.ts
// Phase 1C — uniform response envelopes for the id-card subsystem.
//
// Standing rule (memory-locked 2026-05-07): list endpoints return `{ data: T[] }`.
// We extend that to ALL responses for this subsystem:
//   success → { data: T }
//   error   → { error: { message, code } }

import { NextResponse } from 'next/server';

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}
