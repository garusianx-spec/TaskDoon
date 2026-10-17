import type { ReactNode } from 'react';
import { SiteNavigation } from '@/components/admin/site/SiteNavigation';
import '@/components/marketing/marketing.css';

export default function SiteAdminLayout({ children }: { children: ReactNode }) {
  return <><SiteNavigation />{children}</>;
}
