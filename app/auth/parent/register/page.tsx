import { Metadata } from 'next';
import { ParentRegisterClient } from './parent-register-client';

export const metadata: Metadata = {
  title: 'Parent Registration | MyJKKN',
  description: 'Register for the parent portal to track your child\'s academic progress',
};

export default function ParentRegisterPage() {
  return <ParentRegisterClient />;
}
