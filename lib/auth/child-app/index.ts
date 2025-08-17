/**
 * Parent App Authentication Bridge for Child Applications
 * 
 * This module provides complete authentication integration with the parent MyJKKN application.
 * Child applications can use these utilities to authenticate users through the parent app
 * instead of implementing their own authentication.
 */

// Core authentication service
export {
  parentAuth,
  ParentAuthService,
  type ParentAppUser,
  type AuthSession,
  type TokenResponse,
  type ValidationResponse,
} from './parent-auth-service';

// React context and hooks
export {
  AuthProvider,
  AuthContext,
  useAuth,
  useIsAuthenticated,
  useCurrentUser,
  usePermission,
  useRole,
  useAnyRole,
  useAuthLoading,
  useAuthError,
  useSession,
  type AuthContextType,
  type AuthProviderProps,
} from './auth-context';

// Protected route components
export {
  ProtectedRoute,
  withAuth,
  RequireAuth,
  RequirePermission,
  RequireRole,
  GuestOnly,
  ConditionalAuth,
} from './protected-route';

// Session management
export {
  SessionManager,
  ActivityTracker,
  getSessionManager,
  getActivityTracker,
  useSessionManager,
} from './session-manager';

/**
 * Quick Start Guide
 * 
 * 1. Wrap your app with AuthProvider:
 * 
 * ```tsx
 * import { AuthProvider } from '@/lib/auth/child-app';
 * 
 * function App() {
 *   return (
 *     <AuthProvider
 *       autoValidate={true}
 *       autoRefresh={true}
 *       onSessionExpired={() => console.log('Session expired')}
 *     >
 *       <YourApp />
 *     </AuthProvider>
 *   );
 * }
 * ```
 * 
 * 2. Use authentication in components:
 * 
 * ```tsx
 * import { useAuth, useCurrentUser } from '@/lib/auth/child-app';
 * 
 * function Profile() {
 *   const { login, logout } = useAuth();
 *   const user = useCurrentUser();
 * 
 *   if (!user) {
 *     return <button onClick={() => login()}>Login</button>;
 *   }
 * 
 *   return (
 *     <div>
 *       <p>Welcome, {user.full_name}!</p>
 *       <button onClick={() => logout()}>Logout</button>
 *     </div>
 *   );
 * }
 * ```
 * 
 * 3. Protect routes:
 * 
 * ```tsx
 * import { RequireAuth, RequireRole } from '@/lib/auth/child-app';
 * 
 * function App() {
 *   return (
 *     <Routes>
 *       <Route path="/public" element={<PublicPage />} />
 *       <Route path="/dashboard" element={
 *         <RequireAuth>
 *           <Dashboard />
 *         </RequireAuth>
 *       } />
 *       <Route path="/admin" element={
 *         <RequireRole role="admin">
 *           <AdminPanel />
 *         </RequireRole>
 *       } />
 *     </Routes>
 *   );
 * }
 * ```
 * 
 * 4. Use session management:
 * 
 * ```tsx
 * import { useEffect } from 'react';
 * import { getSessionManager, getActivityTracker } from '@/lib/auth/child-app';
 * 
 * function App() {
 *   useEffect(() => {
 *     // Start session management
 *     const sessionManager = getSessionManager({
 *       autoRefresh: true,
 *       onSessionExpiring: () => {
 *         console.log('Session expiring soon');
 *       },
 *     });
 *     sessionManager.start();
 * 
 *     // Track user activity
 *     const activityTracker = getActivityTracker({
 *       onInactive: () => {
 *         console.log('User inactive');
 *       },
 *     });
 *     activityTracker.start();
 * 
 *     return () => {
 *       sessionManager.stop();
 *       activityTracker.stop();
 *     };
 *   }, []);
 * 
 *   return <YourApp />;
 * }
 * ```
 */

// Environment variables required:
// - NEXT_PUBLIC_PARENT_APP_URL: URL of the parent MyJKKN app
// - NEXT_PUBLIC_CHILD_APP_ID: Your child app's ID
// - NEXT_PUBLIC_CHILD_APP_API_KEY: Your child app's API key