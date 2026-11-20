import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { SupportSession } from '@/features/support/SupportSession';
export const metadata: Metadata = { title: 'پشتیبانی', robots: { index: false, follow: false } };
export default function SupportLayout({ children }: { children: ReactNode }) {
  return <SupportSession>{children}</SupportSession>;
}
