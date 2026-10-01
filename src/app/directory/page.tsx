'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DepartmentId, RoleId } from '@/types';
import { USERS } from '@/data/workspace';
import { DEPARTMENTS, ROLES, roleLabel } from '@/data/reference';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AppShell } from '@/components/layout/AppShell';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { Avatar, Badge, Button, EmptyState, Input, Select, Tooltip } from '@/components/ui';
import { CallIcon, MessagesIcon, PeopleIcon, SearchIcon, SmsIcon, UserAddIcon } from '@/components/icons';

type DepartmentFilter = DepartmentId | 'all';
type RoleFilter = RoleId | 'all';

export default function DirectoryPage() {
  const { dispatch, currentUser } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<DepartmentFilter>('all');
  const [role, setRole] = useState<RoleFilter>('all');

  const members = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return USERS.filter((user) => {
      if (department !== 'all' && user.department !== department) return false;
      if (role !== 'all' && user.role !== role) return false;
      if (!normalised) return true;
      return `${user.fullName} ${user.jobTitle} ${user.email}`.toLowerCase().includes(normalised);
    });
  }, [query, department, role]);

  /**
   * Opens (or starts) the direct thread with a colleague and lands on it with the composer
   * focused, so the action ends where the user intended rather than on a chat list.
   */
  const openDirectMessage = (userId: string) => {
    dispatch({ type: 'open-direct-message', userId, currentUserId: currentUser.id });
    router.push('/chats');
  };

  return (
    <AppShell>
      <div className="scrollbar-thin h-full overflow-y-auto">
        <header className="border-b border-secondary bg-surface px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <h1 className="text-heading-sm font-bold text-fg-primary">اعضای سازمان</h1>
              <span className="numeric text-caption text-fg-tertiary">
                {`${formatCount(USERS.length)} نفر در ${formatCount(DEPARTMENTS.length)} دپارتمان`}
              </span>
            </div>
            <Button className="ms-auto" iconStart={<UserAddIcon size={18} />}>
              دعوت همکار
            </Button>
          </div>
        </header>

        <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem]">
            <Input
              label="جستجوی عضو"
              hideLabel
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستجوی نام، سمت یا ایمیل…"
              iconStart={<SearchIcon size={18} />}
            />
            <Select
              label="دپارتمان"
              value={department}
              onValueChange={setDepartment}
              options={[
                { value: 'all' as const, label: 'همه دپارتمان‌ها' },
                ...DEPARTMENTS.map((entry) => ({ value: entry.id, label: entry.name })),
              ]}
            />
            <Select
              label="نقش"
              value={role}
              onValueChange={setRole}
              options={[
                { value: 'all' as const, label: 'همه نقش‌ها' },
                ...ROLES.map((entry) => ({ value: entry.id, label: entry.name })),
              ]}
            />
          </div>

          {members.length === 0 ? (
            <EmptyState
              icon={<PeopleIcon size={26} />}
              title="عضوی با این مشخصات پیدا نشد"
              description="فیلتر دپارتمان یا نقش را تغییر دهید."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {members.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-col gap-3 rounded-xl border border-secondary bg-surface p-4 shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={user.fullName}
                      initials={user.initials}
                      tone={user.avatarTone}
                      size="lg"
                      presence={user.presence}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-body font-bold text-fg-primary">{user.fullName}</span>
                      <span className="truncate text-caption text-fg-tertiary">{user.jobTitle}</span>
                      <span className="truncate text-micro text-fg-quaternary">
                        {DEPARTMENTS.find((entry) => entry.id === user.department)?.name}
                      </span>
                    </div>

                    {user.id !== currentUser.id && (
                      <Tooltip content={`ارسال پیام به ${user.fullName}`}>
                        <button
                          type="button"
                          onClick={() => openDirectMessage(user.id)}
                          aria-label={`ارسال پیام به ${user.fullName}`}
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg border border-secondary bg-surface text-fg-tertiary shadow-xs',
                            'transition-colors hover:border-brand hover:bg-brand-subtle hover:text-fg-brand',
                          )}
                        >
                          <MessagesIcon size={18} />
                        </button>
                      </Tooltip>
                    )}
                  </div>

                  <Badge tone={user.role === 'owner' ? 'brand' : 'neutral'} size="md" className="self-start">
                    {roleLabel(user.role)}
                  </Badge>

                  <Button
                    size="sm"
                    variant="secondary"
                    fullWidth
                    iconStart={<MessagesIcon size={15} />}
                    onClick={() => openDirectMessage(user.id)}
                    disabled={user.id === currentUser.id}
                  >
                    {user.id === currentUser.id ? 'حساب شما' : 'ارسال پیام'}
                  </Button>

                  <div className="flex flex-col gap-1.5 border-t border-secondary pt-3">
                    <a
                      href={`mailto:${user.email}`}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-1.5 py-1 text-caption text-fg-secondary transition-colors hover:bg-hover',
                      )}
                    >
                      <SmsIcon size={16} className="shrink-0 text-fg-quaternary" />
                      <span className="latin-inline truncate">{user.email}</span>
                    </a>
                    <span className="flex items-center gap-2 px-1.5 py-1 text-caption text-fg-secondary">
                      <CallIcon size={16} className="shrink-0 text-fg-quaternary" />
                      <span className="numeric truncate">{user.phone}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
