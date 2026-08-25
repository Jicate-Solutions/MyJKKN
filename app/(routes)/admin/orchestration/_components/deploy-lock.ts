'use client';

// Deploy fires ONE global Vercel production deploy hook — it isn't scoped to
// a module the way Merge is. If two module cards' Deploy buttons both fired
// while a request was already in flight, that would double-trigger a
// production rebuild. This is a plain module-singleton store (not a React
// Context) so every ModuleCard instance on the page shares one flag without
// needing a Provider wired in from page.tsx — out of scope here, we own
// only _components/**.

import { useSyncExternalStore } from 'react';

let deployInFlight = false;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

export function setDeployInFlight(value: boolean) {
  if (deployInFlight === value) return;
  deployInFlight = value;
  emitChange();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return deployInFlight;
}

function getServerSnapshot() {
  return false;
}

export function useDeployInFlight(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
