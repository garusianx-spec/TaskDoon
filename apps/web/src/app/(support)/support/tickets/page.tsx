'use client';
import { TicketsList } from '@/features/support/TicketsList';
import { useSupportUser } from '@/features/support/SupportSession';
export default function TicketsPage() {
  const user = useSupportUser();
  return <TicketsList key={user.id} actorKey={user.id} />;
}
