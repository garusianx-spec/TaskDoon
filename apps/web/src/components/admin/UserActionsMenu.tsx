'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlatformUserSummary } from '@taskin/contracts';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useNamespacedId } from '@/hooks/useId';
import { IconButton, MenuItem, MenuList } from '@/components/ui';
import { CheckCircleIcon, KeyIcon, LockIcon, MonitorIcon, MoreHorizontalIcon } from '@/components/icons';

export type UserAction = 'sessions' | 'suspend' | 'unsuspend' | 'require-reset' | 'lift-reset';

const PANEL_WIDTH = 248;
const GAP = 6;

/**
 * The ⋯ menu of one person in the directory. The panel is fixed to the viewport (in a portal)
 * rather than anchored inside the table, whose horizontal scroll would clip it. Same contract
 * as `Popover`: Escape closes and returns focus, an outside press, a scroll or a resize closes,
 * focus moves to the first item; arrow keys move between items (`MenuList`).
 *
 * Nobody moderates their own account, a deleted one cannot be moderated, and a platform admin
 * cannot be suspended here (the server refuses all three too).
 */
export function UserActionsMenu({ user, selfId, onAction }: { readonly user: PlatformUserSummary; readonly selfId: string; readonly onAction: (action: UserAction) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useNamespacedId('user-actions-');
  const open = anchor !== null;
  const label = `اقدام‌های ${user.fullName}`;

  const close = useCallback((refocus: boolean) => {
    setAnchor(null);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const toggle = () => {
    if (open) close(false);
    else setAnchor(triggerRef.current?.getBoundingClientRect() ?? null);
  };

  // Under the button, or above it when the viewport has no room below; its inline-end edge on the button's.
  useIsomorphicLayoutEffect(() => {
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const height = panel.offsetHeight;
    const below = anchor.bottom + GAP;
    panel.style.top = `${below + height > window.innerHeight - 8 && anchor.top - GAP - height > 8 ? anchor.top - GAP - height : below}px`;
    panel.style.left = `${Math.min(Math.max(8, anchor.left), window.innerWidth - PANEL_WIDTH - 8)}px`;
  }, [anchor]);

  const refs = useMemo(() => [triggerRef, panelRef], []);
  useOnClickOutside(refs, () => close(false), open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    const onMove = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close]);

  const self = user.id === selfId;
  const deleted = user.status === 'deleted';
  const suspended = user.status === 'suspended';
  const choose = (action: UserAction) => {
    close(true);
    onAction(action);
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        label={label}
        icon={<MoreHorizontalIcon size={16} />}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      />
      {anchor &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            dir="rtl"
            style={{ top: anchor.bottom + GAP, left: anchor.left, width: PANEL_WIDTH }}
            className="surface-floating fixed z-popover animate-scale-in p-1.5 outline-none"
          >
            <MenuList>
              <MenuItem icon={<MonitorIcon size={16} />} onSelect={() => choose('sessions')}>
                مشاهده نشست‌های فعال
              </MenuItem>
              {suspended ? (
                <MenuItem icon={<CheckCircleIcon size={16} />} disabled={self || deleted} onSelect={() => choose('unsuspend')}>
                  رفع تعلیق
                </MenuItem>
              ) : (
                <MenuItem icon={<LockIcon size={16} />} tone="danger" disabled={self || deleted || user.isPlatformAdmin} onSelect={() => choose('suspend')}>
                  {self ? 'تعلیق کاربر (حساب خودتان)' : user.isPlatformAdmin ? 'تعلیق کاربر (مدیر پلتفرم)' : 'تعلیق کاربر'}
                </MenuItem>
              )}
              {user.passwordResetRequired ? (
                <MenuItem icon={<KeyIcon size={16} />} disabled={self || deleted} onSelect={() => choose('lift-reset')}>
                  لغو اجبار تغییر رمز
                </MenuItem>
              ) : (
                <MenuItem icon={<KeyIcon size={16} />} disabled={self || deleted} onSelect={() => choose('require-reset')}>
                  {self ? 'اجبار به تغییر رمز عبور (حساب خودتان)' : 'اجبار به تغییر رمز عبور'}
                </MenuItem>
              )}
            </MenuList>
          </div>,
          document.body,
        )}
    </>
  );
}
