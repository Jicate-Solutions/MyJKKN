/**
 * The reporter prompt box ("did our fix work?" / "is this still happening?")
 * must be mounted on the dashboard — the page people actually land on — for
 * every persona, inside a silent error boundary so a failure can never break
 * the dashboard. (Director 2026-09-16 19:17. Before this, only /my-bug-reports
 * showed it: 24 prompts drew 1 view in 20 hours.)
 *
 * The dashboard page is a server component with a dozen data fetches, so this
 * pins the mount structurally rather than rendering it: the import, the mount
 * inside DashboardErrorBoundary mode='silent', and that it sits OUTSIDE every
 * persona branch (isStudent / isDirector / …) so no role is left out.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'app', '(routes)', 'dashboard', 'page.tsx'), 'utf8');

describe('dashboard mounts the reporter prompt box for every persona', () => {
  it('imports the shared component (no copy)', () => {
    expect(src).toMatch(/import \{ FixedForYouPrompts \} from '@\/app\/\(routes\)\/my-bug-reports\/_components\/fixed-for-you-prompts'/);
  });

  it('mounts it inside a SILENT error boundary', () => {
    const m = src.match(/<DashboardErrorBoundary label='Reporter prompts' mode='silent'>[\s\S]*?<FixedForYouPrompts \/>[\s\S]*?<\/DashboardErrorBoundary>/);
    expect(m).not.toBeNull();
  });

  it('is not gated on a persona flag', () => {
    const idx = src.indexOf('<FixedForYouPrompts />');
    const before = src.slice(Math.max(0, idx - 600), idx);
    // the nearest enclosing conditional must not be a persona check
    expect(before).not.toMatch(/\{(isStudent|isDirector|isFaculty|isHod|isPrincipal|isAccounts|isCounselor|isLimited)\s*&&\s*\($/m);
    expect(before).not.toMatch(/\{(isStudent|isDirector|isFaculty|isHod|isPrincipal|isAccounts|isCounselor|isLimited)\s*&&[^}]*<FixedForYouPrompts/);
  });
});
