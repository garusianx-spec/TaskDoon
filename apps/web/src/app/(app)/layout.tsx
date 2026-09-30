import type { ReactNode } from 'react';
import { WorkspaceApp } from '@/store/WorkspaceApp';

/** Every workspace route: feed, tasks, chats, calendar, notes, directory, settings, invitations. */
export default function WorkspaceAppLayout({ children }: { readonly children: ReactNode }) {
  return <WorkspaceApp>{children}</WorkspaceApp>;
}
