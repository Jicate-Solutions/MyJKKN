import { redirect } from 'next/navigation';

export default function GenerateReceiptRedirect() {
  redirect('/billing/receipts/new');
}
