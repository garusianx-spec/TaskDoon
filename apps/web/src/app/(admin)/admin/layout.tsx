import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminSession } from '@/features/admin/hooks/AdminSession';
import { AdminGuard } from '@/components/layout/AdminGuard';

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
      <AdminGuard>{children}</AdminGuard>
    </AdminSession>
  );
}
