import { redirect } from 'next/navigation';

/**
 * Redirect /login to /auth/login
 * This ensures backward compatibility for users who type /login directly
 */
export default function LoginRedirect() {
  redirect('/auth/login');
}
