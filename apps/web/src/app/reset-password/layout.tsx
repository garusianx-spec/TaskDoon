import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ResetPasswordLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
