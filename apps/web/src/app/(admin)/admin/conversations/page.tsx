'use client';

import { useState, type FormEvent } from 'react';
import type { PlatformUserSummary } from '@taskin/contracts';
import { adminApi } from '@/admin/api';
import { phoneLabel } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded, PageHeader, Panel } from '@/components/admin/AdminUi';
import { ConversationList } from '@/components/admin/ConversationList';
import { Button, Input } from '@/components/ui';
import { SearchIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

/** «رصد پیام‌ها و گروه‌ها»: find the person, then open any conversation they are or were in. */
export default function AdminConversationsPage() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState<string | null>(null);
  const [person, setPerson] = useState<PlatformUserSummary | null>(null);
  const found = useAdminLoad(search, () => adminApi.users({ q: search ?? '' }));

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const q = draft.trim();
    if (!q) return;
    setPerson(null);
    if (q === search) found.reload();
    setSearch(q);
  };

  return (
    <>
      <PageHeader title="رصد پیام‌ها و گروه‌ها" description="گفتگوهای مستقیم، گروه‌ها، کانال‌های خصوصی و کانال‌های پروژه، با فیلتر تاریخ، نوع پیام و فرستنده." />
      <Panel title="انتخاب کاربر">
        <form role="search" aria-label="جستجوی کاربر برای رصد گفتگوها" onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
          <Input
            containerClassName="min-w-[16rem] flex-1"
            label="نام، شماره موبایل یا ایمیل"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            iconStart={<SearchIcon size={16} />}
          />
          <Button type="submit">جستجو</Button>
        </form>
        {search !== null && (
          <div className="mt-4">
            <Loaded load={found} empty={(data) => data.items.length === 0}>
              {(data) => (
                <ul aria-label="کاربران یافت‌شده" className="flex flex-col gap-1">
                  {data.items.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        aria-pressed={person?.id === user.id}
                        onClick={() => setPerson(user)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-start transition-colors',
                          person?.id === user.id ? 'border-brand bg-brand-subtle' : 'border-secondary hover:bg-hover',
                        )}
                      >
                        <span className="text-body-sm font-semibold text-fg-primary">{user.fullName}</span>
                        <span dir="ltr" className="text-caption text-fg-tertiary">
                          {phoneLabel(user.phone)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Loaded>
          </div>
        )}
      </Panel>
      {person && <ConversationList key={person.id} userId={person.id} title={`گفتگوهای ${person.fullName}`} />}
    </>
  );
}
