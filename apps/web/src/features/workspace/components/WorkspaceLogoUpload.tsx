'use client';

import { useState } from 'react';
import { FileUploader } from '@/components/shared/FileUploader';
import { Button } from '@/components/ui';
import { ImageIcon,TrashIcon } from '@/components/icons';
import { problemMessage } from '@/lib/api-problem';
import { WORKSPACE_ICON_TYPES,workspaceIconError } from '@/features/workspace/lib/workspace-icon';

export interface WorkspaceLogoUploadProps {
  readonly hasIcon: boolean;
  readonly onSave: (file: File | null) => Promise<void>;
}

export function WorkspaceLogoUpload({ hasIcon, onSave }: WorkspaceLogoUploadProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (file: File | null) => {
    if (busy) return;
    setNotice(null);
    const invalid = file ? workspaceIconError(file) : undefined;
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      await onSave(file);
      setNotice(file ? 'تصویر فضای کاری به‌روزرسانی شد.' : 'تصویر فضای کاری حذف شد.');
    } catch (failure) {
      setError(problemMessage(failure, 'به‌روزرسانی تصویر فضای کاری ممکن نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <FileUploader accept={WORKSPACE_ICON_TYPES.join(',')} loading={busy} icon={<ImageIcon size={14} />} onPick={(file) => void save(file)}>
          {hasIcon ? 'تغییر تصویر' : 'بارگذاری تصویر'}
        </FileUploader>
        {hasIcon && (
          <Button size="xs" variant="ghost" disabled={busy} iconStart={<TrashIcon size={14} />} onClick={() => void save(null)}>
            حذف تصویر
          </Button>
        )}
      </div>
      {error && <p className="text-caption text-status-blocked" role="alert">{error}</p>}
      {notice && <p className="text-caption text-status-done" role="status">{notice}</p>}
    </div>
  );
}
