import type { ReactNode } from 'react';
import { SiteNavigation } from '@/features/admin/components/site/SiteNavigation';
import '@/features/marketing/components/marketing.css';

export default function SiteAdminLayout({ children }: { children: ReactNode }) {
  return <><SiteNavigation />{children}</>;
}
