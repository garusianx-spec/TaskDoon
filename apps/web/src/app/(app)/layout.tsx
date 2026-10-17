import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { WorkspaceApp } from '@/store/WorkspaceApp';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Every workspace route: feed, tasks, chats, calendar, notes, directory, settings, invitations. */
export default function WorkspaceAppLayout({ children }: { readonly children: ReactNode }) {
  return <WorkspaceApp>{children}</WorkspaceApp>;
}
