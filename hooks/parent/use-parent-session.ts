/**
 * Parent Portal — re-export of the session hook so consumers can import from the
 * conventional hooks/parent/* location (the implementation lives with the
 * provider to keep the React context in a single module).
 */
export {
  useParentSession,
  ParentSessionProvider,
} from '@/components/parent/parent-session-provider';
