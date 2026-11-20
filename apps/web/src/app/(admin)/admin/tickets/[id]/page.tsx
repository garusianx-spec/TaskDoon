'use client';
import { useParams } from 'next/navigation';
import { TicketThread } from '@/features/support/TicketThread';
import { useAdmin, useAdminMe } from '@/features/admin/hooks/AdminSession';
export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { call, generation } = useAdmin();
  const me = useAdminMe();
  return (
    <TicketThread
      key={me.userId + ':' + generation + id}
      id={id}
      admin
      call={call}
      actorKey={me.userId + ':' + generation}
    />
  );
}
