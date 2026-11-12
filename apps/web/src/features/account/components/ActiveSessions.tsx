import type { LoginSession } from '@taskin/contracts';
import { Badge,Button,IconButton,RelativeTime } from '@/components/ui';
import { LogoutIcon,MobileIcon,MonitorIcon } from '@/components/icons';

export function ActiveSessions({ sessions, onRevokeSession, onRevokeOtherSessions }: {
  readonly sessions: readonly LoginSession[];
  readonly onRevokeSession: (sessionId: string) => void;
  readonly onRevokeOtherSessions: () => void;
}) {
  const others = sessions.filter((session) => !session.current);
  return (
  <section aria-labelledby="security-sessions" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <h3 id="security-sessions" className="text-title-sm font-semibold text-fg-primary">
        نشست‌های فعال
      </h3>
      {others.length > 0 && (
        <Button
          size="xs"
          variant="secondary"
          className="ms-auto"
          iconStart={<LogoutIcon size={14} />}
          onClick={onRevokeOtherSessions}
        >
          خروج از همه نشست‌های دیگر
        </Button>
      )}
    </div>
    <ul className="flex flex-col gap-2">
      {sessions.map((session) => {
        const DeviceIcon = /اندروید|آی‌اواس|موبایل/.test(session.device) ? MobileIcon : MonitorIcon;
        return (
          <li
            key={session.id}
            className="flex items-center gap-3 rounded-lg border border-secondary bg-surface px-3 py-2.5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-secondary">
              <DeviceIcon size={18} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate text-body-sm font-semibold text-fg-primary">{session.device}</span>
                {session.current && (
                  <Badge tone="success" size="sm" dot>
                    همین دستگاه
                  </Badge>
                )}
              </span>
              <span className="numeric truncate text-micro text-fg-tertiary">
                {`${session.location}، `}
                {session.current ? 'فعال در حال حاضر' : <RelativeTime iso={session.lastActiveAt} />}
              </span>
            </span>
            {!session.current && (
              <IconButton
                label={`خروج از نشست ${session.device}`}
                icon={<LogoutIcon size={16} />}
                size="sm"
                className="hover:text-status-blocked"
                onClick={() => onRevokeSession(session.id)}
              />
            )}
          </li>
        );
      })}
    </ul>
  </section>
  );
}
