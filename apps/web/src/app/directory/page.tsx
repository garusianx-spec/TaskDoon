'use client';

import { useMemo, useState } from 'react';
import type { DepartmentId, RoleId, User } from '@taskin/contracts';
import { DEPARTMENTS, ROLES, roleLabel } from '@/data/reference';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { PendingInvitationRow } from '@/components/directory/InviteMemberModal';
import { RemoveMemberDialog } from '@/components/directory/RemoveMemberDialog';
import { Avatar, Badge, Button, EmptyState, Input, Select } from '@/components/ui';
import { CallIcon, PeopleIcon, SearchIcon, SmsIcon, TrashIcon, UserAddIcon } from '@/components/icons';

type DepartmentFilter = DepartmentId | 'all';
type RoleFilter = RoleId | 'all';

export default function DirectoryPage() {
  return (
    <AppShell>
      <DirectoryContent />
    </AppShell>
  );
}

function DirectoryContent() {
  const { state, dispatch, currentUser, activeWorkspace, isWorkspaceOwner } = useWorkspace();
  const live = useLive();
  const { open } = useOverlays();
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState<User | null>(null);

  // Removing someone needs members:delete (the owner's alone by default) and a higher rank than theirs.
  const rankOf = (roleId: RoleId) => ROLES.find((entry) => entry.id === roleId)?.rank ?? Number.MAX_SAFE_INTEGER;
  const myRank = isWorkspaceOwner ? 0 : rankOf(currentUser.role);
  const canRemoveMembers = isWorkspaceOwner || state.permissions[currentUser.role].members.delete;
  const canRemove = (user: User) =>
    canRemoveMembers && user.id !== currentUser.id && user.id !== activeWorkspace.ownerId && (isWorkspaceOwner || rankOf(user.role) > myRank);
  const [department, setDepartment] = useState<DepartmentFilter>('all');
  const [role, setRole] = useState<RoleFilter>('all');

  const members = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    // The signed-in member's presence is edited from their profile, so it comes from state.
    return state.users.map((user) => (user.id === currentUser.id ? currentUser : user)).filter((user) => {
      if (department !== 'all' && user.department !== department) return false;
      if (role !== 'all' && user.role !== role) return false;
      if (!normalised) return true;
      return `${user.fullName} ${user.jobTitle} ${user.email}`.toLowerCase().includes(normalised);
    });
  }, [state.users, query, department, role, currentUser]);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <header className="border-b border-secondary bg-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <h1 className="text-heading-sm font-bold text-fg-primary">اعضای سازمان</h1>
            <span className="numeric text-caption text-fg-tertiary">
              {`${formatCount(state.users.length)} نفر در ${formatCount(DEPARTMENTS.length)} دپارتمان`}
            </span>
          </div>
          <Button
            className="ms-auto"
            iconStart={<UserAddIcon size={18} />}
            aria-haspopup="dialog"
            onClick={() => open({ kind: 'invite-member' })}
          >
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

        {state.invitations.length > 0 && (
          <section aria-labelledby="pending-invitations" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 id="pending-invitations" className="text-title-sm font-semibold text-fg-primary">
                دعوت‌های در انتظار پذیرش
              </h2>
              <Badge tone="neutral" size="sm" numeric>
                {formatCount(state.invitations.length)}
              </Badge>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {state.invitations.map((invitation) => (
                <PendingInvitationRow
                  key={invitation.id}
                  invitation={invitation}
                  onRevoke={(invitationId) => dispatch({ type: 'revoke-invitation', invitationId })}
                />
              ))}
            </ul>
          </section>
        )}

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
                </div>

                <Badge tone={user.role === 'owner' ? 'brand' : 'neutral'} size="md" className="self-start">
                  {roleLabel(user.role)}
                </Badge>

                {canRemove(user) && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="self-start"
                    iconStart={<TrashIcon size={14} />}
                    aria-label={`حذف ${user.fullName} از فضای کاری`}
                    onClick={() => setRemoving(user)}
                  >
                    حذف از فضای کاری
                  </Button>
                )}

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

      <RemoveMemberDialog
        member={removing}
        requirePassword={live !== null}
        onClose={() => setRemoving(null)}
        onConfirm={(password) => {
          if (removing) dispatch({ type: 'remove-member', userId: removing.id, ...(password ? { password } : {}) });
          setRemoving(null);
        }}
      />
    </div>
  );
}
