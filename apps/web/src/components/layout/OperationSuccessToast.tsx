'use client';

import { useEffect } from 'react';
import { IconButton } from '@/components/ui';
import { CheckCircleIcon, CloseIcon } from '@/components/icons';
import { useWorkspace } from '@/store/WorkspaceProvider';

export function OperationSuccessToast() {
  const { operationToast, dismissOperationToast } = useWorkspace();
  useEffect(() => {
    if (!operationToast) return;
    const timer = setTimeout(() => dismissOperationToast(operationToast.id), 6000);
    return () => clearTimeout(timer);
  }, [operationToast, dismissOperationToast]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-toast flex justify-center px-3 sm:top-5 sm:px-6">
      <div
        className={
          operationToast
            ? 'flex max-w-lg items-start gap-2.5 rounded-xl border border-secondary bg-surface p-3 shadow-lg'
            : 'contents'
        }
      >
        {operationToast && <CheckCircleIcon size={20} className="mt-0.5 shrink-0 text-status-done" />}
        <p
          role="status"
          aria-atomic="true"
          className="min-w-0 flex-1 self-center break-words text-body-sm text-fg-primary"
        >
          {operationToast && <span key={operationToast.id}>{operationToast.text}</span>}
        </p>
        {operationToast && (
          <IconButton
            label="بستن پیام موفقیت"
            icon={<CloseIcon size={16} />}
            size="xs"
            variant="ghost"
            className="pointer-events-auto size-11 shrink-0"
            onClick={() => dismissOperationToast(operationToast.id)}
          />
        )}
      </div>
    </div>
  );
}
