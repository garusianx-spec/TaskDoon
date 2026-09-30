import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminSession } from '@/admin/AdminSession';
import { AdminGate } from '@/components/admin/AdminGate';

export const metadata: Metadata = {
  title: 'پنل مدیریت پلتفرم',
  robots: { index: false, follow: false },
};

/**
 * The platform super admin (phase 1), beside the workspace app rather than inside it: its own
 * session gate and navigation. The API decides who gets in; this shell only mirrors its answers.
 */
export default function AdminLayout({ children }: { readonly children: ReactNode }) {
  return (
    <AdminSession>
      <AdminGate>{children}</AdminGate>
    </AdminSession>
  );
}
