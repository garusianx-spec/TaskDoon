'use client';

import Link from 'next/link';
import type { PlatformConversationView } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { CONVERSATION_KINDS, CONVERSATION_ROLES } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Badge, RelativeTime } from '@/components/ui';
import { Loaded, Panel, TABLE, TableFrame, TD, TH } from './AdminUi';

/** Every conversation a person is or was in, across workspaces; each opens in the inspector. */
export function ConversationList({ userId, title = 'گفتگوها و گروه‌ها' }: { readonly userId: string; readonly title?: string }) {
  const conversations = useAdminLoad(userId, () => adminApi.conversations(userId));
  return (
    <Panel id="conversations" title={title}>
      <Loaded load={conversations} empty={(data) => data.length === 0}>
        {(data) => (
          <TableFrame label="فهرست گفتگوها">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>گفتگو</th>
                  <th className={TH}>نوع</th>
                  <th className={TH}>ورک‌اسپیس</th>
                  <th className={TH}>اعضا</th>
                  <th className={TH}>پیام‌ها</th>
                  <th className={TH}>آخرین پیام</th>
                  <th className={TH}>نقش این کاربر</th>
                </tr>
              </thead>
              <tbody>
                {data.map((conversation) => (
                  <ConversationRow key={conversation.id} conversation={conversation} userId={userId} />
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </Loaded>
    </Panel>
  );
}

function ConversationRow({ conversation, userId }: { readonly conversation: PlatformConversationView; readonly userId: string }) {
  return (
    <tr>
      <td className={TD}>
        <Link href={`/admin/conversations/${conversation.id}?targetUserId=${userId}`} className="font-semibold text-fg-brand hover:underline">
          {conversation.title}
        </Link>
        <div className="mt-1 flex flex-wrap gap-1">
          {conversation.projectName && <Badge size="sm">پروژه: {conversation.projectName}</Badge>}
          {conversation.kind === 'channel' && <Badge size="sm">{conversation.isPrivate ? 'خصوصی' : 'عمومی'}</Badge>}
          {conversation.archived && <Badge tone="warning" size="sm">بایگانی</Badge>}
        </div>
      </td>
      <td className={TD}>{CONVERSATION_KINDS[conversation.kind]}</td>
      <td className={TD}>{conversation.workspaceName}</td>
      <td className={TD}>{toPersianDigits(conversation.memberCount)}</td>
      <td className={TD}>{toPersianDigits(conversation.messageCount)}</td>
      <td className={TD}>{conversation.lastMessageAt ? <RelativeTime iso={conversation.lastMessageAt} /> : '—'}</td>
      <td className={TD}>
        {conversation.leftAt ? (
          <Badge tone="neutral" size="sm">
            خارج‌شده
          </Badge>
        ) : (
          (CONVERSATION_ROLES[conversation.role] ?? conversation.role)
        )}
      </td>
    </tr>
  );
}
