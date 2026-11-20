'use client';
import { TicketsList } from '@/features/support/TicketsList';
import { useAdmin, useAdminMe } from '@/features/admin/hooks/AdminSession';
export default function TicketsPage() {
  const { call, generation } = useAdmin();
  const me = useAdminMe();
  return (
    <TicketsList
      key={me.userId + ':' + generation}
      admin
      call={call}
      actorKey={me.userId + ':' + generation}
    />
  );
}
