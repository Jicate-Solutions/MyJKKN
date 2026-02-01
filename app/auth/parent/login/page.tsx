import { Metadata } from 'next';
import { ParentLoginClient } from './parent-login-client';

export const metadata: Metadata = {
  title: 'Parent Login | MyJKKN',
  description: 'Login to the parent portal to view your child\'s academic progress',
};

export default function ParentLoginPage() {
  return <ParentLoginClient />;
}
