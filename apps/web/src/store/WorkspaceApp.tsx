import type { ReactNode } from 'react';
import { OverlayProvider } from '@/components/overlays/OverlayProvider';
import { WorkspaceProvider } from './WorkspaceProvider';

/** The workspace app around a page: its store (and, live, the sign-in gate) and the global overlays. */
export function WorkspaceApp({ children }: { readonly children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <OverlayProvider>{children}</OverlayProvider>
    </WorkspaceProvider>
  );
}
